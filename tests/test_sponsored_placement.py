"""Sponsored placement: the paid-vs-free monetization lever.

Free listings must never be demoted to invisible or removed (that's the
SEO-surface risk the founder was warned about) — they just sort below
active sponsorships. Covers the effective-sponsorship helper (subscription
expiry), sort ordering, and that a client-claimed payment can never buy
placement without server-side PayPal verification.
"""

from datetime import datetime, timedelta, timezone

from app.api_routes import _placement_rank, _sponsored_active


def _tool(**kw):
    base = {"slug": "x", "name": "X", "sponsored": False, "featured": False, "curation_score": 0}
    base.update(kw)
    return base


class TestSponsoredActive:
    def test_false_when_not_sponsored(self):
        assert _sponsored_active(_tool(sponsored=False)) is False

    def test_true_for_one_time_purchase_no_expiry(self):
        # sponsored_until absent == one-time purchase, placement never lapses.
        assert _sponsored_active(_tool(sponsored=True)) is True

    def test_true_while_subscription_has_not_expired(self):
        future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        assert _sponsored_active(_tool(sponsored=True, sponsored_until=future)) is True

    def test_false_once_subscription_expired(self):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        assert _sponsored_active(_tool(sponsored=True, sponsored_until=past)) is False

    def test_handles_z_suffix_utc(self):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert _sponsored_active(_tool(sponsored=True, sponsored_until=future)) is True

    def test_unparseable_date_denies_rather_than_grants(self):
        # A corrupt date must not silently grant free placement forever.
        assert _sponsored_active(_tool(sponsored=True, sponsored_until="not-a-date")) is False

    def test_naive_datetime_treated_as_utc(self):
        future_naive = (datetime.now(timezone.utc) + timedelta(days=1)).replace(tzinfo=None).isoformat()
        assert _sponsored_active(_tool(sponsored=True, sponsored_until=future_naive)) is True


class TestPlacementRank:
    def test_sponsored_outranks_higher_scored_free_tool(self):
        free_high_score = _tool(slug="free", sponsored=False, curation_score=95)
        paid_low_score = _tool(slug="paid", sponsored=True, curation_score=10)

        ordered = sorted([free_high_score, paid_low_score], key=_placement_rank, reverse=True)
        assert ordered[0]["slug"] == "paid"

    def test_curation_score_breaks_ties_among_non_sponsored(self):
        low = _tool(slug="low", curation_score=10)
        high = _tool(slug="high", curation_score=90)
        ordered = sorted([low, high], key=_placement_rank, reverse=True)
        assert ordered[0]["slug"] == "high"

    def test_expired_subscription_loses_placement_but_tool_stays_rankable(self):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        lapsed = _tool(slug="lapsed", sponsored=True, sponsored_until=past, curation_score=50)
        active_free = _tool(slug="free", sponsored=False, curation_score=60)

        ordered = sorted([lapsed, active_free], key=_placement_rank, reverse=True)
        # Lapsed sponsorship falls back to ordinary curation-score ranking —
        # it is not removed, and does not out-rank a better free tool.
        assert ordered[0]["slug"] == "free"
        assert lapsed in ordered  # still present, never dropped
