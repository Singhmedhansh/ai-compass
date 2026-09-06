"""One-off: write Screenpipe's real pricing (and affiliate URL) into its
live CatalogTool row.

Same stance as sync_pricing_to_db.py — the DB is production source of truth,
so this NEVER does a full-record upsert. It matches the existing row by slug
and merges only the pricing keys below into that row's JSON `data` blob,
plus the `affiliate_url` column. Every other key, and every other column, is
left untouched.

Figures transcribed from https://screenpipe.com/pricing (annual toggle) on
2026-09-04, with the student-discount wording corrected per Louis's
2026-09-04 email: "50% off the first month of an individual subscription"
(not a general 50% discount). Monthly-equivalent amounts are the
annual-billing prices the page displays; the yearly totals are carried in
price_display so nothing is implied that the page does not state.

The affiliate URL (https://go.screenpi.pe/ai-compass, Dub program approved
2026-09-06) is the same one registered in app/affiliates.py, which is the
authoritative source /go/<slug> checks first — this column write is a
belt-and-braces fallback, matching the ElevenLabs pattern already in that
registry.

Dry-run by default. Pass --apply to commit.

    python scripts/set_screenpipe_pricing.py           # preview only
    python scripts/set_screenpipe_pricing.py --apply   # write changes
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db  # noqa: E402
from app.models import CatalogTool  # noqa: E402

SLUG = "screenpipe"
AFFILIATE_URL = "https://go.screenpi.pe/ai-compass"

PRICING = {
    "price": "Freemium",
    "pricing": "Freemium",
    "pricing_tier": "freemium",
    "pricingDetail": "Free: $0, Basic: $21/mo billed annually, Business: $42/seat/mo billed annually",
    "pricing_source_url": "https://screenpipe.com/pricing",
    "pricing_verified_at": "2026-09-04",
    "student_perk": True,
    "studentPerk": True,
    "pricing_tiers": {
        "last_verified_at": "2026-09-04",
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


def main():
    apply = "--apply" in sys.argv

    app = create_app()
    with app.app_context():
        row = CatalogTool.query.filter(CatalogTool.slug == SLUG).first()
        if row is None:
            print(f"No CatalogTool row with slug={SLUG!r} — nothing to do.")
            return 1

        try:
            data = json.loads(row.data) if row.data else {}
        except (ValueError, TypeError):
            data = {}
        if not isinstance(data, dict):
            data = {}

        print(f"row: slug={row.slug} name={row.name!r} hidden={row.hidden}")
        for key, new in PRICING.items():
            old = data.get(key, "<unset>")
            if old == new:
                print(f"  = {key}: unchanged")
                continue
            if key == "pricing_tiers":
                old_names = (
                    [t.get("name") for t in old.get("tiers", [])]
                    if isinstance(old, dict) else old
                )
                new_names = [t.get("name") for t in new["tiers"]]
                print(f"  ~ {key}: {old_names} -> {new_names}")
            else:
                print(f"  ~ {key}: {old!r} -> {new!r}")
            data[key] = new

        # affiliate_url is a column, not a key in the `data` blob — see
        # _row_to_record() in app/catalog_store.py, which overlays the
        # column onto the record it hands the read path.
        if row.affiliate_url == AFFILIATE_URL:
            print("  = affiliate_url: unchanged")
        else:
            print(f"  ~ affiliate_url: {row.affiliate_url!r} -> {AFFILIATE_URL!r}")

        if not apply:
            print("\nDry run. Re-run with --apply to commit.")
            return 0

        row.data = json.dumps(data, ensure_ascii=False)
        row.affiliate_url = AFFILIATE_URL
        db.session.commit()
        print("\nCommitted.")

        # The read path serves from a process-local cache; the live web
        # workers pick this up on their own DB-count/refresh cycle, and an
        # admin save forces it. Nothing to refresh from this process.
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
