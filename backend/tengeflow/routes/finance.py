from datetime import datetime, timezone

from flask import Blueprint, g, jsonify
from sqlalchemy import select, update

from ..extensions import db
from ..models import CATEGORIES, Category, Transaction, User
from ..security import authenticated
from ..validation import APIError, expense, money, payload, text

bp = Blueprint("finance", __name__)


def profile_json(user):
    return {"id": user.id, "displayName": user.display_name, "currency": "KZT",
            "monthlyBudget": user.monthly_budget_cents / 100,
            "onboardingCompleted": user.onboarding_completed}


def category_json(category):
    return {"id": category.id, "name": category.name, "icon": category.icon,
            "color": category.color, "monthlyLimit": category.monthly_limit_cents / 100}


def transaction_json(transaction):
    return {"id": transaction.id, "amount": transaction.amount_cents / 100,
            "categoryId": transaction.category_id, "paymentMethod": transaction.payment_method,
            "note": transaction.note, "occurredAt": transaction.occurred_at,
            "createdAt": transaction.created_at, "syncStatus": "synced"}


def snapshot(user):
    categories = list(db.session.scalars(select(Category).where(Category.user_id == user.id)))
    order = {row[0]: index for index, row in enumerate(CATEGORIES)}
    categories.sort(key=lambda category: order[category.id])
    transactions = db.session.scalars(select(Transaction).where(Transaction.user_id == user.id).order_by(
        Transaction.occurred_at.desc(), Transaction.created_at.desc(), Transaction.id.desc()))
    return {"version": 1, "profile": profile_json(user), "categories": [category_json(row) for row in categories],
            "transactions": [transaction_json(row) for row in transactions]}


def require_onboarded():
    if not g.user.onboarding_completed:
        raise APIError("Complete your account setup first.", "onboarding_required", 409)


@bp.get("/snapshot")
@authenticated()
def get_snapshot():
    return jsonify(snapshot(g.user))


@bp.post("/onboarding")
@authenticated()
def complete_onboarding():
    body = payload(("displayName", "monthlyBudget", "categoryLimits"))
    name = text(body["displayName"], "name", 2, 60)
    budget = money(body["monthlyBudget"], positive=True)
    limits = body["categoryLimits"]
    expected = {row[0] for row in CATEGORIES}
    if not isinstance(limits, dict) or set(limits) != expected:
        raise APIError("Provide all five category limits.")
    cents = {key: money(value) for key, value in limits.items()}
    if sum(cents.values()) > budget:
        raise APIError("Category limits must fit within your monthly budget.")
    # The conditional update takes the DB write lock. Only the first request
    # can change profile AND category limits; retries read the committed result.
    updated = db.session.execute(update(User).where(
        User.id == g.user.id, User.onboarding_completed.is_(False)
    ).values(display_name=name, monthly_budget_cents=budget, onboarding_completed=True))
    if updated.rowcount:
        for identifier, amount in cents.items():
            result = db.session.execute(update(Category).where(
                Category.user_id == g.user.id, Category.id == identifier
            ).values(monthly_limit_cents=amount))
            if result.rowcount != 1:
                raise APIError("Account setup could not be saved. Please retry.", "incomplete_account", 409)
    db.session.commit()
    db.session.refresh(g.user)
    return jsonify(snapshot(g.user))


@bp.post("/transactions")
@authenticated()
def add_transaction():
    require_onboarded()
    values = expense(payload(("amount", "categoryId", "paymentMethod", "occurredAt"), ("note",)))
    row = Transaction(user_id=g.user.id, created_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"), **values)
    db.session.add(row)
    db.session.commit()
    return jsonify(transaction_json(row)), 201


@bp.patch("/transactions/<identifier>")
@authenticated()
def edit_transaction(identifier):
    require_onboarded()
    values = expense(payload(("amount", "categoryId", "paymentMethod", "occurredAt"), ("note",)))
    row = db.session.scalar(select(Transaction).where(Transaction.id == identifier, Transaction.user_id == g.user.id))
    if not row:
        raise APIError("This expense was not found.", "not_found", 404)
    for key, value in values.items():
        setattr(row, key, value)
    db.session.commit()
    return jsonify(transaction_json(row))


@bp.delete("/transactions/<identifier>")
@authenticated()
def delete_transaction(identifier):
    require_onboarded()
    row = db.session.scalar(select(Transaction).where(Transaction.id == identifier, Transaction.user_id == g.user.id))
    if not row:
        raise APIError("This expense was not found.", "not_found", 404)
    db.session.delete(row)
    db.session.commit()
    return "", 204


@bp.patch("/profile/budget")
@authenticated()
def update_budget():
    require_onboarded()
    body = payload(("amount",))
    g.user.monthly_budget_cents = money(body["amount"])
    db.session.commit()
    return jsonify(profile_json(g.user))


@bp.patch("/categories/<identifier>/limit")
@authenticated()
def update_limit(identifier):
    require_onboarded()
    body = payload(("amount",))
    amount = money(body["amount"])
    category = db.session.get(Category, (g.user.id, identifier))
    if not category:
        raise APIError("This category was not found.", "not_found", 404)
    category.monthly_limit_cents = amount
    db.session.commit()
    return jsonify(category_json(category))
