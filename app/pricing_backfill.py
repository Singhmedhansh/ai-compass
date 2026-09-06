"""Hand-transcribed pricing payloads, and the merge that writes one into a
live CatalogTool row.

Why this is a module and not just a script: the payload here was written for
scripts/set_screenpipe_pricing.py, which can only run from a shell with
production DATABASE_URL — and Render's free plan has no Shell, so it was
never runnable against the row it was written for. It sat unapplied for
days while /go/screenpipe sent commissionable traffic to a listing that
showed no pricing at all.

app/api_routes.py's admin pricing-backfill endpoint is the way around that,
following the same precedent as paypal_diagnostics(): when the only thing
standing between a fix and production is shell access nobody has, the fix
becomes an admin-only route. The script still exists and still works; both
now call apply_pricing_backfill() so the figures live in exactly one place.

Same stance as sync_pricing_to_db.py — the DB is production source of truth,
so this NEVER does a full-record upsert. It matches the existing row by slug
and merges only the keys below into that row's JSON `data` blob, plus the
`affiliate_url` column. Every other key, and every other column, is left
untouched.
"""
import json

from app import db
from app.models import CatalogTool

# Figures transcribed from https://screenpipe.com/pricing (annual toggle) on
# 2026-09-04 and re-confirmed against the live page on 2026-09-07, with the
# student-discount wording corrected per Louis's 2026-09-04 email: "50% off
# the first month of an individual subscription" (not a general 50%
# discount). Monthly-equivalent amounts are the annual-billing prices the
# page displays; the yearly totals are carried in price_display so nothing
# is implied that the page does not state.
_SCREENPIPE_PRICING = {
    "price": "Freemium",
    "pricing": "Freemium",
    "pricing_tier": "freemium",
    "pricingDetail": "Free: $0, Basic: $21/mo billed annually, Business: $42/seat/mo billed annually",
    "pricing_source_url": "https://screenpipe.com/pricing",
    "pricing_verified_at": "2026-09-07",
    "student_perk": True,
    "studentPerk": True,
    "pricing_tiers": {
        "last_verified_at": "2026-09-07",
        "source_url": "https://screenpipe.com/pricing",
        "currency": "USD",
        "tiers": [
            {
                "name": "Free",
                "price_amount": 0,
                "price_display": "$0",
                "features": [
                    "Start on one device",
                    "Capture screen, audio, and meetings on your device",
                    "Search recent work across apps and conversations",
                    "Share selected context with Claude, Codex, and other AI tools",
                    "macOS, Windows, and Linux",
                ],
                "cta_label": "Download Free",
                "cta_url": "https://screenpipe.com",
                "is_popular": False,
            },
            {
                "name": "Basic",
                "price_amount": 21,
                "price_display": "$21/mo billed annually ($250/yr)",
                "features": [
                    "Full personal history",
                    "Full searchable history across apps, meetings, and audio",
                    "Reusable context for Claude, Codex, and other AI tools through MCP",
                    "Unlimited scheduled workflows you install",
                ],
                "cta_label": "Get Basic",
                "cta_url": "https://screenpipe.com/pricing",
                "is_popular": False,
            },
            {
                "name": "Business",
                "price_amount": 42,
                "price_display": "$42/seat/mo billed annually ($500/seat/yr)",
                "features": [
                    "Cross-device and team workflows",
                    "Sync work context across devices",
                    "Recurring workflows grounded in what Screenpipe captures",
                    "Team workspace with managed seats",
                ],
                "cta_label": "Get Business",
                "cta_url": "https://screenpipe.com/pricing",
                "is_popular": True,
                "highlight_label": "Most Popular",
            },
        ],
        "student_discount": (
            "Students, researchers, and faculty get 50% off the first month "
            "of an individual subscription."
        ),
    },
}

# slug -> what to merge. `affiliate_url` is a column rather than a key in the
# `data` blob (see _row_to_record() in app/catalog_store.py, which overlays
# the column onto the record it hands the read path), so it is carried
# separately. The registry in app/affiliates.py stays authoritative for
# /go/<slug>; this write is the belt-and-braces fallback that survives a DB
# restore, matching the ElevenLabs pattern.
BACKFILLS = {
    "screenpipe": {
        "affiliate_url": "https://go.screenpi.pe/ai-compass",
        "data": _SCREENPIPE_PRICING,
    },
}


def _describe(value):
    """A diff line's worth of a value — the tier NAMES for a pricing_tiers
    blob, which is otherwise hundreds of characters of feature copy that
    tells the reader nothing about what changed."""
    if isinstance(value, dict) and isinstance(value.get("tiers"), list):
        return [t.get("name") for t in value["tiers"]]
    return value


def apply_pricing_backfill(slug, commit=False):
    """Merge the registered payload for `slug` into its live CatalogTool row.

    Dry by default: with commit=False it reports exactly what it would change
    and writes nothing, so the same call powers both a preview and the write.

    Returns a dict with `found`, `changes` (one entry per key that actually
    differs) and `committed`. An empty `changes` list on a found row means the
    payload is already applied — that is a success, not a no-op to retry.
    """
    key = str(slug or "").strip().lower()
    payload = BACKFILLS.get(key)
    if payload is None:
        return {"slug": key, "found": False, "known": False,
                "changes": [], "committed": False}

    row = CatalogTool.query.filter(CatalogTool.slug == key).first()
    if row is None:
        return {"slug": key, "found": False, "known": True,
                "changes": [], "committed": False}

    try:
        data = json.loads(row.data) if row.data else {}
    except (ValueError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}

    changes = []
    for field, new in (payload.get("data") or {}).items():
        old = data.get(field, None)
        if old == new:
            continue
        changes.append({
            "field": field,
            "from": _describe(old),
            "to": _describe(new),
        })
        data[field] = new

    affiliate_url = payload.get("affiliate_url")
    if affiliate_url and row.affiliate_url != affiliate_url:
        changes.append({
            "field": "affiliate_url",
            "from": row.affiliate_url,
            "to": affiliate_url,
        })

    result = {
        "slug": key,
        "found": True,
        "known": True,
        "name": row.name,
        "hidden": bool(row.hidden),
        "changes": changes,
        "committed": False,
    }
    if not commit or not changes:
        return result

    row.data = json.dumps(data, ensure_ascii=False)
    if affiliate_url:
        row.affiliate_url = affiliate_url
    db.session.commit()
    result["committed"] = True
    return result
