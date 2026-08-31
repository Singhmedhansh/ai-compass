"""add editorial_reviews (commissioned hands-on reviews)

Revision ID: f4c1d8b6a207
Revises: e2b9a4c7d610
Create Date: 2026-08-31 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4c1d8b6a207'
down_revision = 'e2b9a4c7d610'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('editorial_reviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tool_slug', sa.String(length=120), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('headline', sa.String(length=180), nullable=True),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('verdict', sa.Text(), nullable=True),
    sa.Column('pros', sa.Text(), nullable=True),
    sa.Column('cons', sa.Text(), nullable=True),
    sa.Column('screenshots', sa.Text(), nullable=True),
    sa.Column('score', sa.Float(), nullable=True),
    sa.Column('author_name', sa.String(length=120), nullable=True),
    sa.Column('published_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('amount_paid', sa.Float(), nullable=False),
    sa.Column('payment_ref', sa.String(length=64), nullable=True),
    sa.Column('contact_email', sa.String(length=255), nullable=True),
    sa.Column('brief', sa.Text(), nullable=True),
    sa.Column('admin_note', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    # The replay guard: without it one captured PayPal order could mint an
    # unlimited number of commissions. Same rule as sponsor_slots.payment_ref.
    sa.UniqueConstraint('payment_ref'),
    )
    with op.batch_alter_table('editorial_reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_editorial_reviews_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_editorial_reviews_payment_ref'), ['payment_ref'], unique=False)
        batch_op.create_index(batch_op.f('ix_editorial_reviews_published_at'), ['published_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_editorial_reviews_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_editorial_reviews_tool_slug'), ['tool_slug'], unique=False)


def downgrade():
    with op.batch_alter_table('editorial_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_editorial_reviews_tool_slug'))
        batch_op.drop_index(batch_op.f('ix_editorial_reviews_status'))
        batch_op.drop_index(batch_op.f('ix_editorial_reviews_published_at'))
        batch_op.drop_index(batch_op.f('ix_editorial_reviews_payment_ref'))
        batch_op.drop_index(batch_op.f('ix_editorial_reviews_created_at'))

    op.drop_table('editorial_reviews')
