"""add submissions.live_email_sent_at

Send-once stamp for the "your listing is live" email (app/listing_live.py).

Revision ID: e4b7a2d9c518
Revises: d1a4f7c02e56
Create Date: 2026-09-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4b7a2d9c518'
down_revision = 'd1a4f7c02e56'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('live_email_sent_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('live_email_sent_at')
