"""Founder-uploaded logos on catalog_tools.

A maker who claims a listing can replace its logo (see app/claims.py). The
bytes live on the catalog row rather than on Submission.logo_data because
most of the catalog was seeded editorially and has no Submission at all —
and those are exactly the listings a maker claims in order to fix.

Revision ID: f7c31a5e0d92
Revises: e4b7a2d9c518
"""

import sqlalchemy as sa
from alembic import op

revision = "f7c31a5e0d92"
down_revision = "e4b7a2d9c518"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("catalog_tools") as batch:
        batch.add_column(sa.Column("logo_data", sa.LargeBinary(), nullable=True))
        batch.add_column(sa.Column("logo_mime", sa.String(length=32), nullable=True))


def downgrade():
    with op.batch_alter_table("catalog_tools") as batch:
        batch.drop_column("logo_mime")
        batch.drop_column("logo_data")
