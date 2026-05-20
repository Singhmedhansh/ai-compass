"""Database-backed catalog store.

tools.json becomes a one-time seed. After that, CatalogTool (Postgres) is
the source of truth, so admin edits persist across Render's ephemeral
filesystem / redeploys.

Every function is defensive: on ANY failure (no app context, missing
table, empty table) it returns a sentinel so tool_cache can fall back to
the JSON loader. The live site must never break because of this layer.
"""

from __future__ import annotations

import json
import logging

log = logging.getLogger(__name__)


# Belt-and-braces guard: rows whose slug or name screams "left-over admin
# fixture" must never reach the public catalog, even if someone later adds
# another one via the admin panel. Keep this list short and obvious.
_PLACEHOLDER_SLUGS: set[str] = {"test-tool", "test", "placeholder", "example"}
_PLACEHOLDER_NAMES: set[str] = {"test_tool", "test tool", "placeholder", "example"}


def _is_placeholder(slug: str, name: str) -> bool:
    s = (slug or "").strip().lower()
    n = (name or "").strip().lower()
    return s in _PLACEHOLDER_SLUGS or n in _PLACEHOLDER_NAMES


def _row_to_record(row) -> dict:
    try:
        rec = json.loads(row.data) if row.data else {}
    except (ValueError, TypeError):
        rec = {}
    if not isinstance(rec, dict):
        rec = {}
    # Column values are authoritative for the queryable fields.
    rec["slug"] = row.slug
    rec["name"] = row.name
    if row.category:
        rec["category"] = row.category
    rec["hidden"] = bool(row.hidden)
    if row.affiliate_url:
        rec["affiliate_url"] = row.affiliate_url
    return rec


def load_tools_from_db():
    """Return list of normalized tool dicts, or None if DB unavailable/empty
    (caller then falls back to JSON)."""
    try:
        from app.models import CatalogTool

        rows = (
            CatalogTool.query
            .order_by(CatalogTool.sort_order.is_(None), CatalogTool.sort_order, CatalogTool.name)
            .all()
        )
        if not rows:
            return None
        records = []
        for r in rows:
            if _is_placeholder(r.slug, r.name):
                log.info("catalog_store: skipping placeholder row slug=%s name=%s", r.slug, r.name)
                continue
            records.append(_row_to_record(r))
        return records or None
    except Exception as exc:  # noqa: BLE001 — never break the read path
        log.warning("catalog_store.load_tools_from_db failed, falling back: %s", exc)
        return None


def seed_from_json_if_empty() -> int:
    """One-time import of tools.json into CatalogTool. Idempotent — only
    seeds when the table is empty. Returns rows inserted (0 if already
    seeded or on failure)."""
    try:
        from app import db
        from app.models import CatalogTool
        from app.tool_cache import _load_tools_from_disk

        if CatalogTool.query.first() is not None:
            return 0

        tools = _load_tools_from_disk() or []
        inserted = 0
        for i, t in enumerate(tools):
            slug = str(t.get("slug") or "").strip().lower()
            name = str(t.get("name") or "").strip()
            if not slug or not name:
                continue
            db.session.add(CatalogTool(
                slug=slug,
                name=name,
                category=str(t.get("category") or "").strip() or None,
                hidden=bool(t.get("hidden", False)),
                affiliate_url=(t.get("affiliate_url") or None),
                data=json.dumps(t, ensure_ascii=False),
                sort_order=i,
            ))
            inserted += 1
        db.session.commit()
        log.info("Seeded catalog_tools with %s rows from tools.json", inserted)
        return inserted
    except Exception as exc:  # noqa: BLE001
        log.warning("catalog_store.seed_from_json_if_empty failed: %s", exc)
        try:
            from app import db
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return 0


def upsert_tool(record: dict) -> bool:
    """Create or update one tool from a normalized dict. Returns success."""
    try:
        from app import db
        from app.models import CatalogTool

        slug = str(record.get("slug") or "").strip().lower()
        name = str(record.get("name") or "").strip()
        if not slug or not name:
            return False

        row = CatalogTool.query.filter_by(slug=slug).first()
        if row is None:
            row = CatalogTool(slug=slug)
            db.session.add(row)
        row.name = name
        row.category = str(record.get("category") or "").strip() or None
        row.hidden = bool(record.get("hidden", row.hidden if row.id else False))
        row.affiliate_url = record.get("affiliate_url") or None
        row.data = json.dumps(record, ensure_ascii=False)
        db.session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("catalog_store.upsert_tool failed: %s", exc)
        try:
            from app import db
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return False


def delete_tool(slug: str) -> bool:
    try:
        from app import db
        from app.models import CatalogTool

        row = CatalogTool.query.filter_by(slug=str(slug or "").strip().lower()).first()
        if row is None:
            return False
        db.session.delete(row)
        db.session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("catalog_store.delete_tool failed: %s", exc)
        try:
            from app import db
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return False


def set_fields(slug: str, *, hidden=None, affiliate_url=None) -> bool:
    """Lightweight column-only update (hide/show, affiliate URL) that also
    keeps the JSON blob's mirrored keys in sync."""
    try:
        from app import db
        from app.models import CatalogTool

        row = CatalogTool.query.filter_by(slug=str(slug or "").strip().lower()).first()
        if row is None:
            return False
        try:
            rec = json.loads(row.data) if row.data else {}
        except (ValueError, TypeError):
            rec = {}
        if hidden is not None:
            row.hidden = bool(hidden)
            rec["hidden"] = bool(hidden)
        if affiliate_url is not None:
            row.affiliate_url = affiliate_url or None
            if affiliate_url:
                rec["affiliate_url"] = affiliate_url
            else:
                rec.pop("affiliate_url", None)
        row.data = json.dumps(rec, ensure_ascii=False)
        db.session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("catalog_store.set_fields failed: %s", exc)
        try:
            from app import db
            db.session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return False
