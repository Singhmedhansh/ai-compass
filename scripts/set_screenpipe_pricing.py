"""One-off: write Screenpipe's real pricing (and affiliate URL) into its
live CatalogTool row.

The figures and the merge itself now live in app/pricing_backfill.py, which
this script and the admin `/api/v1/admin/tools/<slug>/pricing-backfill`
endpoint both call — so the transcribed prices exist in exactly one place.

Prefer the endpoint. This script needs a shell holding the production
DATABASE_URL, and Render's free plan has no Shell, which is why the payload
sat unapplied for days after it was written. The script is kept because it
still works anywhere a shell does have that URL.

Dry-run by default. Pass --apply to commit.

    python scripts/set_screenpipe_pricing.py           # preview only
    python scripts/set_screenpipe_pricing.py --apply   # write changes
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.pricing_backfill import apply_pricing_backfill  # noqa: E402

SLUG = "screenpipe"


def main():
    apply = "--apply" in sys.argv

    app = create_app()
    with app.app_context():
        result = apply_pricing_backfill(SLUG, commit=apply)

        if not result["known"]:
            print(f"No backfill registered for slug={SLUG!r} — nothing to do.")
            return 1
        if not result["found"]:
            print(f"No CatalogTool row with slug={SLUG!r} — nothing to do.")
            return 1

        print(f"row: slug={result['slug']} name={result['name']!r} "
              f"hidden={result['hidden']}")
        if not result["changes"]:
            print("  = already applied; nothing to change.")
            return 0
        for change in result["changes"]:
            print(f"  ~ {change['field']}: {change['from']!r} -> {change['to']!r}")

        if not apply:
            print("\nDry run. Re-run with --apply to commit.")
            return 0

        print("\nCommitted.")
        # The read path serves from a process-local cache; the live web
        # workers pick this up on their own DB-count/refresh cycle, and an
        # admin save forces it. Nothing to refresh from this process — the
        # admin endpoint, which runs inside a web worker, does refresh.
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
