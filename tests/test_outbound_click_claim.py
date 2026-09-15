"""The traffic figure quoted to vendors in outreach.

This number goes into cold emails to strangers, so the tests that matter are
the ones pinning what it must never do: count unflagged legacy rows as human,
or prefer a legacy constant over a real measurement because the constant
happens to be larger.
"""

from datetime import datetime, timedelta, timezone

from app import db
from app.models import OutboundClick
from app.outreach import (
    _CLICK_CLAIM_FLOOR,
    outbound_click_claim,
    verified_outbound_clicks,
)


def _click(days_ago, is_bot, slug="chatgpt"):
    return OutboundClick(
        slug=slug,
        is_affiliate=False,
        is_bot=is_bot,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


def test_falls_back_to_floor_when_nothing_is_flagged(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.commit()
        assert verified_outbound_clicks() == _CLICK_CLAIM_FLOOR


def test_falls_back_to_floor_while_the_window_is_only_partly_covered(app):
    """Flagging deployed 3 days ago cannot describe 30 days of traffic —
    the count would measure the deploy date, not the audience."""
    with app.app_context():
        OutboundClick.query.delete()
        for _ in range(5):
            db.session.add(_click(days_ago=3, is_bot=False))
        db.session.commit()
        assert verified_outbound_clicks() == _CLICK_CLAIM_FLOOR


def test_uses_measured_count_once_the_window_is_covered(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=40, is_bot=False))   # covers window
        for _ in range(7):
            db.session.add(_click(days_ago=2, is_bot=False))
        for _ in range(4):
            db.session.add(_click(days_ago=2, is_bot=True))  # excluded
        db.session.commit()
        assert verified_outbound_clicks() == 7


def test_measured_count_wins_even_when_lower_than_the_floor(app):
    """The floor is a fallback, never a competitor. Taking whichever is
    larger would be cherry-picking a number to show a vendor."""
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=40, is_bot=False))
        db.session.add(_click(days_ago=1, is_bot=False))
        db.session.commit()
        measured = verified_outbound_clicks()
        assert measured == 1
        assert measured < _CLICK_CLAIM_FLOOR


def test_legacy_unflagged_rows_are_never_counted_as_human(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=40, is_bot=False))
        for _ in range(50):
            db.session.add(_click(days_ago=5, is_bot=None))  # pre-instrument
        db.session.add(_click(days_ago=5, is_bot=False))
        db.session.commit()
        # The one in-window human — not the 50 unknowns. (The 40-day anchor
        # only proves the window is covered; it is outside it, so uncounted.)
        assert verified_outbound_clicks() == 1


def test_bots_inside_the_window_are_excluded(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=40, is_bot=False))
        for _ in range(3):
            db.session.add(_click(days_ago=1, is_bot=False))
        for _ in range(97):
            db.session.add(_click(days_ago=1, is_bot=True))
        db.session.commit()
        assert verified_outbound_clicks() == 3


def test_clicks_older_than_the_window_are_excluded(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=200, is_bot=False))
        db.session.add(_click(days_ago=90, is_bot=False))
        db.session.add(_click(days_ago=5, is_bot=False))
        db.session.commit()
        assert verified_outbound_clicks(days=30) == 1


def test_claim_is_comma_grouped_and_never_rounded(app):
    with app.app_context():
        OutboundClick.query.delete()
        db.session.add(_click(days_ago=40, is_bot=False))
        for _ in range(1233):
            db.session.add(_click(days_ago=1, is_bot=False))
        db.session.commit()
        assert outbound_click_claim() == "1,233"


def test_prompt_token_is_substituted_out_of_the_generated_email(app):
    """A leaked token would put the literal string OUTBOUND_CLICK_COUNT in
    front of a founder."""
    from app.outreach import CLICK_COUNT_TOKEN, get_generic_draft, POOL_COLD

    class _C:
        product_name = "SimplAI"
        tagline = "ship faster"
        website_url = "https://simplai.ai"
        founder_name = "Arjun Rao"
        email = "a@simplai.ai"
        tone = "friendly"
        lead_pool = POOL_COLD
        prefill_token = "tok"

    with app.app_context():
        _, html = get_generic_draft(_C())
        assert CLICK_COUNT_TOKEN not in html
