"""add tool_claims and tool_edits (claimed listings)

Revision ID: a7d3c5e91b40
Revises: f4c1d8b6a207
Create Date: 2026-08-31 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7d3c5e91b40'
down_revision = 'f4c1d8b6a207'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tool_claims',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tool_slug', sa.String(length=120), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('verified_domain_match', sa.Boolean(), nullable=False),
    sa.Column('evidence', sa.Text(), nullable=True),
    sa.Column('admin_note', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('decided_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('tool_claims', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tool_claims_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_claims_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_claims_tool_slug'), ['tool_slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_claims_user_id'), ['user_id'], unique=False)

    op.create_table('tool_edits',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tool_slug', sa.String(length=120), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('field', sa.String(length=64), nullable=False),
    sa.Column('old_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('tool_edits', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tool_edits_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_edits_tool_slug'), ['tool_slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_edits_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('tool_edits', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tool_edits_user_id'))
        batch_op.drop_index(batch_op.f('ix_tool_edits_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_tool_edits_created_at'))

    op.drop_table('tool_edits')

    with op.batch_alter_table('tool_claims', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tool_claims_user_id'))
        batch_op.drop_index(batch_op.f('ix_tool_claims_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_tool_claims_status'))
        batch_op.drop_index(batch_op.f('ix_tool_claims_created_at'))

    op.drop_table('tool_claims')
