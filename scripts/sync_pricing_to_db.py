"""Non-destructive pricing sync: tools.json -> CatalogTool (the live DB).

The DB is the production source of truth and has diverged from tools.json
(extra rows, admin-only edits like affiliate_url / hidden). So this script
NEVER does a full-record upsert. For each tool it:

  - matches an EXISTING CatalogTool row by slug (never creates/deletes rows),
  - merges ONLY the pricing keys into that row's JSON `data` blob,
  - leaves every other key in `data` and every column (name, category,
    hidden, affiliate_url) untouched.

Dry-run by default. Pass --apply to commit.

    python scripts/sync_pricing_to_db.py            # preview only
    python scripts/sync_pricing_to_db.py --apply     # write changes

On Render, run as a one-off job against the production DATABASE_URL.
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db  # noqa: E402
from app.models import CatalogTool  # noqa: E402

# Only these keys are ever written. Adding a key here is the only way to
# widen the blast radius — keep it tight.
PRICING_KEYS = (
    "price",
    "pricing",
    "pricing_tier",
    "pricingDetail",
    "pricing_tiers",
    "pricing_source_url",
    "pricing_verified_at",
)

JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "tools.json",
)


def main():
    apply = "--apply" in sys.argv
    tools = json.load(io.open(JSON_PATH, encoding="utf-8"))
    by_slug = {
        str(t.get("slug") or "").strip().lower(): t
        for t in tools
        if t.get("slug")
    }

    app = create_app()
    with app.app_context():
        rows = CatalogTool.query.all()
        db_slugs = set()
        updated = 0
        unchanged = 0
        skipped_no_json = 0

        for row in rows:
            slug = str(row.slug or "").strip().lower()
            db_slugs.add(slug)
            src = by_slug.get(slug)
            if src is None:
                # DB-only tool (e.g. the prod-only extra). Left untouched.
                skipped_no_json += 1
                continue

            try:
                rec = json.loads(row.data) if row.data else {}
            except (ValueError, TypeError):
                rec = {}

            changes = {}
            for key in PRICING_KEYS:
                if key in src and src[key] != rec.get(key):
                    changes[key] = src[key]

            if not changes:
                unchanged += 1
                continue

            updated += 1
            print(f"  {slug}: {', '.join(sorted(changes))}")
            if apply:
                rec.update(changes)
                row.data = json.dumps(rec, ensure_ascii=False)

        json_only = sorted(set(by_slug) - db_slugs)

        print()
        print(f"DB rows scanned        : {len(rows)}")
        print(f"Pricing fields changed : {updated}")
        print(f"Already in sync        : {unchanged}")
        print(f"DB-only (untouched)    : {skipped_no_json}")
        print(f"JSON-only (not in DB)  : {len(json_only)}")
        if json_only:
            print("  " + ", ".join(json_only[:30]) + (" ..." if len(json_only) > 30 else ""))

        if apply and updated:
            db.session.commit()
            print(f"\nCOMMITTED {updated} pricing-only updates.")
        elif apply:
            print("\nNothing to commit.")
        else:
            print("\nDRY RUN — re-run with --apply to write these changes.")


if __name__ == "__main__":
    main()
