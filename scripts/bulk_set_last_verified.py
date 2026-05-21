"""Bulk-set the `last_verified_at` field on every visible catalog tool.

Use this when you want a clean "Verified <Month> <Year>" stamp on every
tool in one pass — e.g., after a fresh editorial sweep. Subsequent
single-tool updates can go through the /admin form (it now exposes the
date field) without rerunning this.

Usage (against prod from a shell with DATABASE_URL set, OR locally
against the SQLite dev DB):

    # Dry run — show what would change, no writes
    python scripts/bulk_set_last_verified.py 2026-05-21

    # Apply
    python scripts/bulk_set_last_verified.py 2026-05-21 --apply

    # Only stamp tools that don't yet have a value (don't overwrite)
    python scripts/bulk_set_last_verified.py 2026-05-21 --only-missing --apply

Safety:
    * Dry-run is the default.
    * Skips placeholder rows (test-tool etc.) via the same filter the
      public catalog uses.
    * Uses catalog_store.upsert_tool so each write goes through the
      same validation and rollback as the admin panel.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Make `from app import ...` work whether you invoke this as
# `python scripts/bulk_set_last_verified.py ...` or `python -m scripts...`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app
from app.catalog_store import _is_placeholder, upsert_tool


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    only_missing = "--only-missing" in argv
    date_args = [a for a in argv if a and not a.startswith("--")]
    if len(date_args) != 1 or not _DATE_RE.match(date_args[0]):
        print("usage: bulk_set_last_verified.py <YYYY-MM-DD> [--only-missing] [--apply]")
        return 2

    target_date = date_args[0]

    app = create_app()
    with app.app_context():
        from app.models import CatalogTool

        rows = CatalogTool.query.all()
        would_change = 0
        skipped_placeholder = 0
        skipped_existing = 0

        plan: list[tuple[str, str | None]] = []  # (slug, old_value)
        for r in rows:
            if _is_placeholder(r.slug, r.name):
                skipped_placeholder += 1
                continue
            try:
                rec = json.loads(r.data) if r.data else {}
            except (TypeError, ValueError):
                rec = {}
            if not isinstance(rec, dict):
                rec = {}

            existing = str(rec.get("last_verified_at") or "").strip()
            if only_missing and existing:
                skipped_existing += 1
                continue
            if existing == target_date:
                continue

            plan.append((r.slug, existing or None))
            would_change += 1

        print(f"  Total rows scanned: {len(rows)}")
        print(f"  Placeholder rows skipped: {skipped_placeholder}")
        if only_missing:
            print(f"  Already-stamped rows skipped (--only-missing): {skipped_existing}")
        print(f"  Rows that would be updated: {would_change}")
        if plan and not apply:
            sample = plan[:5]
            print("\n  Sample (first 5):")
            for slug, old in sample:
                old_disp = old or "(empty)"
                print(f"    {slug}:  {old_disp}  ->  {target_date}")
            if len(plan) > 5:
                print(f"    ... and {len(plan) - 5} more")

        if not plan:
            print("\nNothing to do.")
            return 0

        if not apply:
            print("\nDry run. Re-run with --apply to commit.")
            return 0

        # Apply: load full record for each slug, set the field, upsert.
        applied = 0
        for slug, _ in plan:
            row = CatalogTool.query.filter_by(slug=slug).first()
            if row is None:
                continue
            try:
                rec = json.loads(row.data) if row.data else {}
            except (TypeError, ValueError):
                rec = {}
            if not isinstance(rec, dict):
                rec = {}
            rec["slug"] = row.slug
            rec["name"] = row.name
            if row.category:
                rec["category"] = row.category
            rec["hidden"] = bool(row.hidden)
            if row.affiliate_url:
                rec["affiliate_url"] = row.affiliate_url
            rec["last_verified_at"] = target_date

            if upsert_tool(rec):
                applied += 1
            else:
                print(f"  FAILED: {slug}")

        print(f"\nApplied {applied}/{len(plan)} updates.")
        return 0 if applied == len(plan) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
