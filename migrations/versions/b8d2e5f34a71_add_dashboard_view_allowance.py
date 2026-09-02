"""Free-tier dashboard view allowance.

A free listing gets a small number of looks at its own dashboard and is then
asked to upgrade (see FREE_DASHBOARD_VIEW_LIMIT in app/api_routes.py). The
count lives on the submission rather than on the magic-link token, because a
fresh token is one "resend my link" click away.

Revision ID: b8d2e5f34a71
Revises: f7c31a5e0d92
"""

import sqlalchemy as sa
from alembic import op

revision = "b8d2e5f34a71"
down_revision = "f7c31a5e0d92"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("submissions") as batch:
        batch.add_column(sa.Column(
            "dashboard_views", sa.Integer(), nullable=False, server_default="0",
        ))
        batch.add_column(sa.Column("dashboard_last_view_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("submissions") as batch:
        batch.drop_column("dashboard_last_view_at")
        batch.drop_column("dashboard_views")
