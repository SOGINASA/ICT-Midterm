import json
import re
from pathlib import Path

import pytest
from flask_migrate import upgrade

from tengeflow import create_app
from tengeflow.extensions import db

ORIGIN = "http://localhost:3000"
PASSWORD = "Safe-example-password-42"


@pytest.fixture
def app(tmp_path):
    application = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'test.sqlite3'}",
        "JWT_SECRET_KEY": "isolated-tests-only-secret-with-at-least-32-characters",
        "OUTBOX_DIR": str(tmp_path / "outbox"),
        "SMTP_HOST": "",
        "PRODUCTION": False,
        "RATELIMIT_ENABLED": False,
    })
    with application.app_context():
        upgrade()
    yield application
    with application.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture
def client(app):
    return app.test_client()


def call(client, method, path, body=None, token=None, origin=ORIGIN):
    headers = {"Origin": origin} if origin is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    return getattr(client, method)("/api" + path, json={} if body is None and method == "post" else body, headers=headers)


def latest_code(app, email):
    messages = [json.loads(path.read_text()) for path in Path(app.config["OUTBOX_DIR"]).glob("*.json")]
    messages = sorted((message for message in messages if message["to"] == email), key=lambda message: message["createdAt"])
    return re.search(r"\?code=([A-Za-z0-9_-]+)", messages[-1]["html"]).group(1)


def register(client, email="ayan@example.com", password=PASSWORD, name="Ayan"):
    return call(client, "post", "/auth/register", {"email": email, "password": password, "displayName": name})


def account(app, client, email="ayan@example.com", onboard=False):
    assert register(client, email).status_code == 202
    code = latest_code(app, email)
    response = call(client, "post", "/auth/exchange-code", {"code": code, "purpose": "signup"})
    assert response.status_code == 200
    token = response.json["access_token"]
    if onboard:
        assert call(client, "post", "/onboarding", ONBOARDING, token).status_code == 200
    return token, response.json["user"]["id"]


ONBOARDING = {"displayName": "Ayan", "monthlyBudget": 100000,
              "categoryLimits": {"food": 40000, "transport": 15000, "study": 15000, "leisure": 20000, "other": 10000}}
EXPENSE = {"amount": 1200.50, "categoryId": "food", "paymentMethod": "card", "occurredAt": "2026-10-01", "note": "Coffee"}
