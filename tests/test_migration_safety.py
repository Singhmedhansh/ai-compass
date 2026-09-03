"""The migration chain must stay deployable, and it must not be trusted alone.

Two independent failures are guarded here, both of which had already happened
on this repo by the time these tests were written:

1. Multiple alembic heads. Chaining a new revision to a mid-chain revision
   instead of the real head forks the graph. `upgrade head` then refuses to
   run, and because the boot-time upgrade is wrapped in a bare `except`, it
   fails *silently* — nothing is louder than a log line nobody reads.

2. Migration/warmup drift. This is the one that actually bites in production.
   flask_migrate.upgrade() has never progressed on the production database
   (alembic_version was never stamped), so create_app() carries a raw-SQL
   ADD COLUMN fallback that is what genuinely defines the production schema.
   A migration that adds a column *without* a matching entry in that fallback
   applies cleanly everywhere except production, where the column silently
   never exists and every query touching it raises UndefinedColumn.

So the migration passing locally proves very little. The fallback is the
thing under test.
"""
import ast
import io
import os
import re

import pytest

from alembic.config import Config
from alembic.script import ScriptDirectory

MIGRATIONS = "migrations"


def _scripts():
    cfg = Config("migrations/alembic.ini")
    cfg.set_main_option("script_location", MIGRATIONS)
    return ScriptDirectory.from_config(cfg)


def test_there_is_exactly_one_head():
    heads = _scripts().get_heads()
    assert len(heads) == 1, (
        f"{len(heads)} heads present: {heads}. `flask db upgrade` refuses to "
        "run against a forked graph. Resolve it with a merge revision "
        "(`flask db merge -m '...' " + " ".join(heads) + ") rather than by "
        "repointing an existing revision's down_revision, which would strand "
        "any database whose alembic_version already names the old parent."
    )


def test_every_revision_file_is_reachable_from_the_head():
    """A revision file nothing points at will never run, however correct it is.

    The revision set has to come off disk rather than from walk_revisions(),
    which only yields what is already linked into the graph — comparing that
    against itself can never fail.
    """
    s = _scripts()
    reachable = {r.revision for r in s.walk_revisions()}

    on_disk = {}
    d = os.path.join(MIGRATIONS, "versions")
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".py"):
            continue
        text = io.open(os.path.join(d, fn), encoding="utf-8").read()
        m = re.search(r"^revision\s*=\s*['\"]([^'\"]+)['\"]", text, re.M)
        if m:
            on_disk[m.group(1)] = fn

    orphans = sorted((rev, fn) for rev, fn in on_disk.items() if rev not in reachable)
    assert not orphans, (
        "revision files unreachable from the head — these never run:\n"
        + "\n".join(f"  {fn} ({rev})" for rev, fn in orphans)
    )


def _columns_added_by_migrations(table):
    """Every column added to `table` anywhere in the migration history."""
    found = set()
    import os
    d = os.path.join(MIGRATIONS, "versions")
    for fn in os.listdir(d):
        if not fn.endswith(".py"):
            continue
        src = io.open(os.path.join(d, fn), encoding="utf-8").read()
        if table not in src:
            continue
        # batch_alter_table(<table>) blocks, and plain op.add_column(<table>,).
        # The lookahead must stop at the next batch_alter_table: a greedy
        # match runs straight through the following table's block and
        # attributes its columns to this one.
        for m in re.finditer(
            r"batch_alter_table\(\s*['\"]" + re.escape(table) + r"['\"](.*?)(?=batch_alter_table\(|\ndef |\Z)",
            src, re.S,
        ):
            found |= set(re.findall(r"add_column\(\s*sa\.Column\(\s*['\"](\w+)['\"]", m.group(1)))
        found |= set(re.findall(
            r"op\.add_column\(\s*['\"]" + re.escape(table) + r"['\"]\s*,\s*sa\.Column\(\s*['\"](\w+)['\"]",
            src,
        ))
    return found


