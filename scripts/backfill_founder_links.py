"""Backfills Submission.founder_user_id for submissions that were never linked.

founder_user_id was only ever written on the payment-verified path in
submit_tool(), so every free-tier submission — and any paid one whose
welcome email had already gone out when payment verified — kept a NULL
owner. That column is the sole input to `is_founder` (api_routes
._serialize_user), which is what gates the Growth Hub entry in the navbar,
so those founders had no way into a dashboard that /founder/tools was
already built to serve them.

This links each orphaned Submission to the User whose email matches its
submitter_email. It NEVER creates an account: a listing that was submitted
with an address nobody ever signed up under has nothing to link to and is
left alone (that founder still reaches their dashboard by magic link).

Default mode is a read-only dry run.

Usage:
    python scripts/backfill_founder_links.py            # dry run, prints report
    python scripts/backfill_founder_links.py --commit   # writes the links

Run against whatever DATABASE_URL is configured in the environment/.env —
check that before using --commit.
"""
import argparse
import sys

sys.path.insert(0, ".")

from app import create_app, db
from app.models import Submission, User


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Write the links to the DB instead of a dry run")
    args = parser.parse_args()

    # TESTING=True skips the app warmup thread (flask_migrate.upgrade() +
    # ALTER TABLE fallbacks) — this script only needs a read and a plain
    # UPDATE of an existing column, never a schema migration.
    app = create_app({"TESTING": True})
    with app.app_context():
        orphans = Submission.query.filter(Submission.founder_user_id.is_(None)).order_by(
            Submission.id
        ).all()

        linked, unmatched = [], []
        for s in orphans:
            email = str(s.submitter_email or "").strip().lower()
            user = User.query.filter_by(email=email).first() if email else None
            if user is None:
                unmatched.append(s)
                continue
            linked.append((s, user))
            if args.commit:
                s.founder_user_id = user.id

        print(f"{len(orphans)} submission(s) with no founder_user_id")
        print(f"  {len(linked)} match an existing account")
        print(f"  {len(unmatched)} have no account to link to (left alone)")
        print()
        for s, user in linked:
            print(f"  #{s.id:<5} {(s.name or '?')[:38]:<38} {s.status:<9} -> user {user.id} <{user.email}>")
        if unmatched:
            print("\nNo account for:")
            for s in unmatched:
                print(f"  #{s.id:<5} {(s.name or '?')[:38]:<38} <{s.submitter_email or 'no email'}>")

        if args.commit:
            db.session.commit()
            print(f"\nCommitted {len(linked)} link(s).")
        else:
            print("\nDry run — nothing written. Re-run with --commit to apply.")


if __name__ == "__main__":
    main()
