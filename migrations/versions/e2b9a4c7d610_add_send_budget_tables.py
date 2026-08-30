"""add send_budget + digest_recipient_log for the shared daily send budget

Revision ID: e2b9a4c7d610
Revises: 8eb158635137
Create Date: 2026-08-29 00:00:00.000000

Note: on the production DB flask_migrate.upgrade() has historically not
advanced past the first revision (see app/__init__.py:_warm_up), so these
two brand-new tables are actually created there by db.create_all(). This
migration keeps local/dev and a future clean history correct.
"""
from alembic import op
import sqlalchemy as sa


revision = 'e2b9a4c7d610'
down_revision = '8eb158635137'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'send_budget',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('sent_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cap', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('digest_sent_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('date'),
    )
    op.create_table(
        'digest_recipient_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('sent_on', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('digest_recipient_log', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_digest_recipient_log_email'), ['email'], unique=False)


def downgrade():
    with op.batch_alter_table('digest_recipient_log', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_digest_recipient_log_email'))
    op.drop_table('digest_recipient_log')
    op.drop_table('send_budget')
