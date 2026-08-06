"""add payment verification and priority fields to submission

Revision ID: a4e91c2b7d3f
Revises: b7f4257123f2
Create Date: 2026-08-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4e91c2b7d3f'
down_revision = 'b7f4257123f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        # 'unpaid' | 'verified' | 'unverified_review' | 'rejected'
        batch_op.add_column(sa.Column('payment_status', sa.String(length=20), server_default='unpaid', nullable=False))
        batch_op.add_column(sa.Column('payment_note', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('is_priority', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('is_priority')
        batch_op.drop_column('payment_note')
        batch_op.drop_column('payment_status')
