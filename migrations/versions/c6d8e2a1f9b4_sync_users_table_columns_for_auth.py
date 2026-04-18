"""sync users table columns for auth

Revision ID: c6d8e2a1f9b4
Revises: b1f3f9b9d0f1
Create Date: 2026-04-18 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c6d8e2a1f9b4"
down_revision = "b1f3f9b9d0f1"
branch_labels = None
depends_on = None


def _users_table_columns():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if "users" not in table_names:
        return None
    return {col["name"] for col in inspector.get_columns("users")}


def _add_if_missing(column_name, column):
    columns = _users_table_columns()
    if columns is None or column_name in columns:
        return
    op.add_column("users", column)


def upgrade():
    _add_if_missing("password_hash", sa.Column("password_hash", sa.String(length=255), nullable=True))
    _add_if_missing("display_name", sa.Column("display_name", sa.String(length=255), nullable=True))
    _add_if_missing("oauth_picture_url", sa.Column("oauth_picture_url", sa.String(length=500), nullable=True))
    _add_if_missing("oauth_provider", sa.Column("oauth_provider", sa.String(length=50), nullable=True))

    _add_if_missing(
        "student_status",
        sa.Column("student_status", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _add_if_missing(
        "first_login",
        sa.Column("first_login", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    _add_if_missing(
        "onboarding_completed",
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    _add_if_missing("preferences", sa.Column("preferences", sa.Text(), nullable=True))
    _add_if_missing("interests", sa.Column("interests", sa.Text(), nullable=True))
    _add_if_missing("skill_level", sa.Column("skill_level", sa.String(length=32), nullable=True))
    _add_if_missing("pricing_pref", sa.Column("pricing_pref", sa.String(length=32), nullable=True))
    _add_if_missing("goals", sa.Column("goals", sa.Text(), nullable=True))
    _add_if_missing("theme_preference", sa.Column("theme_preference", sa.String(length=20), nullable=True))
    _add_if_missing(
        "notifications_enabled",
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    _add_if_missing("created_at", sa.Column("created_at", sa.DateTime(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    for name in [
        "created_at",
        "notifications_enabled",
        "theme_preference",
        "goals",
        "pricing_pref",
        "skill_level",
        "interests",
        "preferences",
        "onboarding_completed",
        "first_login",
        "student_status",
        "oauth_provider",
        "oauth_picture_url",
        "display_name",
        "password_hash",
    ]:
        if name in existing:
            op.drop_column("users", name)
