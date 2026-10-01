import copy
from concurrent.futures import ThreadPoolExecutor
from threading import Event, current_thread

import pytest
from sqlalchemy import event, select, update
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash

from tengeflow.extensions import db
from tengeflow.models import AuthCode, AuthSession, Category, Transaction, User, now
from tengeflow.security import COOKIE, token_hash
from conftest import EXPENSE, ONBOARDING, ORIGIN, PASSWORD, account, call, latest_code, register


def test_account_lifecycle_and_cookie_rotation(app, client):
    assert register(client).status_code == 202
    denied = call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD})
    assert denied.status_code == 403
    code = latest_code(app, "ayan@example.com")
    confirmed = call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"})
    token = confirmed.json["access_token"]
    assert confirmed.json["recovery"] is False
    cookie_header = confirmed.headers["Set-Cookie"]
    assert "HttpOnly" in cookie_header and "SameSite=Lax" in cookie_header and "Path=/api/auth" in cookie_header
    initial_cookie = client.get_cookie(COOKIE, path="/api/auth").value
    snapshot = call(client, "get", "/snapshot", token=token)
    assert snapshot.status_code == 200
    assert len(snapshot.json["categories"]) == 5
    assert snapshot.json["transactions"] == []
    assert snapshot.json["profile"]["onboardingCompleted"] is False
    replay = call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"})
    assert replay.status_code == 400
    refreshed = call(client, "post", "/auth/refresh")
    assert refreshed.status_code == 200
    replacement = client.get_cookie(COOKIE, path="/api/auth").value
    assert replacement != initial_cookie
    attacker = app.test_client()
    attacker.set_cookie(COOKIE, initial_cookie, path="/api/auth")
    assert call(attacker, "post", "/auth/refresh").status_code == 401
    with app.app_context():
        user = db.session.scalar(select(User))
        assert user.password_hash.startswith("scrypt:") and check_password_hash(user.password_hash, PASSWORD)
        assert db.session.scalar(select(AuthSession)).refresh_hash == token_hash(replacement)
        assert db.session.scalar(select(AuthCode)).token_hash == token_hash(code)
    assert call(client, "post", "/auth/logout", token=token).status_code == 204
    assert client.get_cookie(COOKIE, path="/api/auth") is None
    assert call(client, "get", "/snapshot", token=token).status_code == 401
    assert call(client, "post", "/auth/refresh").status_code == 401


def test_latest_registration_credential_owns_confirmation(app, client):
    assert register(client, password="Attacker-password-123").status_code == 202
    first_code = latest_code(app, "ayan@example.com")
    assert register(client, password=PASSWORD, name="Real owner").status_code == 202
    latest = latest_code(app, "ayan@example.com")
    assert call(client, "post", "/auth/exchange-code", {"code": first_code, "purpose": "signup"}).status_code == 400
    assert call(client, "post", "/auth/exchange-code", {"code": latest, "purpose": "signup"}).status_code == 200
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": "Attacker-password-123"}).status_code == 401
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD}).status_code == 200
    # Confirmed duplicates never change an existing account's password or name.
    assert register(client, password="Another-password-123", name="Wrong owner").status_code == 202
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD}).status_code == 200


def test_registration_racing_confirmation_cannot_replace_confirmed_password(app, client):
    assert register(client).status_code == 202
    code = latest_code(app, "ayan@example.com")
    waiting, resume = Event(), Event()
    with app.app_context():
        engine = db.engine

    def pause_update(_connection, _cursor, statement, _parameters, _context, _many):
        if current_thread().name.startswith("racing-register") and statement.startswith("UPDATE users SET password_hash"):
            waiting.set()
            assert resume.wait(10)

    event.listen(engine, "before_cursor_execute", pause_update)
    try:
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="racing-register") as pool:
            def duplicate():
                return register(app.test_client(), password="Wrong-racing-password-123")
            pending = pool.submit(duplicate)
            assert waiting.wait(10)
            try:
                confirmed = call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"})
                assert confirmed.status_code == 200
            finally:
                resume.set()
            assert pending.result(timeout=10).status_code == 202
    finally:
        resume.set()
        event.remove(engine, "before_cursor_execute", pause_update)
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD}).status_code == 200
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": "Wrong-racing-password-123"}).status_code == 401


