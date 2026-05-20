"""One-shot cleanup: delete placeholder CatalogTool rows from the live DB.

Why this exists: an admin-panel test left a row with slug `test-tool` /
name `Test_tool` / tagline "Best tool for coding" sitting at the end of
the public /tools listing. The cache-layer guard in
`app/catalog_store.py` hides it from reads, but the row itself still
exists in Postgres — this script removes it.

Usage (locally, against a `DATABASE_URL`-pointed Postgres):

    DATABASE_URL=postgresql://… python scripts/remove_placeholder_tools.py
    DATABASE_URL=postgresql://… python scripts/remove_placeholder_tools.py --apply

The default is a dry run. Pass `--apply` to actually commit the delete.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `from app import ...` work whether you invoke this as
# `python scripts/remove_placeholder_tools.py ...` or `python -m scripts...`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app, db
from app.catalog_store import _is_placeholder
from app.models import CatalogTool


def main(apply: bool) -> int:
    app = create_app()
    with app.app_context():
        victims = [
            r for r in CatalogTool.query.all()
            if _is_placeholder(r.slug, r.name)
        ]
        if not victims:
            print("No placeholder rows found. Nothing to do.")
            return 0

        for r in victims:
            print(f"  - id={r.id} slug={r.slug!r} name={r.name!r}")

        if not apply:
            print(f"\nDry run — {len(victims)} row(s) would be deleted.")
            print("Re-run with --apply to commit.")
            return 0

        for r in victims:
            db.session.delete(r)
        db.session.commit()
        print(f"\nDeleted {len(victims)} placeholder row(s).")
        return 0


if __name__ == "__main__":
    sys.exit(main(apply="--apply" in sys.argv))
