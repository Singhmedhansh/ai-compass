"""add maker_reply to reviews (claimed makers answering reviews)

Revision ID: b2e6f4a80c31
Revises: a7d3c5e91b40
Create Date: 2026-08-31 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2e6f4a80c31'
down_revision = 'a7d3c5e91b40'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('maker_reply', sa.String(length=1000), nullable=True))
        batch_op.add_column(sa.Column('maker_reply_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_column('maker_reply_at')
        batch_op.drop_column('maker_reply')
