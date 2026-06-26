"""Add takeaway_price to products

Revision ID: add_takeaway_price
Revises: 7033b836508d
Create Date: 2026-06-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_takeaway_price'
down_revision = '7033b836508d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('products', sa.Column('takeaway_price', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('products', 'takeaway_price')
