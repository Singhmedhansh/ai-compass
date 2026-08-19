"""add payment_ref and contact_email to sponsor slots

Revision ID: d4b82e1a7c93
Revises: c3a71d9e4f28
Create Date: 2026-08-19 09:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4b82e1a7c93'
down_revision = 'c3a71d9e4f28'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sponsor_slots', schema=None) as batch_op:
        batch_op.add_column(sa.Column('payment_ref', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('contact_email', sa.String(length=255), nullable=True))
        batch_op.create_index(batch_op.f('ix_sponsor_slots_payment_ref'), ['payment_ref'], unique=True)


def downgrade():
    with op.batch_alter_table('sponsor_slots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_payment_ref'))
        batch_op.drop_column('contact_email')
        batch_op.drop_column('payment_ref')
