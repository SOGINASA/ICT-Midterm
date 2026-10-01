import hashlib
import secrets
from functools import wraps

import jwt
from flask import current_app, g, request
from sqlalchemy import select

from .extensions import db
from .models import AuthSession, User, now
from .validation import APIError

COOKIE = "tengeflow_refresh"
ACCESS_SECONDS = 15 * 60
REFRESH_SECONDS = 14 * 24 * 60 * 60
RECOVERY_SECONDS = 15 * 60


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def new_secret():
    return secrets.token_urlsafe(48)


def read_access_token():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise APIError("Sign in to continue.", "unauthorized", 401)
    try:
        return jwt.decode(
            authorization[7:], current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"],
            audience="tengeflow-api", issuer="tengeflow", options={"require": ["exp", "iat", "sub", "sid"]},
        )
    except jwt.InvalidTokenError:
        raise APIError("Your session has expired. Sign in again.", "unauthorized", 401) from None


def authenticated(recovery=False):
    def decorator(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            claims = read_access_token()
            session = db.session.get(AuthSession, claims["sid"])
            if not session or session.user_id != claims["sub"] or session.revoked_at is not None or session.expires_at <= now():
                raise APIError("Your session has expired. Sign in again.", "unauthorized", 401)
            if session.recovery != recovery:
                raise APIError("Open a new password reset link." if recovery else "Finish resetting your password first.", "recovery_required" if recovery else "recovery_session", 403)
            user = db.session.get(User, session.user_id)
            if not user or not user.email_confirmed:
                raise APIError("Confirm your email to continue.", "email_not_confirmed", 403)
            g.user, g.auth_session = user, session
            return function(*args, **kwargs)
        return wrapped
    return decorator


def create_session(user, recovery=False):
    refresh = new_secret()
    session = AuthSession(user_id=user.id, refresh_hash=token_hash(refresh), recovery=recovery,
                          expires_at=now() + (RECOVERY_SECONDS if recovery else REFRESH_SECONDS))
    db.session.add(session)
    db.session.flush()
    return session, refresh


def session_response(user, session):
    token = jwt.encode({
        "sub": user.id, "sid": session.id, "iat": now(),
        "exp": min(now() + ACCESS_SECONDS, session.expires_at),
        "aud": "tengeflow-api", "iss": "tengeflow",
    }, current_app.config["JWT_SECRET_KEY"], algorithm="HS256")
    return {"access_token": token, "user": {"id": user.id, "email": user.email}, "recovery": session.recovery}


def set_refresh_cookie(response, token, session):
    response.set_cookie(COOKIE, token, max_age=max(0, session.expires_at - now()),
                        httponly=True, secure=current_app.config["REFRESH_COOKIE_SECURE"],
                        samesite="Lax", path="/api/auth")
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(COOKIE, path="/api/auth", httponly=True,
                           secure=current_app.config["REFRESH_COOKIE_SECURE"], samesite="Lax")
    return response
