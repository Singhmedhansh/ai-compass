"""Flag owner test rows in the submissions table so reporting stops
counting them as real founder activity.

Why this exists: /admin/tier-breakdown now reports paid attempts and
confirmed revenue. Three rows in production are the owner's own testing —
two junk rows submitted from test@company.com with client-generated
references, and the Manila row, which is a legitimate catalog listing whose
payment_status was set to 'verified' by hand while testing the paid-tier UX.
Left alone, the revenue counter reports $49.99 nobody paid, and a reporting
fix that immediately lies is worse than no reporting at all.

Default behaviour is NON-DESTRUCTIVE: rows are marked is_test=True and, if
still pending, moved to 'rejected' so they leave the review queue. Nothing
is deleted, and nothing is removed from the catalog — Manila stays listed.

    python scripts/mark_test_submissions.py            # dry run, prints plan
    python scripts/mark_test_submissions.py --apply    # writes the changes
    python scripts/mark_test_submissions.py --apply --delete-junk
                                                       # also DELETES the junk
                                                       # rows (irreversible)

--delete-junk only ever touches rows matched as junk (a test email AND no
catalog listing). It will never delete a row that has a CatalogTool
pointing at it.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Addresses only ever used for the owner's own testing.
TEST_EMAILS = {"test@company.com"}

# Payment references that were never real payments.
TEST_REFERENCES = ("INTERNAL-QA",)

# Names/URLs that mark a throwaway row. Matched case-insensitively and only
# in combination with the other signals below, never on their own — a real
# tool could legitimately be called "Test Something".
JUNK_NAME_EXACT = {"test", "teat", "test tool"}


def classify(sub, has_catalog_row):
    """Returns (is_test, is_junk, why) for one submission."""
    email = (sub.submitter_email or "").strip().lower()
    name = (sub.name or "").strip().lower()
    pricing = str(sub.pricing_model or "")

    reasons = []
    if email in TEST_EMAILS:
        reasons.append(f"submitter_email={email}")
    if any(ref in pricing for ref in TEST_REFERENCES):
        reasons.append("internal-QA payment reference")
    if name in JUNK_NAME_EXACT:
        reasons.append(f"placeholder name {sub.name!r}")

    if not reasons:
        return False, False, ""

    # Junk = safe to delete: no catalog listing depends on it.
    is_junk = not has_catalog_row and (email in TEST_EMAILS or name in JUNK_NAME_EXACT)
    return True, is_junk, "; ".join(reasons)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    parser.add_argument("--delete-junk", action="store_true",
                        help="also DELETE junk rows that have no catalog listing")
    args = parser.parse_args()

    from app import create_app, db
    from app.models import CatalogTool, Submission

    app = create_app()
    with app.app_context():
        linked = {
            row.submission_id
            for row in CatalogTool.query.filter(CatalogTool.submission_id.isnot(None)).all()
        }

        to_mark, to_delete = [], []
        for sub in Submission.query.order_by(Submission.id).all():
            is_test, is_junk, why = classify(sub, sub.id in linked)
            if not is_test:
                continue
            if is_junk and args.delete_junk:
                to_delete.append((sub, why))
            else:
                to_mark.append((sub, why, sub.id in linked))

        if not to_mark and not to_delete:
            print("Nothing matched — no test rows to clean.")
            return 0

        print("%s\n" % ("APPLYING CHANGES" if args.apply else "DRY RUN — no changes written"))

        for sub, why, has_listing in to_mark:
            already = " (already flagged)" if sub.is_test else ""
            newstatus = "rejected" if sub.status == "pending" else sub.status
            print(f"  MARK   #{sub.id} {sub.name!r}{already}")
            print(f"         {why}")
            print(f"         is_test -> True | status {sub.status} -> {newstatus}"
                  f" | catalog listing: {'kept' if has_listing else 'none'}")
            if args.apply:
                sub.is_test = True
                sub.status = newstatus

        for sub, why in to_delete:
            print(f"  DELETE #{sub.id} {sub.name!r}  ({why})")
            if args.apply:
                db.session.delete(sub)

        if args.apply:
            db.session.commit()
            print("\nDone.")
        else:
            print("\nRe-run with --apply to write these changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
