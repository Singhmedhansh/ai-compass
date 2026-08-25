"""add submissions.welcome_email_sent_at

Revision ID: b3d7f0c5a4e1
Revises: a1c3e9f7d2b8
Create Date: 2026-08-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3d7f0c5a4e1'
down_revision = 'a1c3e9f7d2b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('welcome_email_sent_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('welcome_email_sent_at')
