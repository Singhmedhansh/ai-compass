"""Bot flagging on /go/<slug> clicks.

The outbound-click count is quoted to vendors in outreach, so the property
that actually matters is not "bots are detected" but "a legacy row is never
counted as a human". That is the assertion this file exists to pin.
"""

import pytest

from app.click_quality import hash_ip, is_bot_user_agent

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@pytest.mark.parametrize("ua", [
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "python-requests/2.31.0",
    "curl/8.4.0",
    "HeadlessChrome/124.0.0.0",
    "Go-http-client/1.1",
    "",
    None,
])
def test_non_human_agents_are_flagged(ua):
    assert is_bot_user_agent(ua) is True


@pytest.mark.parametrize("ua", [
    CHROME_UA,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/125.0",
])
def test_real_browsers_are_not_flagged(ua):
    assert is_bot_user_agent(ua) is False


def test_missing_user_agent_counts_as_bot_not_human():
    """Absence must bias the count DOWN, never up — it is the safe
    direction for a number shown to vendors."""
    assert is_bot_user_agent(None) is True


def test_ip_hash_is_salted_and_not_reversible():
    a = hash_ip("203.0.113.7", salt="salt-one")
    b = hash_ip("203.0.113.7", salt="salt-two")
    assert a and b and a != b, "same IP under different salts must differ"
    assert "203.0.113.7" not in a
    assert hash_ip("203.0.113.7", "s") == hash_ip("203.0.113.7", "s")
    assert hash_ip(None, "s") is None
    assert hash_ip("", "s") is None


def test_browser_click_is_recorded_as_not_a_bot(client, app):
    from app.models import OutboundClick

    client.get("/go/chatgpt", headers={"User-Agent": CHROME_UA})
    with app.app_context():
        row = OutboundClick.query.order_by(OutboundClick.id.desc()).first()
        assert row is not None
        assert row.is_bot is False
        assert row.user_agent == CHROME_UA
        assert row.ip_hash


def test_crawler_click_is_recorded_as_a_bot(client, app):
    from app.models import OutboundClick

    client.get("/go/chatgpt", headers={"User-Agent": "Googlebot/2.1"})
    with app.app_context():
        row = OutboundClick.query.order_by(OutboundClick.id.desc()).first()
        assert row is not None
        assert row.is_bot is True


def test_legacy_rows_are_unknown_not_human(app):
    """A row written before the column existed has is_bot NULL. Counting
    with `is_bot IS NOT TRUE` would silently promote all 6,840 of them to
    'human' — which is precisely the overstatement this work removes."""
    from app import db
    from app.models import OutboundClick

    with app.app_context():
        db.session.add(OutboundClick(slug="legacy", is_affiliate=False))
        db.session.commit()

        legacy = OutboundClick.query.filter_by(slug="legacy").first()
        assert legacy.is_bot is None

        verified = OutboundClick.query.filter(
            OutboundClick.is_bot.is_(False)
        ).all()
        assert legacy not in verified
