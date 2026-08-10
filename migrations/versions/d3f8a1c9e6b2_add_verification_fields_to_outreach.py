"""add email verification fields to outreach candidates

Revision ID: d3f8a1c9e6b2
Revises: a4e91c2b7d3f
Create Date: 2026-08-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3f8a1c9e6b2'
down_revision = 'a4e91c2b7d3f'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        # Raw verdict from the email verifier: 'valid' | 'invalid' | 'disposable' | 'catchall' | 'unknown' | NULL (never checked)
        batch_op.add_column(sa.Column('verification_result', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('verified_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('outreach_candidates', schema=None) as batch_op:
        batch_op.drop_column('verified_at')
        batch_op.drop_column('verification_result')
