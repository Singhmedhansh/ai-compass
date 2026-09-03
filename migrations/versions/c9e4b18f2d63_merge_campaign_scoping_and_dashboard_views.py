"""merge campaign scoping with the dashboard view allowance

Two heads existed: a2f7c4e91b58 (outreach campaign scoping) and b8d2e5f34a71
(free-tier dashboard view allowance). Alembic refuses to run `upgrade head`
while more than one head is present, and create_app() migrates on boot — so
this had to be resolved before the next deploy, not after someone noticed the
service failing to start.

Cause, recorded so the same mistake is easier to spot next time: the campaign
migration was written with down_revision = e4b7a2d9c518, which was NOT the head
at the time — b8d2e5f34a71 was. Chaining to a mid-chain revision forks the
history rather than extending it. `alembic heads` (or `flask db heads`) is the
authority on what the current head is; reading it off the newest-looking
filename is how you end up here.

A merge revision rather than repointing the campaign migration's parent: a
merge is correct whether or not either branch has already been applied
somewhere, while rewriting down_revision on a revision that has already run
leaves that database's alembic_version pointing at a parent the file no longer
claims.

Nothing to do in either direction — a merge revision only rejoins the graph.

Revision ID: c9e4b18f2d63
Revises: a2f7c4e91b58, b8d2e5f34a71
Create Date: 2026-09-03 00:00:00.000000

"""

# revision identifiers, used by Alembic.
revision = 'c9e4b18f2d63'
down_revision = ('a2f7c4e91b58', 'b8d2e5f34a71')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
