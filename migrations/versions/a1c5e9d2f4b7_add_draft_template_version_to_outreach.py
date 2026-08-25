"""add draft_template_version to outreach candidates

Revision ID: a1c5e9d2f4b7
Revises: f2a9c7e1b5d3
Create Date: 2026-08-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1c5e9d2f4b7'
down_revision = 'f2a9c7e1b5d3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        # Copy/pricing template version stamped when draft_subject/draft_body
        # were generated, see CURRENT_DRAFT_TEMPLATE_VERSION in
        # app/outreach.py. Nullable/no default — existing rows predate this
        # column and are treated as stale (NULL) by get_stale_draft_candidates(),
        # not backfilled by this migration.
        batch_op.add_column(sa.Column('draft_template_version', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        batch_op.drop_column('draft_template_version')
