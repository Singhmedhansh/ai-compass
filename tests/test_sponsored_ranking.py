"""Paid placement inside keyword search.

/pricing sells "sponsored placement above free listings in your category,
permanently", but search_tools() — the path that actually serves browsing and
querying — had no sponsored term at all. Only `featured` scored, and that is
an editorial flag ~30 tools already carry for free, so the headline paid perk
did not exist on the surface people use.

These tests pin the two rules that make paid placement honest:
  * browsing has no relevance to protect, so sponsors sort strictly first;
  * a real query is answered on relevance, and sponsorship can only break
    near-ties — never lift an unrelated paid tool above the thing searched for;
  * an explicit sort (Rating/Reviews/Trending) is never reordered by money.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app, db


def _tool(slug, name, **over):
    base = {
        "slug": slug,
        "name": name,
        "category": "Productivity",
        "tagline": f"{name} tagline",
        "description": f"{name} description",
        "link": f"https://{slug}.example.com",
        "pricing": "Freemium",
        "rating": 4.0,
        "tags": [],
        "platforms": ["Web"],
    }
    base.update(over)
    return base


@pytest.fixture()
def app(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


def _load(app, tools):
    """Point the tool cache at a hand-built catalog.

    build_search_index() rebinds the module-level SEARCH_INDEX, and
    search_tools() imports that name into its own local scope, so setting
    _TOOLS_CACHE and rebuilding through the real helper is what keeps the two
    views consistent.
    """
    import app.tool_cache as tc

    with app.app_context():
        tc._TOOLS_CACHE = tools
        tc.build_search_index(tools)


def _names(payload):
    return [r["name"] for r in payload["results"]]


def test_browsing_puts_sponsors_above_free_listings(app):
    """The promise as written on /pricing. No query means no relevance to
    protect, so paid placement leads."""
    from app.search_utils import search_tools

    _load(app, [
        _tool("free-star", "Free Star", rating=5.0, featured=True),
        _tool("paid-ok", "Paid Ok", rating=3.2, sponsored=True),
        _tool("free-mid", "Free Mid", rating=4.4),
    ])
    with app.app_context():
        out = search_tools("")

    assert _names(out)[0] == "Paid Ok", (
        "a sponsor must lead the category listing even against a better-rated "
        "free tool — that is the thing being sold"
    )
    # Everything below it still ranks on merit.
    assert _names(out)[1:] == ["Free Star", "Free Mid"]


def test_a_query_is_answered_on_relevance_not_on_payment(app):
    """The line that keeps search trustworthy: sponsorship must never surface
    an unrelated paid tool above what the user actually asked for."""
    from app.search_utils import search_tools

    _load(app, [
        _tool("notion", "Notion", description="Note taking and docs",
              tags=["notes", "docs"]),
        _tool("paidcam", "PaidCam", description="Video camera effects",
              tags=["video"], sponsored=True),
    ])
    with app.app_context():
        out = search_tools("notion")

    assert _names(out)[0] == "Notion"


def test_sponsorship_breaks_a_near_tie_between_comparable_matches(app):
    """Where paid placement is legitimately allowed to matter: two tools that
    match the query about equally well."""
    from app.search_utils import search_tools

    twin = dict(description="Team task tracker for projects", tags=["tasks"])
    _load(app, [
        _tool("tracker-a", "Tracker A", **twin),
        _tool("tracker-b", "Tracker B", sponsored=True, **twin),
    ])
    with app.app_context():
        out = search_tools("task tracker")

    assert _names(out)[0] == "Tracker B"


def test_explicit_rating_sort_is_never_reordered_by_money(app):
    """Sponsorship is a tie-break inside an explicit sort, never a jump. A
    'sort by rating' control that quietly sells its top slot is worth less
    intact than any placement is worth."""
    from app.search_utils import search_tools

    _load(app, [
        _tool("best", "Best Rated", rating=4.9),
        _tool("paid-low", "Paid Low", rating=2.0, sponsored=True),
        _tool("paid-tie", "Paid Tie", rating=4.9, sponsored=True),
    ])
    with app.app_context():
        out = search_tools("", sort_by="Rating")

    names = _names(out)
    # Equal rating: the sponsor wins the tie.
    assert names[0] == "Paid Tie"
    assert names[1] == "Best Rated"
    # Lower rating: money does not buy a jump.
    assert names[2] == "Paid Low"


def test_lapsed_sponsorship_is_neither_ranked_nor_labelled(app):
    """`sponsored` stays True on the record when a subscription lapses; only
    sponsored_until says otherwise. Reading the raw field would keep ranking
    AND badging an expired sponsor as paid placement."""
    from app.search_utils import search_tools

    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    _load(app, [
        _tool("lapsed", "Lapsed Sponsor", rating=3.0,
              sponsored=True, sponsored_until=past),
        _tool("current", "Current Sponsor", rating=3.0,
              sponsored=True, sponsored_until=future),
        _tool("plain", "Plain Tool", rating=4.8),
    ])
    with app.app_context():
        out = search_tools("")

    by_name = {r["name"]: r for r in out["results"]}
    assert by_name["Current Sponsor"]["sponsored"] is True
    assert by_name["Lapsed Sponsor"]["sponsored"] is False, (
        "an expired sponsor must not carry the Sponsored badge — the frontend "
        "renders it straight off this key"
    )
    assert _names(out)[0] == "Current Sponsor"
    # The lapsed one falls back to ordinary merit order, behind a better tool.
    assert _names(out).index("Plain Tool") < _names(out).index("Lapsed Sponsor")


def test_every_result_carries_an_explicit_sponsored_flag(app):
    """Disclosure depends on the key being present, not merely truthy when
    set — Card.jsx renders the badge directly from it."""
    from app.search_utils import search_tools

    _load(app, [_tool("plain", "Plain Tool"), _tool("paid", "Paid Tool", sponsored=True)])
    with app.app_context():
        out = search_tools("tool")

    for row in out["results"]:
        assert "sponsored" in row
        assert isinstance(row["sponsored"], bool)
