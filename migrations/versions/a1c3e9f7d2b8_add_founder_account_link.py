"""add founder account link (users.must_change_password, submissions.founder_user_id)

Revision ID: a1c3e9f7d2b8
Revises: f2a9c7e1b5d3
Create Date: 2026-08-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1c3e9f7d2b8'
down_revision = 'f2a9c7e1b5d3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='0'))

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('founder_user_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_submissions_founder_user_id'), ['founder_user_id'], unique=False)
        batch_op.create_foreign_key('fk_submissions_founder_user_id_users', 'users', ['founder_user_id'], ['id'])


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_submissions_founder_user_id_users', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_submissions_founder_user_id'))
        batch_op.drop_column('founder_user_id')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('must_change_password')
