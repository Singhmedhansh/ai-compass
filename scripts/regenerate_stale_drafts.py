"""Regenerates draft_subject/draft_body for stale OutreachCandidate rows —
ones whose draft was generated against an older copy/pricing template than
app.outreach.CURRENT_DRAFT_TEMPLATE_VERSION (see get_stale_draft_candidates()
for exactly what counts as stale). Stamps draft_template_version on every
row it touches so this class of drift is visible going forward instead of
only discoverable by someone noticing stale copy by hand.

Origin: candidates 551/553/554/557/560 were discovered before the
2026-08-25 founding-sponsor $29.99 copy rework deployed, so their stored
drafts still had the old $49.99 price and "4,000+ monthly active visitors /
110K+ impressions" language — with nothing in the automated pipeline
(verification, the cron job) set up to ever regenerate them. This script is
the general-purpose fix: usable for that one-off and for any future stale
batch found via get_stale_draft_candidates() / GET
/api/v1/admin/outreach/stale-drafts.

IMPORTANT — run this where the environment's SECRET_KEY and (ideally)
GEMINI_API_KEY actually match what the live app uses:
  - Every draft embeds a signed unsubscribe token (make_unsubscribe_token,
    signed with Flask's SECRET_KEY). If this runs somewhere SECRET_KEY
    doesn't match production's, the regenerated draft's unsubscribe link
    will fail verification for the recipient — silently, since nothing
    would look wrong until someone actually clicks it.
  - Without GEMINI_API_KEY / GEMINI_API_KEYS configured, generate_draft_via_
    gemini() itself falls back to get_generic_draft() — a valid, tested
    output, but not the personalized Gemini copy production normally sends.
Run this from an environment where those secrets are the real ones (e.g. a
Render shell), not blindly from a local dev machine against the production
DATABASE_URL, unless you've separately confirmed the values match.

Usage:
    python scripts/regenerate_stale_drafts.py --ids 551 553 554 557 560   # dry run, prints before/after
    python scripts/regenerate_stale_drafts.py --all-stale                # every currently-stale row
    python scripts/regenerate_stale_drafts.py --ids 551 553 --commit     # also writes to the DB

Default mode is a dry run (prints old vs. new subject/body, nothing
written). Pass --commit to persist.
"""
import argparse
import sys

sys.path.insert(0, ".")

from app import create_app, db
from app.models import OutreachCandidate
from app.outreach import (
    generate_draft_via_gemini,
    get_stale_draft_candidates,
    CURRENT_DRAFT_TEMPLATE_VERSION,
)


def _regenerate_one(c):
    old_subject, old_body = c.draft_subject, c.draft_body
    new_subject, new_body = generate_draft_via_gemini(c)
    return old_subject, old_body, new_subject, new_body


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ids", type=int, nargs="+", help="Specific candidate IDs to regenerate")
    group.add_argument("--all-stale", action="store_true", help="Regenerate every candidate get_stale_draft_candidates() currently reports")
    parser.add_argument("--commit", action="store_true", help="Write the regenerated draft + version to the DB instead of a dry run")
    args = parser.parse_args()

    # TESTING=True skips the app warmup thread (flask_migrate.upgrade() +
    # ALTER TABLE fallbacks) — this script only needs the draft_template_version
    # column to already exist (from this branch's migration/warmup once
    # deployed), never to run a schema migration itself. See
    # scripts/backfill_fit_score.py for the same reasoning.
    app = create_app({"TESTING": True})
    with app.app_context():
        if args.all_stale:
            candidates = get_stale_draft_candidates()
        else:
            candidates = OutreachCandidate.query.filter(OutreachCandidate.id.in_(args.ids)).all()
            found_ids = {c.id for c in candidates}
            missing = set(args.ids) - found_ids
            if missing:
                print(f"WARNING: candidate id(s) not found: {sorted(missing)}")

        if not candidates:
            print("Nothing to regenerate.")
            return

        print(f"Regenerating {len(candidates)} draft(s) (target version {CURRENT_DRAFT_TEMPLATE_VERSION})...\n")

        results = []
        for c in candidates:
            old_subject, old_body, new_subject, new_body = _regenerate_one(c)
            results.append((c, old_subject, old_body, new_subject, new_body))

            print(f"--- id={c.id} | {c.product_name} | email={c.email} "
                  f"| was version={c.draft_template_version} ---")
            print(f"  OLD SUBJECT: {old_subject}")
            print(f"  OLD BODY (first 200 chars): {(old_body or '')[:200]}")
            print(f"  NEW SUBJECT: {new_subject}")
            print(f"  NEW BODY (first 200 chars): {(new_body or '')[:200]}")
            print()

        if args.commit:
            for c, _, _, new_subject, new_body in results:
                c.draft_subject = new_subject
                c.draft_body = new_body
                c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
            db.session.commit()
            print(f"--commit passed: {len(results)} row(s) written, stamped version {CURRENT_DRAFT_TEMPLATE_VERSION}.")
        else:
            print("Dry run only — nothing written. Pass --commit to persist.")


if __name__ == "__main__":
    main()
