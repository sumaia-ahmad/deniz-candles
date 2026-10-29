from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
# Database changes go through migrations (backend/migrations), so real data is never wiped.
migrate = Migrate(render_as_batch=True)  # batch mode lets SQLite alter existing tables
