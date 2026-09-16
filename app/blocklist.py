"""The one place that answers "is this address barred from AI Compass?".

Two sources, checked in this order:

  1. the BLOCKED_EMAILS env var (comma-separated), and
  2. the blocked_emails table.

The env var is first because it cannot fail. A denylist whose guarantee
depends on a database read is only as reliable as that read, and the whole
point of this module is to make "never email this person again" true rather
than usually true — so there is a path that holds even when the DB is
unreachable mid-request.

Neither source lives in source control. This repository is public, so writing
a blocked address into a Python file would publish the address the block
exists to protect. Both sources are data: one in the environment, one in a
table.

## On failure behaviour

A DB error here does NOT bar the send. That is a deliberate trade and worth
stating plainly, because it is the weaker half of the guarantee: if the
blocked_emails read raises, only the env list is consulted, so an address
blocked *only* in the table could receive mail during a database outage. The
alternative — treat an unreadable table as "block everything" — would turn a
transient DB blip into a total email outage, taking password resets and
payment receipts with it.

For an address that must never be mailed under any circumstances, put it in
BLOCKED_EMAILS as well as the table. Belt and braces, and the belt does not
need a database.
"""
import logging
import os

log = logging.getLogger(__name__)


def _env_blocked() -> set[str]:
    raw = os.environ.get("BLOCKED_EMAILS", "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def is_email_blocked(email: str | None) -> bool:
    """True if this address may not be mailed and may not hold an account."""
    if not email:
        return False
    addr = email.strip().lower()
    if not addr:
        return False

    if addr in _env_blocked():
        return True

    try:
        from app.models import BlockedEmail, db

        return db.session.query(
            db.session.query(BlockedEmail.id)
            .filter(db.func.lower(BlockedEmail.email) == addr)
            .exists()
        ).scalar() is True
    except Exception as exc:
        # Includes the case where the table does not exist yet (a deploy that
        # has not run create_all). Logged rather than raised: an unreadable
        # denylist must not be able to break login or email for everyone.
        log.warning("blocked_emails lookup failed for a send/login check: %s", exc)
        return False


def blocked_emails_summary() -> dict:
    """Counts for an admin view / diagnostics. Never returns the addresses."""
    env_count = len(_env_blocked())
    try:
        from app.models import BlockedEmail

        db_count = BlockedEmail.query.count()
    except Exception:
        db_count = None
    return {"env": env_count, "table": db_count}
