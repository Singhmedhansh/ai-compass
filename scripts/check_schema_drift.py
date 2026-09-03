"""Read-only report of columns the models expect but the database lacks.

Why this exists
---------------
`flask db upgrade` has never progressed on the production database — the
alembic chain was written to patch a schema `db.create_all()` had already
built, so from an unstamped database it fails on "table already exists" at the
very first revision and never advances. What actually defines the production
schema is therefore two things:

  1. db.create_all(), which creates missing *tables* complete from the models
     but will never add a column to a table that already exists, and
  2. the raw-SQL ADD COLUMN fallback in create_app().

That leaves a gap nothing closes on its own: a column added to a model, or by
a migration, *after* its table already existed in production is created by
neither. It is invisible everywhere except production, because every test and
every fresh database gets the whole table from create_all().

tests/test_migration_safety.py guards the case that can be checked statically
(a migration adds a column, the fallback does not). It cannot see a column
added straight to a model with no migration at all. Only the live schema can
settle that, which is what this script reads.

Safety
------
Strictly read-only. It issues no DDL and no writes of any kind — it inspects
the schema and prints. It will not repair anything; the output tells you which
entries to add to the fallback list in app/__init__.py.

Usage
-----
    DATABASE_URL=postgres://... python scripts/check_schema_drift.py

Exits 1 if drift is found, so it can be wired into a deploy check.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Postgres type names as reported by information_schema, mapped to something
# that can be pasted straight into the fallback list.
_SUGGESTED_DDL = {
    "VARCHAR": "VARCHAR(255)",
    "TEXT": "TEXT",
    "INTEGER": "INTEGER",
    "BIGINT": "BIGINT",
    "BOOLEAN": "BOOLEAN DEFAULT FALSE",
    "DATETIME": "TIMESTAMP",
    "TIMESTAMP": "TIMESTAMP",
    "FLOAT": "DOUBLE PRECISION",
    "NUMERIC": "NUMERIC",
    "BLOB": "BYTEA",
    "LARGEBINARY": "BYTEA",
    "JSON": "JSON",
}


def _ddl_for(column):
    name = type(column.type).__name__.upper()
    guess = _SUGGESTED_DDL.get(name)
    if guess:
        return guess
    try:
        return str(column.type)
    except Exception:
        return "TEXT"


def main():
    url = os.environ.get("DATABASE_URL") or os.environ.get("SQLALCHEMY_DATABASE_URI")
    if not url:
        print("Set DATABASE_URL (or SQLALCHEMY_DATABASE_URI) first.", file=sys.stderr)
        return 2

    # Render hands out the legacy postgres:// scheme, which SQLAlchemy 2 no
    # longer registers.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    from sqlalchemy import create_engine, inspect

    from app import db  # noqa: F401
    import app.models  # noqa: F401

    engine = create_engine(url)
    insp = inspect(engine)
    live_tables = set(insp.get_table_names())

    missing_tables = []
    drift = {}

    for name, table in sorted(db.Model.metadata.tables.items()):
        if name not in live_tables:
            # create_all() will build this one complete on next boot.
            missing_tables.append(name)
            continue
        live_cols = {c["name"] for c in insp.get_columns(name)}
        gap = [c for c in table.columns if c.name not in live_cols]
        if gap:
            drift[name] = gap

    print("Tables in the models: %d" % len(db.Model.metadata.tables))
    print("Tables in the database: %d" % len(live_tables))
    print()

    if missing_tables:
        print("Absent from the database (db.create_all() will build these complete):")
        for t in missing_tables:
            print("  %s" % t)
        print()

    if not drift:
        print("No column drift. Every model column exists in the database.")
        return 0

    print("COLUMN DRIFT - present in the models, absent from the database.")
    print("Each of these raises UndefinedColumn the moment a query touches it.")
    print()
    for table, cols in sorted(drift.items()):
        print("  %s" % table)
        for c in cols:
            print('    ("%s", "%s"),%s' % (
                c.name, _ddl_for(c),
                "" if c.nullable else "   # NOT NULL in the model - needs a DEFAULT",
            ))
        print()
    print("Add the tuples above to the matching _add_column(...) block in")
    print("app/__init__.py, then redeploy. Do not hand-ALTER production: the")
    print("fallback has to carry them or the next fresh instance drifts again.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
