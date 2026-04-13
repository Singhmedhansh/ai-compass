"""add reviews table and rating unique constraint

Revision ID: b1f3f9b9d0f1
Revises: 79c4860332f8
Create Date: 2026-04-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1f3f9b9d0f1'
down_revision = '79c4860332f8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ratings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tool_slug', sa.String(length=120), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.CheckConstraint('value >= 1 AND value <= 5', name='ck_rating_value_range'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'tool_slug', name='uq_user_tool_rating'),
    )
    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_ratings_tool_slug'), ['tool_slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_ratings_user_id'), ['user_id'], unique=False)

    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tool_slug', sa.String(length=120), nullable=False),
        sa.Column('body', sa.String(length=1000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('is_hidden', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'tool_slug', name='uq_user_tool_review'),
    )
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reviews_tool_slug'), ['tool_slug'], unique=False)


def downgrade():
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reviews_tool_slug'))
    op.drop_table('reviews')

    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ratings_user_id'))
        batch_op.drop_index(batch_op.f('ix_ratings_tool_slug'))
    op.drop_table('ratings')
