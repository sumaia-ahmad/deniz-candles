"""favors use the large order rule

Revision ID: f4f246b8880d
Revises: cc97aa8ae54b
Create Date: 2026-10-30 16:03:22.744115

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4f246b8880d'
down_revision = 'cc97aa8ae54b'
branch_labels = None
depends_on = None


# Favors no longer carry a 14-day lead time of their own: since this change, any order with
# 50+ pieces needs 14 days (a setting), and smaller favor orders are timed by the owner on review.
FAVOR_SIZES = "product_id IN (SELECT id FROM products WHERE kind = 'favor')"


def upgrade():
    op.execute(f"UPDATE product_sizes SET min_lead_days = 0 WHERE min_lead_days = 14 AND {FAVOR_SIZES}")


def downgrade():
    op.execute(f"UPDATE product_sizes SET min_lead_days = 14 WHERE min_lead_days = 0 AND {FAVOR_SIZES}")
