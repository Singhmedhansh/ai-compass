"""Affiliate click tracking + monetisation-gap analytics.

Regression cover for the bug where an affiliate link set via the admin
panel (DB `affiliate_url`) redirected correctly but was logged as a
NON-affiliate click, so revenue analytics undercounted exactly the
links the operator would add going forward.
"""
import json

from app import db
from app.models import CatalogTool, OutboundClick, User


def _seed_tool(slug, name, *, affiliate_url=None, link="https://example.com"):
    data = {
        "slug": slug,
        "name": name,
        "link": link,
        "category": "writing",
    }
    if affiliate_url:
        data["affiliate_url"] = affiliate_url
    db.session.add(
        CatalogTool(
            slug=slug,
            name=name,
            category="writing",
            affiliate_url=affiliate_url,
            data=json.dumps(data),
        )
    )
    db.session.commit()


def test_db_set_affiliate_click_is_flagged(app, client):
    """A click on a tool whose affiliate_url was set via the catalog/DB
    must be recorded with is_affiliate=True (the core regression)."""
    with app.app_context():
        _seed_tool(
            "dbtool",
            "DB Tool",
            affiliate_url="https://dbtool.com/?ref=medhansh",
        )
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()

    resp = client.get("/go/dbtool", follow_redirects=False)
    assert resp.status_code == 302
    assert "dbtool.com" in resp.headers["Location"]
    assert "ref=medhansh" in resp.headers["Location"]

    with app.app_context():
        click = OutboundClick.query.filter_by(slug="dbtool").first()
        assert click is not None
        assert click.is_affiliate is True


def test_non_affiliate_click_not_flagged(app, client):
    with app.app_context():
        _seed_tool("plaintool", "Plain Tool", link="https://plain.com")
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()

    resp = client.get("/go/plaintool", follow_redirects=False)
    assert resp.status_code == 302
    assert "plain.com" in resp.headers["Location"]

    with app.app_context():
        click = OutboundClick.query.filter_by(slug="plaintool").first()
        assert click is not None
        assert click.is_affiliate is False


def test_analytics_flags_monetization_gaps(app, client):
    """Top-clicked tool with no affiliate must appear in
    outbound.monetization_gaps and carry has_affiliate=False."""
    with app.app_context():
        _seed_tool("gaptool", "Gap Tool", link="https://gap.com")
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()

        admin = User(email="admin@aicompass.test", is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id

    # Generate clicks so it ranks in top_clicked
    for _ in range(3):
        client.get("/go/gaptool", follow_redirects=False)

    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True

    resp = client.get("/api/v1/admin/analytics")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()

    gap_slugs = {g["slug"] for g in body["outbound"]["monetization_gaps"]}
    assert "gaptool" in gap_slugs

    top_by_slug = {t["slug"]: t for t in body["outbound"]["top"]}
    assert top_by_slug["gaptool"]["has_affiliate"] is False
    assert top_by_slug["gaptool"]["name"] == "Gap Tool"


def test_analytics_reports_enrolled_programs(app, client):
    """The Analytics tab must answer "how many programs am I live on".

    Applications get approved days apart and in bursts, so the enrolment
    roster has to come from the API rather than from reading affiliates.py.
    A slug whose link exists ONLY on the catalog row must be listed too, and
    marked as such — a link invisible to the code is the one that gets
    forgotten.
    """
    with app.app_context():
        _seed_tool(
            "catalogonly",
            "Catalog Only",
            affiliate_url="https://catalogonly.com/?ref=medhansh",
        )
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()

        admin = User(email="roster@aicompass.test", is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True

    body = client.get("/api/v1/admin/analytics").get_json()
    block = body["affiliate_programs"]

    from app.affiliates import AFFILIATES, program_count

    # Programs, not slugs: scispace and typeset are one approved program.
    assert block["programs"] == program_count()
    assert block["programs"] < len(AFFILIATES)

    by_slug = {p["slug"]: p for p in block["items"]}
    assert by_slug["paperpal"]["source"] == "registry"
    assert by_slug["paperpal"]["coupon"] == "PAP20"
    assert by_slug["catalogonly"]["source"] == "catalog"
    assert by_slug["catalogonly"]["coupon"] is None
    assert block["catalog_only_slugs"] >= 1
    assert block["coupons"] >= 1


def test_paperpal_detail_payload_carries_its_coupon(client):
    """The discount code reaches the tool page from the server registry.

    The page must never invent a code: a dead code typed at a checkout costs
    the reader's trust at the worst possible moment, so the only source is
    COUPONS, and a tool without one gets no `deal` key at all.
    """
    body = client.get("/api/v1/tools/paperpal").get_json()
    assert body["deal"]["code"] == "PAP20"
    assert "20%" in body["deal"]["detail"]

    plain = client.get("/api/v1/tools/notion").get_json()
    assert "deal" not in plain


def test_expired_coupon_is_not_served(monkeypatch):
    """An expired code lapses quietly rather than being handed to a reader."""
    from app import affiliates

    monkeypatch.setitem(
        affiliates.COUPONS,
        "paperpal",
        {"code": "PAP20", "discount": "20% off", "detail": "", "expires": "2020-01-01"},
    )
    assert affiliates.coupon_for("paperpal") is None
