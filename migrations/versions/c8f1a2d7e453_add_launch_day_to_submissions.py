"""add launch_at / launched_at to submissions (Launch Day)

Revision ID: c8f1a2d7e453
Revises: b2e6f4a80c31
Create Date: 2026-08-31 18:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8f1a2d7e453'
down_revision = 'b2e6f4a80c31'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('launch_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('launched_at', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_submissions_launch_at'), ['launch_at'], unique=False)


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_submissions_launch_at'))
        batch_op.drop_column('launched_at')
        batch_op.drop_column('launch_at')
