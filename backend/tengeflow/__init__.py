from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import text
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import ROOT, configuration
from .extensions import db, limiter, migrate
from .validation import APIError


def create_app(overrides=None):
    app = Flask(__name__)
    app.config.update(configuration())
    if overrides:
        app.config.update(overrides)
    if app.config["TRUSTED_PROXY_HOPS"]:
        hops = app.config["TRUSTED_PROXY_HOPS"]
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=0)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
         supports_credentials=True, allow_headers=["Authorization", "Content-Type"],
         methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
    db.init_app(app)
    migrate.init_app(app, db, directory=str(ROOT / "migrations"))
    limiter.init_app(app)
    from .routes import auth, finance
    app.register_blueprint(auth.bp, url_prefix="/api/auth")
    app.register_blueprint(finance.bp, url_prefix="/api")
    if not app.config["PRODUCTION"]:
        from .routes import dev
        app.register_blueprint(dev.bp, url_prefix="/api/dev")

    @app.get("/api/health")
    def health():
        try:
            db.session.execute(text("SELECT 1 FROM alembic_version"))
        except Exception:
            db.session.rollback()
            return jsonify(status="unavailable"), 503
        return jsonify(status="ok", service="tengeflow-api")

    @app.errorhandler(APIError)
    def api_error(error):
        db.session.rollback()
        return jsonify(code=error.code, message=error.message), error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        db.session.rollback()
        return jsonify(code="rate_limited" if error.code == 429 else "request_error",
                       message="Too many attempts. Please wait and try again." if error.code == 429 else error.description), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error):
        db.session.rollback()
        # SQL exception strings can include credentials or submitted financial
        # data. Record only the class; never echo request bodies or tokens.
        app.logger.error("Unhandled API error: %s", type(error).__name__)
        return jsonify(code="server_error", message="Something went wrong. Please try again."), 500

    @app.after_request
    def response_headers(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            if not request.path.startswith("/api/dev/inbox"):
                response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.teardown_request
    def rollback_on_error(error):
        if error is not None:
            db.session.rollback()

    return app
