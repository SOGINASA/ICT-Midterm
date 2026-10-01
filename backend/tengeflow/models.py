import time
import uuid

from .extensions import db

MAX_CENTS = 100_000_000_000_000


def uuid_string():
    return str(uuid.uuid4())


def now():
    return int(time.time())


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.String(36), primary_key=True, default=uuid_string)
    email = db.Column(db.String(254), nullable=False, unique=True)
    password_hash = db.Column(db.String(512), nullable=False)
    email_confirmed = db.Column(db.Boolean, nullable=False, default=False)
    display_name = db.Column(db.String(60), nullable=False)
    monthly_budget_cents = db.Column(db.BigInteger, nullable=False, default=12_000_000)
    onboarding_completed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    __table_args__ = (
        db.CheckConstraint("monthly_budget_cents >= 0 AND monthly_budget_cents <= 100000000000000", name="ck_user_budget"),
        db.CheckConstraint("length(display_name) BETWEEN 2 AND 60", name="ck_user_name"),
    )


class Category(db.Model):
    __tablename__ = "categories"
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id = db.Column(db.String(16), primary_key=True)
    name = db.Column(db.String(20), nullable=False)
    icon = db.Column(db.String(30), nullable=False)
    color = db.Column(db.String(7), nullable=False)
    monthly_limit_cents = db.Column(db.BigInteger, nullable=False)
    __table_args__ = (
        db.CheckConstraint("id IN ('food','transport','study','leisure','other')", name="ck_category_id"),
        db.CheckConstraint("monthly_limit_cents >= 0 AND monthly_limit_cents <= 100000000000000", name="ck_category_limit"),
    )


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.String(36), primary_key=True, default=uuid_string)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.String(16), nullable=False)
    amount_cents = db.Column(db.BigInteger, nullable=False)
    payment_method = db.Column(db.String(4), nullable=False)
    note = db.Column(db.String(120), nullable=False, default="")
    occurred_at = db.Column(db.String(35), nullable=False)
    created_at = db.Column(db.String(24), nullable=False)
    __table_args__ = (
        db.ForeignKeyConstraint(["user_id", "category_id"], ["categories.user_id", "categories.id"], ondelete="CASCADE", name="fk_transaction_owned_category"),
        db.CheckConstraint("amount_cents > 0 AND amount_cents <= 100000000000000", name="ck_transaction_amount"),
        db.CheckConstraint("payment_method IN ('card','cash')", name="ck_transaction_payment"),
        db.CheckConstraint("length(note) <= 120", name="ck_transaction_note"),
    )


class AuthSession(db.Model):
    __tablename__ = "auth_sessions"
    id = db.Column(db.String(36), primary_key=True, default=uuid_string)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_hash = db.Column(db.String(64), nullable=False, unique=True)
    recovery = db.Column(db.Boolean, nullable=False, default=False)
    expires_at = db.Column(db.BigInteger, nullable=False)
    revoked_at = db.Column(db.BigInteger)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)


class AuthCode(db.Model):
    __tablename__ = "auth_codes"
    id = db.Column(db.String(36), primary_key=True, default=uuid_string)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True)
    purpose = db.Column(db.String(8), nullable=False)
    expires_at = db.Column(db.BigInteger, nullable=False)
    consumed_at = db.Column(db.BigInteger)
    __table_args__ = (db.CheckConstraint("purpose IN ('signup','recovery')", name="ck_auth_code_purpose"),)


CATEGORIES = [
    ("food", "Food", "utensils", "#15776E", 4_500_000),
    ("transport", "Transport", "bus", "#75AAA4", 2_000_000),
    ("study", "Study", "book-open", "#A4C5BD", 1_500_000),
    ("leisure", "Leisure", "clapperboard", "#C4D6CC", 2_500_000),
    ("other", "Other", "shapes", "#D9E1D4", 1_500_000),
]
