from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..mail import send_auth_mail
from ..models import AuthCode, AuthSession, CATEGORIES, Category, User, now
from ..security import (COOKIE, authenticated, clear_refresh_cookie, create_session,
                        new_secret, read_access_token, session_response, set_refresh_cookie, token_hash)
from ..validation import APIError, email, password, payload, text

bp = Blueprint("auth", __name__)
GENERIC_REGISTER = "If this address can be registered, you will receive a confirmation email."
GENERIC_RESET = "If an account exists for this email, you will receive a password reset link."
# Equal-cost password work when an address does not exist.
DUMMY_HASH = generate_password_hash("not-a-real-account-password", method="scrypt")


@bp.before_request
def verify_origin():
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("Origin") not in current_app.config["CORS_ORIGINS"]:
            raise APIError("This request origin is not allowed.", "invalid_origin", 403)


def issue_code(user, purpose):
    secret = new_secret()
    db.session.execute(update(AuthCode).where(
        AuthCode.user_id == user.id, AuthCode.purpose == purpose, AuthCode.consumed_at.is_(None)
    ).values(consumed_at=now()))
    db.session.add(AuthCode(user_id=user.id, token_hash=token_hash(secret), purpose=purpose,
                            expires_at=now() + (900 if purpose == "recovery" else 86400)))
    return secret


def deliver(user, code, purpose):
    try:
        send_auth_mail(user.email, code, purpose)
    except Exception:
        # Do not log SMTP payload, recipient, link or credentials.
        current_app.logger.error("Authentication email delivery failed.")
        raise APIError("Email delivery is temporarily unavailable. Please try again.", "mail_unavailable", 503) from None


@bp.post("/register")
@limiter.limit("10 per hour")
def register():
    body = payload(("displayName", "email", "password"))
    name, address, credential = text(body["displayName"], "name", 2, 60), email(body["email"]), password(body["password"])
    hashed = generate_password_hash(credential, method="scrypt")
    user = db.session.scalar(select(User).where(User.email == address))
    if user:
        if not user.email_confirmed:
            # The password chosen with the newest confirmation email wins.
            # Never let a pre-registration keep an unknown older credential.
            updated = db.session.execute(update(User).where(
                User.id == user.id, User.email_confirmed.is_(False)
            ).values(password_hash=hashed, display_name=name))
            # A confirmation racing this request may already have won. Never
            # overwrite credentials after that account has been confirmed.
            if updated.rowcount:
                db.session.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=now()))
                code = issue_code(user, "signup")
                deliver(user, code, "signup")
            db.session.commit()
        return jsonify(message=GENERIC_REGISTER), 202
    user = User(email=address, password_hash=hashed, display_name=name)
    db.session.add(user)
    try:
        db.session.flush()
        for identifier, category_name, icon, color, cents in CATEGORIES:
            db.session.add(Category(user_id=user.id, id=identifier, name=category_name, icon=icon,
                                    color=color, monthly_limit_cents=cents))
        code = issue_code(user, "signup")
        deliver(user, code, "signup")
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        # Concurrent registrations receive the same non-enumerating response.
    return jsonify(message=GENERIC_REGISTER), 202


@bp.post("/login")
@limiter.limit("20 per 15 minutes")
def login():
    body = payload(("email", "password"))
    address = email(body["email"])
    credential = body["password"]
    if not isinstance(credential, str) or not 1 <= len(credential) <= 128:
        raise APIError("Email or password is incorrect.", "invalid_credentials", 401)
    user = db.session.scalar(select(User).where(User.email == address))
    valid = check_password_hash(user.password_hash if user else DUMMY_HASH, credential)
    if not user or not valid:
        raise APIError("Email or password is incorrect.", "invalid_credentials", 401)
    if not user.email_confirmed:
        raise APIError("Confirm your email before signing in.", "email_not_confirmed", 403)
    # scrypt runs outside the DB write lock. Recheck its authority atomically
    # before issuing a session: a concurrent reset may have changed the hash.
    authorized = db.session.execute(update(User).where(
        User.id == user.id, User.password_hash == user.password_hash,
        User.email_confirmed.is_(True)
    ).values(password_hash=user.password_hash))
    if authorized.rowcount != 1:
        raise APIError("Email or password is incorrect.", "invalid_credentials", 401)
    session, refresh = create_session(user)
    db.session.commit()
    return set_refresh_cookie(jsonify(session_response(user, session)), refresh, session)


