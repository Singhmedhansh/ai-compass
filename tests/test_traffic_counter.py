"""The server-side traffic counter.

The property under test throughout: a visitor who never touches the cookie
banner is still counted. That is the entire reason this exists — the
consent gate made GA4 and PostHog blind to exactly the SEO traffic the site
runs on, and a counter that inherited the same blind spot would be pointless.
"""

from datetime import date, timedelta

import pytest

from app import db
from app.models import PageViewDaily, VisitorDaily
from app.traffic import (
    _normalise_path,
    daily_totals,
    top_paths,
    visitor_hash,
)


@pytest.fixture(autouse=True)
def _clean_traffic_tables(app):
    with app.app_context():
        db.session.query(PageViewDaily).delete()
        db.session.query(VisitorDaily).delete()
        db.session.commit()
    yield


def _get(client, path, ip="203.0.113.7", ua="Mozilla/5.0 (Macintosh) Chrome/120"):
    return client.get(path, headers={"X-Forwarded-For": ip, "User-Agent": ua})


# --- the point of the whole module ---------------------------------------


def test_a_visitor_who_never_answers_the_banner_is_counted(client, app):
    """No cookie, no consent, no JavaScript — still counted.

    A test client sends no cookies and runs no JS, which makes it exactly
    the visitor GA4 and PostHog cannot see.
    """
    _get(client, "/best-free-ai-tools")

    with app.app_context():
        row = PageViewDaily.query.filter_by(path="/best-free-ai-tools").one()
        assert row.views == 1
        assert VisitorDaily.query.filter_by(path="/best-free-ai-tools").count() == 1


def test_repeat_views_from_one_visitor_are_one_visitor_many_views(client, app):
    for _ in range(5):
        _get(client, "/tools")

    with app.app_context():
        assert PageViewDaily.query.filter_by(path="/tools").one().views == 5
        assert VisitorDaily.query.filter_by(path="/tools").count() == 1


def test_different_visitors_count_separately(client, app):
    _get(client, "/tools", ip="203.0.113.1")
    _get(client, "/tools", ip="203.0.113.2")

    with app.app_context():
        assert PageViewDaily.query.filter_by(path="/tools").one().views == 2
        assert VisitorDaily.query.filter_by(path="/tools").count() == 2


def test_one_address_two_browsers_is_two_visitors(client, app):
    """A household or campus behind one NAT address is many people."""
    _get(client, "/tools", ip="198.51.100.9", ua="Mozilla/5.0 Chrome/120")
    _get(client, "/tools", ip="198.51.100.9", ua="Mozilla/5.0 Firefox/121")

    with app.app_context():
        assert VisitorDaily.query.filter_by(path="/tools").count() == 2


# --- what must never be counted ------------------------------------------


def test_self_declared_bots_are_not_counted(client, app):
    _get(client, "/tools", ua="Mozilla/5.0 (compatible; Googlebot/2.1)")

    with app.app_context():
        assert PageViewDaily.query.count() == 0


def test_404s_are_not_counted(client, app):
    """Otherwise every dead inbound link and every scanner probing for
    /wp-admin lands in the numbers we make decisions on."""
    resp = _get(client, "/this-page-does-not-exist-at-all")
    assert resp.status_code == 404

    with app.app_context():
        assert PageViewDaily.query.count() == 0


@pytest.mark.parametrize(
    "path",
    ["/api/v1/stats", "/healthz", "/robots.txt", "/sitemap.xml"],
)
def test_machine_endpoints_are_not_counted(client, app, path):
    _get(client, path)

    with app.app_context():
        assert PageViewDaily.query.filter_by(path=path).count() == 0


# --- privacy properties ---------------------------------------------------


def test_no_raw_address_is_ever_stored(client, app):
    ip = "203.0.113.77"
    _get(client, "/tools", ip=ip)

    with app.app_context():
        for row in VisitorDaily.query.all():
            assert ip not in row.visitor_hash
            assert ip not in row.path


def test_the_salt_rotates_daily_so_visitors_cannot_be_joined_across_days():
    """The property that makes this privacy-preserving rather than merely
    obscured. If these two were equal, the table would be a cross-day
    tracker and every claim in the module docstring would be false."""
    today = date(2026, 9, 14)
    tomorrow = today + timedelta(days=1)

    a = visitor_hash("203.0.113.5", "Chrome/120", today, "secret")
    b = visitor_hash("203.0.113.5", "Chrome/120", tomorrow, "secret")

    assert a and b
    assert a != b


