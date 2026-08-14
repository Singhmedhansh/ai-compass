"""Canonical 3-tier submission pricing ladder.

Single source of truth for the tier prefixes/amounts used by submit_tool()
and admin_approve_submission() in api_routes.py — change a price here, not
in three call sites. No Flask/DB imports, so it's safe to import anywhere
without risking a circular import.
"""

TIERS = {
    # visibility_delay_days: how long an approved submission sits in the
    # catalog (row exists, hidden=False) before it actually appears in
    # get_visible_tools() — paying more buys a shorter wait, same idea as
    # the priority review queue. See catalog_tools.visible_at.
    "free": {"prefix": "free", "price": 0.0, "paid": False, "visibility_delay_days": 14},
    "quick": {"prefix": "quick", "price": 14.99, "paid": True, "visibility_delay_days": 2},
    "sponsored": {"prefix": "sponsored", "price": 49.99, "paid": True, "visibility_delay_days": 1},
}


def visibility_delay_days_for_tier(tier_key):
    """Days an approved submission waits before going live. Unrecognized
    tiers fall back to the free-tier (longest/safest) delay."""
    return TIERS.get(tier_key, TIERS["free"])["visibility_delay_days"]


def tier_for_pricing_model(pricing_model_raw):
    """Returns 'quick' | 'sponsored' | 'free' | None (unrecognized).

    Matches by prefix against the raw or composite pricing_model string
    (e.g. "quick_paypal" or "sponsored_paypal:8AB12345"). Tier prefixes are
    mutually exclusive by construction, so first-match-wins is safe.
    """
    raw = str(pricing_model_raw or "")
    for key, cfg in TIERS.items():
        if raw.startswith(cfg["prefix"]):
            return key
    return None
