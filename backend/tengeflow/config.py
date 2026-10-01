"""Environment configuration. Local secrets are generated once and never committed."""
import os
import secrets
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def configuration():
    production = os.getenv("APP_ENV", "development") == "production"
    instance = Path(os.getenv("INSTANCE_PATH", str(ROOT / "instance"))).resolve()
    instance.mkdir(parents=True, exist_ok=True, mode=0o700)
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret and not production:
        secret_path = instance / ".jwt-secret"
        try:
            fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            secret = secret_path.read_text().strip()
        else:
            secret = secrets.token_urlsafe(48)
            with os.fdopen(fd, "w") as stream:
                stream.write(secret)
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    origins = [origin.strip().rstrip("/") for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",") if origin.strip()]
    database = os.getenv("DATABASE_URL", f"sqlite:///{instance / 'tengeflow.sqlite3'}")
    if database.startswith("postgres://"):
        database = database.replace("postgres://", "postgresql+psycopg://", 1)
    elif database.startswith("postgresql://"):
        database = database.replace("postgresql://", "postgresql+psycopg://", 1)
    rate_storage = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    if production:
        if not secret or len(secret) < 32:
            raise RuntimeError("Production requires a random JWT_SECRET_KEY of at least 32 characters.")
        if not os.getenv("DATABASE_URL"):
            raise RuntimeError("Production requires an explicit DATABASE_URL.")
        if not os.getenv("CORS_ORIGINS") or not origins or any(
            urlparse(origin).scheme != "https" or urlparse(origin).path
            or not urlparse(origin).netloc or "*" in origin for origin in origins
        ):
            raise RuntimeError("Production requires exact HTTPS CORS_ORIGINS.")
        if not os.getenv("FRONTEND_URL") or urlparse(frontend).scheme != "https":
            raise RuntimeError("Production requires an HTTPS FRONTEND_URL.")
        if frontend not in origins:
            raise RuntimeError("FRONTEND_URL must be one of CORS_ORIGINS.")
        if not rate_storage.startswith(("redis://", "rediss://")):
            raise RuntimeError("Production requires shared Redis rate-limit storage.")
        if not os.getenv("SMTP_HOST") or not os.getenv("MAIL_FROM"):
            raise RuntimeError("Production requires SMTP_HOST and MAIL_FROM.")
    return {
        "PRODUCTION": production,
        "SQLALCHEMY_DATABASE_URI": database,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SQLALCHEMY_ENGINE_OPTIONS": {"pool_pre_ping": True},
        "JWT_SECRET_KEY": secret,
        "FRONTEND_URL": frontend,
        "CORS_ORIGINS": origins,
        "RATELIMIT_STORAGE_URI": rate_storage,
        "RATELIMIT_HEADERS_ENABLED": True,
        "RATELIMIT_DEFAULT": "300 per minute",
        "MAX_CONTENT_LENGTH": 32 * 1024,
        "OUTBOX_DIR": str(instance / "outbox"),
        "SMTP_HOST": os.getenv("SMTP_HOST", ""),
        "SMTP_PORT": int(os.getenv("SMTP_PORT", "587")),
        "SMTP_USERNAME": os.getenv("SMTP_USERNAME", ""),
        "SMTP_PASSWORD": os.getenv("SMTP_PASSWORD", ""),
        "SMTP_STARTTLS": os.getenv("SMTP_STARTTLS", "1") == "1",
        "SMTP_SSL": os.getenv("SMTP_SSL", "0") == "1",
        "MAIL_FROM": os.getenv("MAIL_FROM", "TengeFlow <hello@tengeflow.local>"),
        "REFRESH_COOKIE_SECURE": production,
        "TRUSTED_PROXY_HOPS": int(os.getenv("TRUSTED_PROXY_HOPS", "0")),
    }
