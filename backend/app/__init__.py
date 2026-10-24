from flask import Flask
from flask_cors import CORS

from .extensions import db


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///deniz.db"
    app.json.ensure_ascii = False

    CORS(app)
    db.init_app(app)

    from . import models  # noqa: F401  (registers the tables)

    with app.app_context():
        db.create_all()

    from .seed import seed_command

    app.cli.add_command(seed_command)

    from .catalog import bp as catalog_bp

    app.register_blueprint(catalog_bp)

    return app
