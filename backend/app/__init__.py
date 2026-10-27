import os

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from .extensions import db


def create_app(test_config=None):
    load_dotenv()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-insecure-key")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///deniz.db")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    if test_config:
        app.config.update(test_config)
    app.json.ensure_ascii = False

    CORS(app)
    db.init_app(app)

    from . import models  # noqa: F401  (registers the tables)

    with app.app_context():
        db.create_all()

    from .seed import seed_command
    from .users import create_user_command

    app.cli.add_command(seed_command)
    app.cli.add_command(create_user_command)

    from .admin import bp as admin_bp
    from .auth import bp as auth_bp
    from .catalog import bp as catalog_bp

    app.register_blueprint(catalog_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)

    return app
