"""Sync one or more tools from data/tools.json into the prod CatalogTool table.

Why this exists: `seed_from_json_if_empty()` only runs once — on a fresh
DB. After seeding, edits to data/tools.json don't reach production
unless someone uses the admin panel or runs this script. Use it when
you've sharpened a catalog row in JSON (tagline, features, pricing,
description, etc.) and want the change live without a manual /admin
walk-through.

Usage (against prod from Render shell, where DATABASE_URL is set):

    # Dry-run a single slug (shows what would change)
    python scripts/sync_tools_from_json.py elevenlabs

    # Apply
    python scripts/sync_tools_from_json.py elevenlabs --apply

    # Multiple slugs in one go
    python scripts/sync_tools_from_json.py elevenlabs sudowrite --apply

Safety:
    * Dry-run is the default. Nothing writes without --apply.
    * Diff is printed before the write so you see what changes.
    * Slugs not in tools.json are reported, not created.
    * Uses catalog_store.upsert_tool so it goes through the same
      validation and rollback path as the admin panel.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Make `from app import ...` work whether you invoke this as
# `python scripts/sync_tools_from_json.py ...` or `python -m scripts...`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app
from app.catalog_store import upsert_tool
from app.tool_cache import _load_tools_from_disk


# Catalog columns are authoritative for these fields; everything else is
# stored as JSON in the `data` blob. When showing a diff we ignore noise
# fields that change for non-meaningful reasons (review_count, rating
# computed from votes, etc.).
_NOISE_FIELDS = {
    "review_count", "rating", "weeklyUsers", "trending", "curation_score",
    # `hidden` is admin-managed via /admin and the column is preserved on
    # upsert if the JSON record doesn't carry it — including it in the
    # diff just adds noise.
    "hidden",
}


def _normalise(value: Any) -> str:
    """Compact, stable string form for diff comparison."""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return "" if value is None else str(value)


def _diff(before: dict, after: dict) -> list[tuple[str, str, str]]:
    keys = (set(before) | set(after)) - _NOISE_FIELDS
    rows = []
    for k in sorted(keys):
        b = _normalise(before.get(k))
        a = _normalise(after.get(k))
        if b != a:
            rows.append((k, b, a))
    return rows


def _print_diff(slug: str, before: dict, after: dict) -> bool:
    rows = _diff(before, after)
    if not rows:
        print(f"  {slug}: no changes")
        return False
    print(f"  {slug}: {len(rows)} field(s) would change")
    for key, b, a in rows:
        # Trim long values so a description rewrite doesn't drown the diff
        def _trim(s: str) -> str:
            s = s.replace("\n", " ")
            return s if len(s) <= 140 else s[:137] + "..."
        print(f"    {key}:")
        print(f"      - {_trim(b) if b else '(empty)'}")
        print(f"      + {_trim(a) if a else '(empty)'}")
    return True


def _current_row_record(slug: str) -> dict:
    """Return the current DB record (slug, name, category, data merged)
    so the diff compares like-for-like with the JSON record."""
    from app.models import CatalogTool

    row = CatalogTool.query.filter_by(slug=slug).first()
    if row is None:
        return {}
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
    return rec


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    slugs = [a.strip().lower() for a in argv if a and not a.startswith("--")]
    if not slugs:
        print("usage: sync_tools_from_json.py <slug> [<slug> ...] [--apply]")
        return 2

    app = create_app()
    with app.app_context():
        tools = _load_tools_from_disk() or []
        by_slug = {str(t.get("slug") or "").strip().lower(): t for t in tools if t.get("slug")}

        changed: list[tuple[str, dict]] = []
        for slug in slugs:
            after = by_slug.get(slug)
            if after is None:
                print(f"  {slug}: not found in data/tools.json — skipping")
                continue
            before = _current_row_record(slug)
            if not before:
                print(f"  {slug}: not in prod DB yet — would INSERT")
            if _print_diff(slug, before, after):
                changed.append((slug, after))

        if not changed:
            print("\nNothing to do.")
            return 0

        if not apply:
            print(f"\nDry run — {len(changed)} row(s) would be updated.")
            print("Re-run with --apply to commit.")
            return 0

        applied = 0
        for slug, record in changed:
            if upsert_tool(record):
                print(f"  {slug}: UPDATED")
                applied += 1
            else:
                print(f"  {slug}: FAILED (see logs)")
        print(f"\nApplied {applied}/{len(changed)} updates.")
        return 0 if applied == len(changed) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