def _columns_in_warmup_fallback(table):
    """Every column create_app() guarantees for `table` with raw SQL.

    Parsed from the AST rather than imported, because importing create_app
    would need an app context and a database.

    Three spellings are in use and all three count, because a column is just
    as present in production whichever way it was written:

      1. for (col_name, col_type) in [...]: _add_column("<table>", ...)
      2. _add_column("<table>", "<col>", "<type>")   -- one-off, no loop
      3. a hand-written ALTER TABLE <table> ADD COLUMN <col> in a text()

    Missing form 2 or 3 makes this audit report drift that is not real, which
    is worse than useless: a guard that cries wolf gets muted.
    """
    source = io.open("app/__init__.py", encoding="utf-8").read()
    tree = ast.parse(source)
    cols = set()

    for node in ast.walk(tree):
        # Form 1: the loop.
        if isinstance(node, ast.For) and isinstance(node.iter, ast.List):
            body = ast.dump(ast.Module(body=node.body, type_ignores=[]))
            if f"'{table}'" in body:
                for elt in node.iter.elts:
                    if isinstance(elt, ast.Tuple) and elt.elts:
                        first = elt.elts[0]
                        if isinstance(first, ast.Constant) and isinstance(first.value, str):
                            cols.add(first.value)

        # Form 2: a direct _add_column("<table>", "<col>", ...) call.
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "_add_column"
            and len(node.args) >= 2
        ):
            tgt, col = node.args[0], node.args[1]
            if (
                isinstance(tgt, ast.Constant) and tgt.value == table
                and isinstance(col, ast.Constant) and isinstance(col.value, str)
            ):
                cols.add(col.value)

    # Form 3: a literal ALTER TABLE in an f-string or plain string.
    for m in re.finditer(
        r"ALTER\s+TABLE\s+" + re.escape(table)
        + r"\s+ADD\s+COLUMN\s+(?:\{if_not_exists\})?(\w+)",
        source, re.I,
    ):
        cols.add(m.group(1))

    return cols


def _tables_touched_by_migrations():
    """Every table any migration adds a column to."""
    tables = set()
    d = os.path.join(MIGRATIONS, "versions")
    for fn in os.listdir(d):
        if not fn.endswith(".py"):
            continue
        src = io.open(os.path.join(d, fn), encoding="utf-8").read()
        tables |= set(re.findall(r"batch_alter_table\(\s*['\"](\w+)['\"]", src))
        tables |= set(re.findall(r"op\.add_column\(\s*['\"](\w+)['\"]", src))
    return sorted(tables)


@pytest.mark.parametrize("table", _tables_touched_by_migrations())
def test_no_migration_warmup_drift_on_any_table(table):
    """The general form of the campaign-columns bug.

    Restricting this to outreach_candidates would only have caught the failure
    already known about. Run across every table, it found three more of exactly
    the same kind, two of which sat on live paths:

      - catalog_tools.submission_id, JOINed in the founder dashboard and admin
        listing queries
      - sponsor_slots.payment_ref / contact_email, written on every sponsored
        purchase — the revenue path

    A column added to a table that already exists in production is created by
    nothing at all unless it is in the raw-SQL fallback: db.create_all() builds
    missing *tables*, never missing columns, and flask db upgrade does not
    progress on that database.
    """
    migrated = _columns_added_by_migrations(table)
    if not migrated:
        pytest.skip(f"no columns added to {table} by any migration")

    missing = migrated - _columns_in_warmup_fallback(table)
    assert not missing, (
        f"{table}: {sorted(missing)} added by a migration but absent from the "
        "raw-SQL fallback in create_app().\n\n"
        "These will not exist in production. Add them to the fallback (see the "
        f'_add_column("{table}", ...) block in app/__init__.py) — or, if the '
        "table is only ever created fresh by db.create_all(), say so there in "
        "a comment and add them anyway, since the cost is one no-op ALTER."
    )


def test_outreach_columns_have_a_warmup_fallback():
    """The check that would have caught the campaign columns before deploy."""
    table = "outreach_candidates"
    migrated = _columns_added_by_migrations(table)
    fallback = _columns_in_warmup_fallback(table)

    assert migrated, "parser found no migrated columns — the regex has rotted"
    assert fallback, "parser found no warmup fallback — the AST walk has rotted"

    missing = migrated - fallback
    assert not missing, (
        f"{table} columns added by a migration but absent from the raw-SQL "
        f"fallback in create_app(): {sorted(missing)}.\n\n"
        "flask db upgrade does not progress on the production database, so a "
        "migration alone does not create these. Add each one to the "
        "_add_column(\"outreach_candidates\", ...) list in app/__init__.py or "
        "it will not exist in production and every query touching it will "
        "raise UndefinedColumn."
    )


def test_the_campaign_columns_specifically_are_covered():
    """Named explicitly: these are the ones the whole Outreach tab filters on."""
    fallback = _columns_in_warmup_fallback("outreach_candidates")
    for col in ("campaign", "lead_pool", "qualification_json"):
        assert col in fallback, f"{col} missing from the warmup fallback"
