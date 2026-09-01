"""add logo_data / logo_mime / logo_source to submissions

Revision ID: d1a4f7c02e56
Revises: c8f1a2d7e453
Create Date: 2026-09-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1a4f7c02e56'
down_revision = 'c8f1a2d7e453'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_data', sa.LargeBinary(), nullable=True))
        batch_op.add_column(sa.Column('logo_mime', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('logo_source', sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('logo_source')
        batch_op.drop_column('logo_mime')
        batch_op.drop_column('logo_data')
