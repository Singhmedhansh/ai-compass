"""add editorial_blurb to catalog_tools

Revision ID: c4e8b1a6f3d7
Revises: f2a9c7e1b5d3
Create Date: 2026-08-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e8b1a6f3d7'
down_revision = 'f2a9c7e1b5d3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('catalog_tools', schema=None) as batch_op:
        batch_op.add_column(sa.Column('editorial_blurb', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('catalog_tools', schema=None) as batch_op:
        batch_op.drop_column('editorial_blurb')
