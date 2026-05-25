"""Import catalog drift: upsert any tool that exists in data/tools.json but is
missing from the catalog_tools DB table (the real source of truth once seeded).

WHY THIS EXISTS
---------------
tools.json is only a *one-time seed*. After the DB is seeded, `catalog_tools`
is the source of truth, and `seed_from_json_if_empty()` no-ops because the table
isn't empty. So tools added to tools.json AFTER the initial seed never appear in
the running app (their /api/v1/tools/<slug> returns 404 and their detail pages
don't exist). This script closes that gap.

It is idempotent: re-running only refreshes the JSON blob for already-present
slugs. It targets whatever database DATABASE_URL points to:

    # Local (default — instance/ai_compass.db SQLite):
    python import_catalog_drift.py            # dry run, shows drift
    python import_catalog_drift.py --apply    # perform the upserts

    # Production (Neon/Postgres):
    DATABASE_URL='postgresql://...' python import_catalog_drift.py --apply
"""

import sys

from app import create_app, db  # noqa: E402
from app.catalog_store import upsert_tool  # noqa: E402
from app.models import CatalogTool  # noqa: E402
from app.tool_cache import _load_tools_from_disk  # noqa: E402


def main() -> int:
    apply = "--apply" in sys.argv

    app = create_app()
    with app.app_context():
        uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")
        engine = "sqlite (local)" if uri.startswith("sqlite") else "REMOTE/Postgres"
        print(f"DB target: {engine}")

        json_records = _load_tools_from_disk() or []
        json_by_slug = {
            str(t.get("slug") or "").strip().lower(): t
            for t in json_records
            if t.get("slug")
        }
        db_slugs = {(r.slug or "").strip().lower() for r in CatalogTool.query.all()}

        json_only = sorted(set(json_by_slug) - db_slugs)
        print(f"json_total={len(json_by_slug)}  db_total={len(db_slugs)}  "
              f"missing_from_db={len(json_only)}")
        for s in json_only:
            print(f"  - {s}  ({json_by_slug[s].get('name')})")

        if not json_only:
            print("Nothing to import — DB is in sync with tools.json.")
            return 0

        if not apply:
            print("\nDRY RUN. Re-run with --apply to upsert the above into the DB.")
            return 0

        ok, fail = 0, 0
        for s in json_only:
            if upsert_tool(json_by_slug[s]):
                ok += 1
                print(f"  imported: {s}")
            else:
                fail += 1
                print(f"  FAILED:   {s}")
        db.session.commit()
        print(f"\nDone. imported={ok} failed={fail}")
        return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
