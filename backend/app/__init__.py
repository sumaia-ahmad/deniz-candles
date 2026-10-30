import os
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from .extensions import db, migrate


def create_app(test_config=None):
    load_dotenv()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-insecure-key")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///deniz.db")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    # In production (HTTPS) the login cookie must only travel over encrypted connections.
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE") == "1"
    # "Remember me" keeps the dashboard signed in for 30 days.
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    # Largest upload accepted (the reference image on the order form).
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
    if test_config:
        app.config.update(test_config)
    app.json.ensure_ascii = False

    # Behind a reverse proxy (Nginx), trust its X-Forwarded-* headers for the client address and scheme.
    if os.environ.get("BEHIND_PROXY") == "1":
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)

    from . import models  # noqa: F401  (registers the tables)

    # Tables are created and updated with migrations: `flask --app app db upgrade`.

    from .seed import seed_command
    from .users import create_user_command, list_users_command, reset_password_command

    app.cli.add_command(seed_command)
    app.cli.add_command(create_user_command)
    app.cli.add_command(reset_password_command)
    app.cli.add_command(list_users_command)

    from .admin import bp as admin_bp
    from .auth import bp as auth_bp
    from .catalog import bp as catalog_bp
    from .inventory import bp as inventory_bp
    from .orders import admin_bp as admin_orders_bp
    from .orders import public_bp as orders_bp
    from .reports import bp as reports_bp
    from .settings import bp as settings_bp

    app.register_blueprint(catalog_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(admin_orders_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(reports_bp)

    @app.errorhandler(413)
    def too_large(_error):
        return {"error": "الصورة كبيرة كتير (الحد الأقصى 10MB)"}, 413

    return app