def test_login_in_flight_cannot_issue_a_session_after_password_reset(app, client, monkeypatch):
    account(app, client)
    from tengeflow.routes import auth
    original_check = auth.check_password_hash
    waiting, resume = Event(), Event()

    def delayed_check(hashed, credential):
        result = original_check(hashed, credential)
        waiting.set()
        assert resume.wait(10)
        return result

    monkeypatch.setattr(auth, "check_password_hash", delayed_check)
    with ThreadPoolExecutor(max_workers=1) as pool:
        def old_login():
            return call(app.test_client(), "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD})
        pending = pool.submit(old_login)
        assert waiting.wait(10)
        try:
            assert call(client, "post", "/auth/forgot-password", {"email": "ayan@example.com"}).status_code == 202
            recovery = call(client, "post", "/auth/exchange-code", {"code": latest_code(app, "ayan@example.com"), "purpose": "recovery"})
            assert recovery.status_code == 200
            changed = call(client, "post", "/auth/password", {"password": "Replacement-password-123"}, recovery.json["access_token"])
            assert changed.status_code == 200
        finally:
            resume.set()
        assert pending.result(timeout=10).status_code == 401


@pytest.mark.parametrize("origin", [None, "null", "https://evil.example", "http://localhost:3000.evil.example"])
@pytest.mark.parametrize("endpoint", ["register", "login", "refresh", "logout", "forgot-password", "exchange-code", "password"])
def test_auth_rejects_missing_and_foreign_origins(client, endpoint, origin):
    response = call(client, "post", "/auth/" + endpoint, {}, origin=origin)
    assert response.status_code == 403
    assert response.json["code"] == "invalid_origin"


def test_password_recovery_requires_server_authority_and_revokes_sessions(app, client):
    token, _ = account(app, client, onboard=True)
    other = app.test_client()
    other_login = call(other, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD})
    other_token = other_login.json["access_token"]
    assert call(client, "post", "/auth/password", {"password": "Replacement-password-1"}, token).status_code == 403
    assert call(client, "post", "/auth/forgot-password", {"email": "ayan@example.com"}).status_code == 202
    code = latest_code(app, "ayan@example.com")
    assert call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"}).status_code == 400
    recovery = call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "recovery"})
    assert recovery.json["recovery"] is True
    recovery_token = recovery.json["access_token"]
    assert call(client, "get", "/snapshot", token=recovery_token).status_code == 403
    changed = call(client, "post", "/auth/password", {"password": "Replacement-password-1"}, recovery_token)
    assert changed.status_code == 200 and changed.json["recovery"] is False
    assert call(client, "get", "/snapshot", token=changed.json["access_token"]).status_code == 200
    assert call(client, "get", "/snapshot", token=token).status_code == 401
    assert call(other, "get", "/snapshot", token=other_token).status_code == 401
    assert call(other, "post", "/auth/refresh").status_code == 401
    assert call(client, "post", "/auth/password", {"password": "Replay-password-123"}, recovery_token).status_code == 401
    assert call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "recovery"}).status_code == 400
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": PASSWORD}).status_code == 401
    assert call(client, "post", "/auth/login", {"email": "ayan@example.com", "password": "Replacement-password-1"}).status_code == 200


def test_expired_code_and_session_fail_closed(app, client):
    assert register(client).status_code == 202
    code = latest_code(app, "ayan@example.com")
    with app.app_context():
        db.session.execute(update(AuthCode).values(expires_at=now() - 1))
        db.session.commit()
    assert call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"}).status_code == 400
    token, _ = account(app, client)
    with app.app_context():
        db.session.execute(update(AuthSession).values(expires_at=now() - 1))
        db.session.commit()
    assert call(client, "get", "/snapshot", token=token).status_code == 401
    assert call(client, "post", "/auth/refresh").status_code == 401


