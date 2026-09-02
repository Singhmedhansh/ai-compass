"""add campaign scoping to outreach candidates

Adds the three columns the v2 outreach rework needs: which campaign a
candidate belongs to, which lead pool it came from, and the stored
qualification evidence behind its score.

All three are nullable with no server default, so existing rows keep working
untouched — a NULL campaign is exactly what the pre-rework v1 pool is, and
archive_v1_candidates() (app/outreach.py) is what moves those aside
deliberately rather than this migration doing it silently. A migration that
rewrites row state is a migration you cannot roll back.

Revision ID: a2f7c4e91b58
Revises: e4b7a2d9c518
Create Date: 2026-09-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a2f7c4e91b58'
down_revision = 'e4b7a2d9c518'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        # 'q3_qualified_b2b' for the current campaign; NULL for the v1 pool.
        batch_op.add_column(sa.Column('campaign', sa.String(length=50), nullable=True))
        # 'inbound' | 'traffic' | 'cold'
        batch_op.add_column(sa.Column('lead_pool', sa.String(length=20), nullable=True))
        # JSON blob from qualify_candidate(): score + per-signal evidence.
        batch_op.add_column(sa.Column('qualification_json', sa.Text(), nullable=True))

        # Both are filtered on by the admin console on every page load, and
        # the table is small enough that the index cost is irrelevant next to
        # scanning it for every campaign counter.
        batch_op.create_index('ix_outreach_candidates_campaign', ['campaign'])
        batch_op.create_index('ix_outreach_candidates_lead_pool', ['lead_pool'])


def downgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        batch_op.drop_index('ix_outreach_candidates_lead_pool')
        batch_op.drop_index('ix_outreach_candidates_campaign')
        batch_op.drop_column('qualification_json')
        batch_op.drop_column('lead_pool')
        batch_op.drop_column('campaign')
