"""add fit_score to outreach candidates

Revision ID: f2a9c7e1b5d3
Revises: d4b82e1a7c93
Create Date: 2026-08-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a9c7e1b5d3'
down_revision = 'd4b82e1a7c93'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        # Likelihood-to-convert ranking signal, see compute_fit_score() in
        # app/outreach.py. Nullable/no default — existing rows are backfilled
        # separately via scripts/backfill_fit_score.py, not by this migration.
        batch_op.add_column(sa.Column('fit_score', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        batch_op.drop_column('fit_score')
