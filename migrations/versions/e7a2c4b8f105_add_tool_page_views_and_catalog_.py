"""add tool_page_views table and catalog_tools.submission_id

Revision ID: e7a2c4b8f105
Revises: d3f8a1c9e6b2
Create Date: 2026-08-16 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e7a2c4b8f105"
down_revision = "d3f8a1c9e6b2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "tool_page_views" not in table_names:
        op.create_table(
            "tool_page_views",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("slug", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        with op.batch_alter_table("tool_page_views", schema=None) as batch_op:
            batch_op.create_index(batch_op.f("ix_tool_page_views_slug"), ["slug"], unique=False)
            batch_op.create_index(batch_op.f("ix_tool_page_views_created_at"), ["created_at"], unique=False)

    if "catalog_tools" in table_names:
        catalog_columns = {col["name"] for col in inspector.get_columns("catalog_tools")}
        if "submission_id" not in catalog_columns:
            with op.batch_alter_table("catalog_tools", schema=None) as batch_op:
                batch_op.add_column(sa.Column("submission_id", sa.Integer(), nullable=True))
                batch_op.create_index(batch_op.f("ix_catalog_tools_submission_id"), ["submission_id"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "catalog_tools" in table_names:
        catalog_columns = {col["name"] for col in inspector.get_columns("catalog_tools")}
        if "submission_id" in catalog_columns:
            with op.batch_alter_table("catalog_tools", schema=None) as batch_op:
                batch_op.drop_index(batch_op.f("ix_catalog_tools_submission_id"))
                batch_op.drop_column("submission_id")

    if "tool_page_views" in table_names:
        with op.batch_alter_table("tool_page_views", schema=None) as batch_op:
            batch_op.drop_index(batch_op.f("ix_tool_page_views_created_at"))
            batch_op.drop_index(batch_op.f("ix_tool_page_views_slug"))
        op.drop_table("tool_page_views")