def test_onboarding_is_atomic_and_idempotent(app, client):
    token, user_id = account(app, client)
    assert call(client, "post", "/transactions", EXPENSE, token).status_code == 409
    assert call(client, "patch", "/profile/budget", {"amount": 100}, token).status_code == 409
    bad = copy.deepcopy(ONBOARDING)
    bad["categoryLimits"]["food"] = 999999
    assert call(client, "post", "/onboarding", bad, token).status_code == 400
    assert call(client, "get", "/snapshot", token=token).json["profile"]["onboardingCompleted"] is False
    good = call(client, "post", "/onboarding", ONBOARDING, token)
    assert good.status_code == 200 and good.json["profile"]["onboardingCompleted"] is True
    changed = copy.deepcopy(ONBOARDING)
    changed["displayName"], changed["monthlyBudget"] = "Retry changed", 200000
    changed["categoryLimits"]["food"] = 50000
    retry = call(client, "post", "/onboarding", changed, token)
    assert retry.json == good.json
    with app.app_context():
        assert db.session.get(User, user_id).monthly_budget_cents == 10_000_000


def test_onboarding_rolls_back_when_a_category_is_missing(app, client):
    token, user_id = account(app, client)
    with app.app_context():
        db.session.delete(db.session.get(Category, (user_id, "other")))
        db.session.commit()
    assert call(client, "post", "/onboarding", ONBOARDING, token).status_code == 409
    with app.app_context():
        user = db.session.get(User, user_id)
        assert not user.onboarding_completed and user.monthly_budget_cents == 12_000_000
        assert db.session.get(Category, (user_id, "food")).monthly_limit_cents == 4_500_000


def test_simultaneous_onboarding_has_one_complete_winner(app, client):
    token, _ = account(app, client)
    second = copy.deepcopy(ONBOARDING)
    second["displayName"] = "Second setup"
    second["monthlyBudget"] = 200000
    second["categoryLimits"]["food"] = 80000

    def submit(body):
        with app.test_client() as concurrent:
            return call(concurrent, "post", "/onboarding", body, token)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, [ONBOARDING, second]))
    assert [result.status_code for result in results] == [200, 200]
    assert results[0].json == results[1].json
    final = results[0].json
    expected = ONBOARDING if final["profile"]["displayName"] == "Ayan" else second
    assert final["profile"]["monthlyBudget"] == expected["monthlyBudget"]
    assert {category["id"]: category["monthlyLimit"] for category in final["categories"]} == expected["categoryLimits"]


def test_two_accounts_cannot_read_or_mutate_each_others_finances(app, client):
    first_token, first_id = account(app, client, onboard=True)
    other = app.test_client()
    second_token, second_id = account(app, other, email="second@example.com", onboard=True)
    created = call(client, "post", "/transactions", EXPENSE, first_token)
    assert created.status_code == 201
    identifier = created.json["id"]
    assert call(other, "get", "/snapshot", token=second_token).json["transactions"] == []
    assert call(other, "patch", "/transactions/" + identifier, EXPENSE, second_token).status_code == 404
    assert call(other, "delete", "/transactions/" + identifier, token=second_token).status_code == 404
    assert call(other, "patch", "/categories/food/limit", {"amount": 12.34}, second_token).status_code == 200
    assert call(client, "get", "/snapshot", token=first_token).json["categories"][0]["monthlyLimit"] == 40000
    assert call(client, "post", "/transactions", {**EXPENSE, "userId": second_id}, first_token).status_code == 400
    updated = call(client, "patch", "/transactions/" + identifier, {**EXPENSE, "amount": 1.23}, first_token)
    assert updated.status_code == 200 and updated.json["amount"] == 1.23
    assert call(client, "delete", "/transactions/" + identifier, token=first_token).status_code == 204
    assert call(client, "get", "/snapshot", token=first_token).json["transactions"] == []