@bp.post("/exchange-code")
@limiter.limit("30 per 15 minutes")
def exchange_code():
    body = payload(("code", "purpose"))
    code = text(body["code"], "confirmation code", 20, 200)
    if body["purpose"] not in ("signup", "recovery"):
        raise APIError("This confirmation link is invalid.", "invalid_code", 400)
    record = db.session.scalar(select(AuthCode).where(AuthCode.token_hash == token_hash(code),
                                                     AuthCode.purpose == body["purpose"]))
    if not record or record.consumed_at is not None or record.expires_at <= now():
        raise APIError("This link has expired or has already been used.", "invalid_code", 400)
    # Consistent user-first lock order coordinates confirmation, registration,
    # reset and login. An UPDATE also locks correctly on SQLite, where SELECT
    # FOR UPDATE is ignored. Recheck the single-use code after this lock.
    db.session.execute(update(User).where(User.id == record.user_id).values(email_confirmed=User.email_confirmed))
    consumed = db.session.execute(update(AuthCode).where(
        AuthCode.id == record.id, AuthCode.consumed_at.is_(None), AuthCode.expires_at > now()
    ).values(consumed_at=now()))
    if consumed.rowcount != 1:
        raise APIError("This link has already been used.", "invalid_code", 400)
    user = db.session.get(User, record.user_id)
    if record.purpose == "signup":
        user.email_confirmed = True
    elif not user.email_confirmed:
        raise APIError("This link is invalid.", "invalid_code", 400)
    session, refresh = create_session(user, recovery=record.purpose == "recovery")
    db.session.commit()
    return set_refresh_cookie(jsonify(session_response(user, session)), refresh, session)


@bp.post("/refresh")
@limiter.limit("60 per minute")
def refresh():
    payload()
    existing = request.cookies.get(COOKIE, "")
    if not existing or len(existing) > 200:
        raise APIError("Sign in to continue.", "unauthorized", 401)
    old_hash = token_hash(existing)
    session = db.session.scalar(select(AuthSession).where(
        AuthSession.refresh_hash == old_hash, AuthSession.revoked_at.is_(None), AuthSession.expires_at > now()
    ))
    if not session:
        raise APIError("Your session has expired. Sign in again.", "unauthorized", 401)
    replacement = new_secret()
    rotated = db.session.execute(update(AuthSession).where(
        AuthSession.id == session.id, AuthSession.refresh_hash == old_hash,
        AuthSession.revoked_at.is_(None), AuthSession.expires_at > now()
    ).values(refresh_hash=token_hash(replacement)))
    if rotated.rowcount != 1:
        raise APIError("Your session has expired. Sign in again.", "unauthorized", 401)
    user = db.session.get(User, session.user_id)
    db.session.commit()
    return set_refresh_cookie(jsonify(session_response(user, session)), replacement, session)


@bp.post("/logout")
def logout():
    payload()
    refresh = request.cookies.get(COOKIE, "")
    if refresh and len(refresh) <= 200:
        db.session.execute(update(AuthSession).where(AuthSession.refresh_hash == token_hash(refresh)).values(revoked_at=now()))
    if request.headers.get("Authorization"):
        try:
            claims = read_access_token()
            db.session.execute(update(AuthSession).where(AuthSession.id == claims["sid"], AuthSession.user_id == claims["sub"]).values(revoked_at=now()))
        except APIError:
            pass
    db.session.commit()
    return clear_refresh_cookie(current_app.response_class(status=204))


@bp.post("/forgot-password")
@limiter.limit("10 per hour")
def forgot_password():
    body = payload(("email",))
    user = db.session.scalar(select(User).where(User.email == email(body["email"])))
    if user and user.email_confirmed:
        code = issue_code(user, "recovery")
        deliver(user, code, "recovery")
        db.session.commit()
    return jsonify(message=GENERIC_RESET), 202


@bp.post("/password")
@limiter.limit("10 per hour")
@authenticated(recovery=True)
def change_password():
    body = payload(("password",))
    credential = password(body["password"])
    # Lock the user and recheck the session after acquiring the lock. Two reset
    # requests must not both create sessions from the same recovery authority.
    user = db.session.scalar(select(User).where(User.id == g.user.id).with_for_update())
    revoked = db.session.execute(update(AuthSession).where(
        AuthSession.id == g.auth_session.id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > now()
    ).values(revoked_at=now()))
    if revoked.rowcount != 1:
        raise APIError("Open a new password reset link.", "unauthorized", 401)
    user.password_hash = generate_password_hash(credential, method="scrypt")
    db.session.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=now()))
    db.session.execute(update(AuthCode).where(AuthCode.user_id == user.id, AuthCode.consumed_at.is_(None)).values(consumed_at=now()))
    session, refresh = create_session(user)
    db.session.commit()
    return set_refresh_cookie(jsonify(session_response(user, session)), refresh, session)


@bp.get("/me")
@authenticated()
def me():
    return jsonify(user={"id": g.user.id, "email": g.user.email})
