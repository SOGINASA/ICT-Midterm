import math
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import request


class APIError(Exception):
    def __init__(self, message, code="validation_error", status=400):
        self.message, self.code, self.status = message, code, status


def payload(required=(), optional=()):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise APIError("Send a JSON object.")
    if set(body) - set(required) - set(optional) or set(required) - set(body):
        raise APIError("The request has missing or unsupported fields.")
    return body


def text(value, label, minimum=0, maximum=120):
    if not isinstance(value, str):
        raise APIError(f"Enter a valid {label}.")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise APIError(f"{label.capitalize()} must contain {minimum}–{maximum} characters.")
    return value


def email(value):
    value = text(value, "email address", 3, 254).lower()
    if not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", value):
        raise APIError("Enter a valid email address.")
    return value


def password(value):
    # Do not trim passwords: spaces are part of the user's chosen credential.
    if not isinstance(value, str) or not 8 <= len(value) <= 128:
        raise APIError("Choose a password with 8–128 characters.", "weak_password")
    return value


def money(value, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise APIError("Enter a valid amount.")
    try:
        amount = Decimal(str(value))
        if not math.isfinite(value) or amount < 0 or amount > Decimal("1000000000000"):
            raise APIError("Amount must be between ₸0 and ₸1 trillion.")
        cents = amount * 100
        if cents != cents.to_integral_value():
            raise APIError("Use no more than 2 decimal places.")
        if positive and cents <= 0:
            raise APIError("Enter an amount greater than ₸0.")
        return int(cents)
    except (InvalidOperation, OverflowError, ValueError):
        raise APIError("Enter a valid amount.") from None


def calendar_date(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?", value
    ):
        raise APIError("Choose a valid date.")
    try:
        parsed = date.fromisoformat(value[:10])
        # Match the frontend calendar validator (Date.UTC treats 00–99 as
        # 1900–1999), so every saved value can also be loaded by that client.
        if parsed.year < 100:
            raise ValueError("Unsupported year")
        if len(value) > 10:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise APIError("Choose a valid date.") from None
    return value


def expense(body):
    category = body["categoryId"]
    if category not in ("food", "transport", "study", "leisure", "other"):
        raise APIError("Choose a valid category.")
    if body["paymentMethod"] not in ("card", "cash"):
        raise APIError("Choose card or cash.")
    return {
        "amount_cents": money(body["amount"], positive=True),
        "category_id": category,
        "payment_method": body["paymentMethod"],
        "occurred_at": calendar_date(body["occurredAt"]),
        "note": text(body.get("note", ""), "note", maximum=120),
    }
