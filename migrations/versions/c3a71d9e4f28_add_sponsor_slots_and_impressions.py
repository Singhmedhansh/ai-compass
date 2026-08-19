"""add sponsor slots and impressions

Revision ID: c3a71d9e4f28
Revises: 98bb4054a270
Create Date: 2026-08-18 22:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3a71d9e4f28'
down_revision = '98bb4054a270'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('sponsor_slots',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tool_slug', sa.String(length=120), nullable=False),
    sa.Column('placement', sa.String(length=20), nullable=False),
    sa.Column('tier', sa.String(length=20), nullable=False),
    sa.Column('headline', sa.String(length=140), nullable=True),
    sa.Column('blurb', sa.String(length=280), nullable=True),
    sa.Column('cta_label', sa.String(length=40), nullable=True),
    sa.Column('starts_at', sa.DateTime(), nullable=False),
    sa.Column('ends_at', sa.DateTime(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=True),
    sa.Column('amount_paid', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('sponsor_slots', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sponsor_slots_ends_at'), ['ends_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_slots_is_active'), ['is_active'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_slots_placement'), ['placement'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_slots_starts_at'), ['starts_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_slots_submission_id'), ['submission_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_slots_tool_slug'), ['tool_slug'], unique=False)

    op.create_table('sponsor_impressions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slot_id', sa.Integer(), nullable=True),
    sa.Column('tool_slug', sa.String(length=120), nullable=False),
    sa.Column('placement', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('sponsor_impressions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sponsor_impressions_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_impressions_slot_id'), ['slot_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_sponsor_impressions_tool_slug'), ['tool_slug'], unique=False)


def downgrade():
    with op.batch_alter_table('sponsor_impressions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sponsor_impressions_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_sponsor_impressions_slot_id'))
        batch_op.drop_index(batch_op.f('ix_sponsor_impressions_created_at'))

    op.drop_table('sponsor_impressions')

    with op.batch_alter_table('sponsor_slots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_submission_id'))
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_starts_at'))
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_placement'))
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_is_active'))
        batch_op.drop_index(batch_op.f('ix_sponsor_slots_ends_at'))

    op.drop_table('sponsor_slots')