def test_the_same_visitor_is_stable_within_one_day():
    day = date(2026, 9, 14)
    a = visitor_hash("203.0.113.5", "Chrome/120", day, "secret")
    b = visitor_hash("203.0.113.5", "Chrome/120", day, "secret")
    assert a == b


def test_a_missing_address_yields_no_hash():
    assert visitor_hash(None, "Chrome/120", date(2026, 9, 14), "secret") is None
    assert visitor_hash("   ", "Chrome/120", date(2026, 9, 14), "secret") is None


# --- path handling --------------------------------------------------------


def test_query_strings_are_stripped():
    """Every utm_* combination would otherwise be its own row, and campaign
    parameters can carry identifying values."""
    assert _normalise_path("/tools?utm_source=x&utm_campaign=y") == "/tools"


def test_trailing_slash_is_the_same_page():
    assert _normalise_path("/tools/") == "/tools"
    assert _normalise_path("/") == "/"


def test_long_paths_are_truncated_not_dropped():
    out = _normalise_path("/" + "a" * 400)
    assert len(out) == 255


# --- reporting ------------------------------------------------------------


def test_uniques_do_not_double_count_one_person_reading_two_pages(client, app):
    """The trap in this table's shape: summing per-page uniques reports one
    reader of three pages as three visitors."""
    _get(client, "/tools", ip="203.0.113.3")
    _get(client, "/best-free-ai-tools", ip="203.0.113.3")

    with app.app_context():
        series = daily_totals(days=2)
        today = [r for r in series if r["day"] == date.today().isoformat()]
        assert today, series
        assert today[0]["views"] == 2
        assert today[0]["unique_visitors"] == 1


def test_top_paths_ranks_by_views(client, app):
    for _ in range(3):
        _get(client, "/best-free-ai-tools", ip="203.0.113.4")
    _get(client, "/tools", ip="203.0.113.4")

    with app.app_context():
        rows = top_paths(days=1)
        assert rows[0]["path"] == "/best-free-ai-tools"
        assert rows[0]["views"] == 3
        assert rows[0]["unique_visitors"] == 1


# --- the endpoint ---------------------------------------------------------


def test_traffic_endpoint_refuses_anonymous_callers(client):
    """Same lesson as /admin/users, which shipped with no guard at all and
    served the whole user table to anyone who asked."""
    resp = client.get("/api/v1/admin/traffic")
    assert resp.status_code in (401, 302, 403)


def _login_as_admin(client, app, email="traffic-admin@t.test"):
    from app.models import User

    with app.app_context():
        admin = User.query.filter_by(email=email).first()
        if admin is None:
            admin = User(email=email, is_admin=True)
            db.session.add(admin)
            db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def test_endpoint_returns_the_shape_the_admin_panel_reads(client, app):
    """Pins the contract TrafficPanel.jsx consumes.

    The panel reads data.daily[].{day,views,unique_visitors},
    data.top_paths[].{path,views,unique_visitors} and data.totals.views. A
    rename on either side is a blank panel with no error, which is the
    failure mode that takes longest to notice.
    """
    _get(client, "/best-free-ai-tools", ip="203.0.113.21")
    _login_as_admin(client, app)

    resp = client.get("/api/v1/admin/traffic?days=30")
    assert resp.status_code == 200, resp.data

    body = resp.get_json()
    assert body["days"] == 30
    assert isinstance(body["daily"], list) and body["daily"]
    assert set(body["daily"][0]) >= {"day", "views", "unique_visitors"}
    assert isinstance(body["top_paths"], list) and body["top_paths"]
    assert set(body["top_paths"][0]) >= {"path", "views", "unique_visitors"}
    assert body["totals"]["views"] >= 1
    # Never a plain "unique_visitors" total: the daily salt rotation makes a
    # window-wide unique count uncomputable, and a field named as though it
    # were one would end up quoted to a sponsor.
    assert "unique_visitors" not in body["totals"]


def test_days_parameter_is_clamped_not_trusted(client, app):
    _login_as_admin(client, app)

    assert client.get("/api/v1/admin/traffic?days=99999").get_json()["days"] == 400
    assert client.get("/api/v1/admin/traffic?days=0").get_json()["days"] == 1
    assert client.get("/api/v1/admin/traffic?days=abc").get_json()["days"] == 30


def test_counting_never_breaks_the_page(client, app, monkeypatch):
    """Fail-open. This runs on every request, so a counter that can 500 a
    page is strictly worse than no counter."""
    import app.traffic as traffic

    def _boom(*args, **kwargs):
        raise RuntimeError("database is on fire")

    monkeypatch.setattr(traffic, "visitor_hash", _boom)

    resp = _get(client, "/tools")
    assert resp.status_code == 200
