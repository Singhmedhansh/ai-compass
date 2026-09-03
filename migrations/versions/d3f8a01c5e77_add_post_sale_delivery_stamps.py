"""add post-sale delivery stamps to submissions

Two send-once stamps backing the post-sale runbook (app/post_sale.py):
post_sale_confirmed_at (the within-24h purchase confirmation) and
numbers_sent_at (the day-7 numbers email).

Chained to c9e4b18f2d63, which is the current head. Check with
`alembic heads` before writing a new revision rather than reading it off the
newest-looking filename — chaining to a mid-chain revision forks the graph,
which is how the c9e4b18f2d63 merge came to be needed in the first place.

These columns also need matching entries in the raw-SQL fallback in
create_app(): `flask db upgrade` does not progress on the production database,
so a migration alone does not create them there. See
tests/test_migration_safety.py, which fails if the pairing is missed.

Revision ID: d3f8a01c5e77
Revises: c9e4b18f2d63
Create Date: 2026-09-03 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd3f8a01c5e77'
down_revision = 'c9e4b18f2d63'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('post_sale_confirmed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('numbers_sent_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('numbers_sent_at')
        batch_op.drop_column('post_sale_confirmed_at')