@pytest.mark.parametrize("amount", [-1, 0, 1.001, True, "10", None, 1000000000000.01, float("nan"), float("inf")])
def test_invalid_expense_amounts_are_rejected(app, client, amount):
    token, _ = account(app, client, onboard=True)
    assert call(client, "post", "/transactions", {**EXPENSE, "amount": amount}, token).status_code == 400
    assert call(client, "get", "/snapshot", token=token).json["transactions"] == []


@pytest.mark.parametrize("date", ["2026-02-30", "2026-13-01", "0000-01-01", "2026-1-1", "2026-10-01T99:00:00Z", "2026-10-01junk", None])
def test_invalid_calendar_dates_are_rejected(app, client, date):
    token, _ = account(app, client, onboard=True)
    assert call(client, "post", "/transactions", {**EXPENSE, "occurredAt": date}, token).status_code == 400


def test_decimal_limits_and_database_constraints(app, client):
    token, user_id = account(app, client)
    tiny = {"displayName": "Ayan", "monthlyBudget": 0.3,
            "categoryLimits": {"food": 0.1, "transport": 0.2, "study": 0, "leisure": 0, "other": 0}}
    assert call(client, "post", "/onboarding", tiny, token).status_code == 200
    assert call(client, "post", "/transactions", {**EXPENSE, "amount": 1000000000000}, token).status_code == 201
    with app.app_context():
        assert db.session.scalar(select(Transaction)).amount_cents == 100000000000000
        row = Transaction(user_id=user_id, category_id="nonexistent", amount_cents=1, payment_method="card",
                          note="", occurred_at="2026-10-01", created_at="2026-10-01T00:00:00.000Z")
        db.session.add(row)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
        db.session.get(User, user_id).monthly_budget_cents = -1
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_dev_inbox_is_loopback_only_and_never_registered_in_production(app, client):
    register(client)
    response = client.get("/api/dev/messages")
    assert response.status_code == 200 and len(response.json["messages"]) == 1
    assert client.get("/api/dev/inbox").status_code == 200
    assert client.get("/api/dev/inbox", headers={"Host": "attacker.example"}).status_code == 404
    assert client.get("/api/dev/messages", environ_overrides={"REMOTE_ADDR": "192.0.2.1"}).status_code == 404
    for forwarded in ("192.0.2.1", "127.0.0.1, 192.0.2.1", "unknown", "", ",", "127.0.0.1," * 17):
        assert client.get("/api/dev/messages", headers={"X-Forwarded-For": forwarded}).status_code == 404
    for forwarded in ("127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.0.1, ::1"):
        assert client.get("/api/dev/messages", headers={"X-Forwarded-For": forwarded}).status_code == 200
    from tengeflow import create_app
    production = create_app({**app.config, "PRODUCTION": True})
    assert production.test_client().get("/api/dev/messages").status_code == 404


def test_json_errors_no_cache_and_migration_health(client):
    health = client.get("/api/health")
    assert health.status_code == 200 and health.json["status"] == "ok"
    assert health.headers["Cache-Control"] == "no-store"
    assert client.get("/api/snapshot").status_code == 401
    assert client.get("/api/missing").status_code == 404
    assert client.post("/api/auth/login", data="bad json", headers={"Origin": ORIGIN, "Content-Type": "application/json"}).status_code == 400


def test_rate_limit_is_enforced(app):
    from tengeflow import create_app
    limited = create_app({**app.config, "RATELIMIT_ENABLED": True, "RATELIMIT_STORAGE_URI": "memory://"})
    client = limited.test_client()
    for _ in range(10):
        assert call(client, "post", "/auth/forgot-password", {"email": "unknown@example.com"}).status_code == 202
    assert call(client, "post", "/auth/forgot-password", {"email": "unknown@example.com"}).status_code == 429
