import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.models import (
    CommunityComment,
    CommunityPost,
    OutboundClick,
    PostVote,
    SponsorImpression,
    SponsorSlot,
    User,
)


@pytest.fixture(autouse=True)
def _bypass_rate_limit(monkeypatch):
    monkeypatch.setattr("app.community_routes.is_rate_limited", lambda *a, **k: False)


@pytest.fixture(autouse=True)
def _isolate_activity(app):
    """conftest's `app` (and therefore its SQLite file) is session-scoped with
    no per-test rollback, so without this every test here would score the
    rows every earlier test left behind. Leaderboards are rank assertions —
    they only mean anything against a known set of rows."""
    def wipe():
        with app.app_context():
            for model in (
                SponsorImpression, SponsorSlot, OutboundClick,
                PostVote, CommunityComment, CommunityPost,
            ):
                model.query.delete()
            db.session.commit()

    wipe()
    yield
    wipe()


def _user(app, email=None):
    with app.app_context():
        user = User(email=email or f"builder-{uuid.uuid4().hex[:12]}@example.com")
        db.session.add(user)
        db.session.commit()
        return user.id


def _login(client, user_id):
    # Clear first: Flask-Login refuses to swap identity inside a session that
    # already carries one, which silently turns the second login in a test
    # into a 401.
    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True


def _post(app, user_id, slug, days_ago=0, title="A discussion about a tool"):
    with app.app_context():
        post = CommunityPost(
            user_id=user_id,
            title=title,
            body="Long enough body to be a real post.",
            post_type="discussion",
            tool_slug=slug,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago),
        )
        db.session.add(post)
        db.session.commit()
        return post.id


# --- tool board ------------------------------------------------------------

def test_leaderboard_ranks_discussed_tools(client, app):
    user_id = _user(app)
    _post(app, user_id, "alpha-tool")
    _post(app, user_id, "alpha-tool", title="A second alpha thread")
    _post(app, user_id, "beta-tool")

    data = client.get("/api/v1/community/leaderboard?period=week").get_json()
    slugs = [row["slug"] for row in data["rows"]]
    assert slugs.index("alpha-tool") < slugs.index("beta-tool")
    assert data["rows"][slugs.index("alpha-tool")]["posts"] == 2


def test_leaderboard_period_excludes_older_activity(client, app):
    user_id = _user(app)
    _post(app, user_id, "stale-tool", days_ago=45)

    week = client.get("/api/v1/community/leaderboard?period=week").get_json()
    assert "stale-tool" not in [row["slug"] for row in week["rows"]]

    all_time = client.get("/api/v1/community/leaderboard?period=all").get_json()
    assert "stale-tool" in [row["slug"] for row in all_time["rows"]]


def test_clicks_are_damped_so_discussion_outranks_traffic(client, app):
    """A tool nobody discusses must not out-rank one people are posting about
    just because the catalogue sends it traffic — that is the whole premise
    the board's credibility (and therefore its sponsorship value) rests on."""
    user_id = _user(app)
    _post(app, user_id, "discussed-tool")

    with app.app_context():
        for _ in range(60):
            db.session.add(OutboundClick(slug="clicky-tool", is_affiliate=False))
        db.session.commit()

    data = client.get("/api/v1/community/leaderboard?period=week").get_json()
    scores = {row["slug"]: row["score"] for row in data["rows"]}
    # 60 clicks damped = round(sqrt(60) * 3) = 23; one post = 6. Traffic still
    # counts for more than a single post, but not 60x more.
    assert scores["clicky-tool"] < 60
    assert scores["clicky-tool"] > scores["discussed-tool"]

    # Six posts (36) must be enough to overtake that traffic.
    for i in range(5):
        _post(app, user_id, "discussed-tool", title=f"Another thread number {i}")
    scores = {
        row["slug"]: row["score"]
        for row in client.get("/api/v1/community/leaderboard?period=week").get_json()["rows"]
    }
    assert scores["discussed-tool"] > scores["clicky-tool"]


def test_sponsorship_cannot_enter_the_ranked_rows(client, app):
    """Money buys a labelled unit beside the board, never a row inside it."""
    user_id = _user(app)
    _post(app, user_id, "organic-tool")

    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="paid-tool",
            placement="board",
            ends_at=now + timedelta(days=7),
            amount_paid=89.0,
        ))
        db.session.commit()

    board = client.get("/api/v1/community/leaderboard?period=week").get_json()
    assert "paid-tool" not in [row["slug"] for row in board["rows"]]

    sponsors = client.get("/api/v1/community/sponsors").get_json()
    assert [u["slug"] for u in sponsors["board"]] == ["paid-tool"]


# --- builder board ---------------------------------------------------------

def test_builders_rank_by_karma_and_expose_next_rank(client, app):
    quiet = _user(app)
    loud = _user(app)
    for i in range(4):
        _post(app, loud, None, title=f"Loud builder thread {i}")
    _post(app, quiet, None, title="One quiet thread")

    data = client.get("/api/v1/community/builders?period=week").get_json()
    assert data["rows"][0]["user_id"] == loud
    assert data["rows"][0]["karma"] == 24
    assert data["rows"][0]["rank_badge"]["key"] == "explorer"
    assert data["rows"][0]["next_rank"]["at"] == 50


def test_builders_credit_upvotes_to_the_author(client, app):
    author = _user(app)
    voter = _user(app)
    post_id = _post(app, author, None, title="Something worth upvoting")

    with app.app_context():
        db.session.add(PostVote(post_id=post_id, user_id=voter, vote_type=1))
        db.session.commit()

    rows = client.get("/api/v1/community/builders?period=week").get_json()["rows"]
    author_row = next(r for r in rows if r["user_id"] == author)
    assert author_row["upvotes"] == 1
    assert author_row["karma"] == 6 + 3


def test_builders_you_field_is_the_logged_in_member(client, app):
    user_id = _user(app)
    _post(app, user_id, None, title="My own contribution here")

    anon = client.get("/api/v1/community/builders?period=week").get_json()
    assert anon["you"] is None

    _login(client, user_id)
    mine = client.get("/api/v1/community/builders?period=week").get_json()
    assert mine["you"]["user_id"] == user_id


# --- stats -----------------------------------------------------------------

def test_stats_counts_real_rows_only(client, app):
    user_id = _user(app)
    post_id = _post(app, user_id, "counted-tool")
    with app.app_context():
        db.session.add(CommunityComment(post_id=post_id, user_id=user_id, body="A comment."))
        db.session.commit()

    stats = client.get("/api/v1/community/stats").get_json()
    assert stats["posts"] == 1
    assert stats["posts_this_week"] == 1
    assert stats["comments"] == 1
    assert stats["tools_discussed"] == 1


# --- sponsored inventory ---------------------------------------------------

def test_inventory_reports_capacity_and_sells_out(client, app):
    before = client.get("/api/v1/community/sponsors/inventory").get_json()["inventory"]
    hero = next(row for row in before if row["placement"] == "hero")
    assert hero["capacity"] == 1 and hero["available"] == 1 and hero["sold_out"] is False

    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="spotlight-tool",
            placement="hero",
            ends_at=now + timedelta(days=7),
            amount_paid=149.0,
        ))
        db.session.commit()

    after = client.get("/api/v1/community/sponsors/inventory").get_json()["inventory"]
    hero = next(row for row in after if row["placement"] == "hero")
    assert hero["available"] == 0 and hero["sold_out"] is True


def test_expired_slot_stops_rendering(client, app):
    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="lapsed-tool",
            placement="hero",
            starts_at=now - timedelta(days=14),
            ends_at=now - timedelta(days=1),
            amount_paid=149.0,
        ))
        db.session.commit()

    sponsors = client.get("/api/v1/community/sponsors").get_json()
    assert sponsors["hero"] == []


def test_placement_capacity_is_enforced(client, app):
    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for i in range(6):
            db.session.add(SponsorSlot(
                tool_slug=f"rail-tool-{i}",
                placement="rail",
                ends_at=now + timedelta(days=7),
                amount_paid=39.0,
            ))
        db.session.commit()

    sponsors = client.get("/api/v1/community/sponsors").get_json()
    assert len(sponsors["rail"]) == 4


# --- impressions -----------------------------------------------------------

def test_impression_beacon_records_a_row(client, app):
    resp = client.post("/api/v1/community/sponsors/impression", json={
        "tool_slug": "Measured-Tool",
        "placement": "rail",
    })
    assert resp.status_code == 200
    assert resp.get_json()["recorded"] is True

    with app.app_context():
        row = SponsorImpression.query.filter_by(tool_slug="measured-tool").one()
        assert row.placement == "rail"


def test_impression_beacon_never_errors_on_bad_input(client):
    resp = client.post("/api/v1/community/sponsors/impression", json={"placement": "rail"})
    assert resp.status_code == 200
    assert resp.get_json()["recorded"] is False


def test_delivery_report_is_private_to_the_owner(client, app):
    """Impressions and CTR are the sponsor's commercial data — a stranger
    must not be able to read a competitor's placement performance."""
    from app.models import CatalogTool, Submission

    owner_email = f"owner-{uuid.uuid4().hex[:8]}@example.com"
    with app.app_context():
        submission = Submission(
            name="Reported Tool", website="https://example.com", category="Coding",
            description="d", pricing_model="sponsored_paypal",
            submitter_email=owner_email, payment_status="verified",
        )
        db.session.add(submission)
        db.session.commit()
        db.session.add(CatalogTool(
            slug="reported-tool", name="Reported Tool", data="{}",
            submission_id=submission.id,
        ))
        db.session.add(SponsorImpression(tool_slug="reported-tool", placement="rail"))
        db.session.add(OutboundClick(slug="reported-tool", is_affiliate=False))
        db.session.commit()

    stranger = _user(app)
    _login(client, stranger)
    assert client.get("/api/v1/community/sponsors/reported-tool/report").status_code == 403

    owner = _user(app, email=owner_email)
    _login(client, owner)
    report = client.get("/api/v1/community/sponsors/reported-tool/report").get_json()
    assert report["impressions"] == 1
    assert report["clicks"] == 1
    assert report["ctr"] == 100.0


# --- self-serve checkout ---------------------------------------------------

def _catalog_tool(app, slug="checkout-tool"):
    from app.models import CatalogTool
    with app.app_context():
        db.session.add(CatalogTool(slug=slug, name=slug.title(), data="{}"))
        db.session.commit()
    return slug


def test_checkout_rejects_unverified_payment(client, app, monkeypatch):
    """A payment PayPal won't confirm must never book a slot — the browser
    supplies the order id, so trusting it would make placements free."""
    slug = _catalog_tool(app)
    monkeypatch.setattr(
        "app.community_routes.verify_paypal_order",
        lambda order_id, expected_amount=49.99, **kwargs: (False, "order_status_VOIDED"),
    )
    resp = client.post("/api/v1/community/sponsors/checkout", json={
        "order_id": "FAKEORDER123", "placement": "rail", "weeks": 1, "tool_slug": slug,
    })
    assert resp.status_code == 402
    with app.app_context():
        assert SponsorSlot.query.count() == 0


def test_checkout_verifies_the_full_multi_week_amount(client, app, monkeypatch):
    """Paying one week's price must not buy twelve — the expected amount has
    to scale with the week count before it reaches PayPal for checking."""
    slug = _catalog_tool(app)
    seen = {}

    def fake_verify(order_id, expected_amount=49.99, **kwargs):
        seen["expected"] = expected_amount
        return True, "paypal_order_verified"

    monkeypatch.setattr("app.community_routes.verify_paypal_order", fake_verify)
    resp = client.post("/api/v1/community/sponsors/checkout", json={
        "order_id": "GOODORDER1", "placement": "rail", "weeks": 3, "tool_slug": slug,
    })
    assert resp.status_code == 201
    assert seen["expected"] == round(19.99 * 3, 2)


def test_checkout_is_idempotent_on_replay(client, app, monkeypatch):
    slug = _catalog_tool(app)
    monkeypatch.setattr(
        "app.community_routes.verify_paypal_order",
        lambda *a, **k: (True, "paypal_order_verified"),
    )
    body = {"order_id": "REPLAY1", "placement": "rail", "weeks": 1, "tool_slug": slug}
    first = client.post("/api/v1/community/sponsors/checkout", json=body).get_json()
    second = client.post("/api/v1/community/sponsors/checkout", json=body).get_json()
    assert first["slot"]["id"] == second["slot"]["id"]
    with app.app_context():
        assert SponsorSlot.query.count() == 1


def test_checkout_requires_a_catalog_tool(client, app, monkeypatch):
    monkeypatch.setattr(
        "app.community_routes.verify_paypal_order",
        lambda *a, **k: (True, "paypal_order_verified"),
    )
    resp = client.post("/api/v1/community/sponsors/checkout", json={
        "order_id": "NOTOOL1", "placement": "rail", "weeks": 1, "tool_slug": "ghost-tool",
    })
    assert resp.status_code == 400


def test_oversold_placement_rolls_forward_instead_of_failing(client, app, monkeypatch):
    """Money is already captured by the time we book, so a full week must
    schedule the buyer into the next open one rather than erroring."""
    slug = _catalog_tool(app)
    monkeypatch.setattr(
        "app.community_routes.verify_paypal_order",
        lambda *a, **k: (True, "paypal_order_verified"),
    )
    # Rail holds four concurrent slots, so the fifth booking is the one that
    # has to roll into the following week.
    booked = [
        client.post("/api/v1/community/sponsors/checkout", json={
            "order_id": f"RAIL{i}", "placement": "rail", "weeks": 1, "tool_slug": slug,
        }).get_json()
        for i in range(4)
    ]
    overflow = client.post("/api/v1/community/sponsors/checkout", json={
        "order_id": "RAIL-OVERFLOW", "placement": "rail", "weeks": 1, "tool_slug": slug,
    })
    assert overflow.status_code == 201
    assert overflow.get_json()["slot"]["starts_at"] >= booked[0]["slot"]["ends_at"]


# --- admin slot management -------------------------------------------------

def _admin(app):
    with app.app_context():
        user = User(email=f"admin-{uuid.uuid4().hex[:8]}@example.com", is_admin=True)
        db.session.add(user)
        db.session.commit()
        return user.id


def test_admin_slot_endpoints_reject_non_admins(client, app):
    _login(client, _user(app))
    assert client.get("/api/v1/community/admin/slots").status_code == 403
    assert client.post("/api/v1/community/admin/slots", json={"tool_slug": "x"}).status_code == 403


def test_admin_can_create_extend_pause_and_delete(client, app):
    _login(client, _admin(app))

    created = client.post("/api/v1/community/admin/slots", json={
        "tool_slug": "comped-tool", "placement": "rail", "weeks": 1, "amount_paid": 0,
    })
    assert created.status_code == 201
    slot = created.get_json()["slot"]
    original_end = slot["ends_at"]

    extended = client.patch(f"/api/v1/community/admin/slots/{slot['id']}", json={"extend_weeks": 2})
    assert extended.get_json()["slot"]["ends_at"] > original_end

    paused = client.patch(f"/api/v1/community/admin/slots/{slot['id']}", json={"is_active": False})
    assert paused.get_json()["slot"]["is_active"] is False
    assert client.get("/api/v1/community/sponsors").get_json()["rail"] == []

    assert client.delete(f"/api/v1/community/admin/slots/{slot['id']}").status_code == 200
    with app.app_context():
        assert SponsorSlot.query.count() == 0


def test_admin_slot_list_includes_delivery_numbers(client, app):
    _login(client, _admin(app))
    client.post("/api/v1/community/admin/slots", json={
        "tool_slug": "measured-slot", "placement": "rail", "weeks": 1,
    })
    with app.app_context():
        db.session.add(SponsorImpression(tool_slug="measured-slot", placement="rail"))
        db.session.add(OutboundClick(slug="measured-slot", is_affiliate=False))
        db.session.commit()

    row = client.get("/api/v1/community/admin/slots").get_json()["slots"][0]
    assert row["impressions"] == 1
    assert row["clicks"] == 1
    assert row["ctr"] == 100.0


# --- routing & discoverability ---------------------------------------------

def test_community_routes_return_200_not_soft_404(client, app):
    """These shipped returning HTTP 404 while still rendering the SPA shell,
    which is a soft-404: users saw the page, Google refused to index it."""
    assert client.get("/community").status_code == 200
    assert client.get("/sponsor").status_code == 200


def test_community_thread_serves_its_own_title_and_404s_when_missing(client, app):
    user_id = _user(app)
    post_id = _post(app, user_id, None, title="A thread worth indexing")

    live = client.get(f"/community/{post_id}")
    assert live.status_code == 200
    assert b"A thread worth indexing" in live.data

    assert client.get("/community/99999999").status_code == 404
    assert client.get("/community/not-a-number").status_code == 404


def test_sitemap_lists_community_surfaces_and_threads(client, app):
    user_id = _user(app)
    post_id = _post(app, user_id, None, title="Indexable community thread")

    body = client.get("/sitemap.xml").get_data(as_text=True)
    assert "https://ai-compass.in/community<" in body
    assert "https://ai-compass.in/sponsor<" in body
    assert f"https://ai-compass.in/community/{post_id}<" in body


def test_active_sponsor_slot_grants_the_featured_badge(client, app):
    """Every placement tier on /sponsor advertises a Featured badge on
    discussion threads. Before this, the badge only came from a paid
    *submission*, so a rented slot was billed for a perk never delivered."""
    user_id = _user(app)
    _post(app, user_id, "badged-tool", title="A thread about a sponsored tool")

    unbadged = client.get("/api/v1/community/posts").get_json()["posts"][0]
    assert unbadged["is_featured"] is False

    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="badged-tool", placement="rail",
            ends_at=now + timedelta(days=7), amount_paid=39.0,
        ))
        db.session.commit()

    badged = client.get("/api/v1/community/posts").get_json()["posts"][0]
    assert badged["is_featured"] is True


def test_expired_slot_stops_granting_the_featured_badge(client, app):
    user_id = _user(app)
    _post(app, user_id, "lapsed-badge-tool", title="A thread about a lapsed sponsor")
    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="lapsed-badge-tool", placement="rail",
            starts_at=now - timedelta(days=14), ends_at=now - timedelta(days=1),
            amount_paid=39.0,
        ))
        db.session.commit()

    post = client.get("/api/v1/community/posts").get_json()["posts"][0]
    assert post["is_featured"] is False


# --- staged launch: rail tier only -----------------------------------------

def test_checkout_refuses_placements_not_yet_on_sale(client, app, monkeypatch):
    """Hiding a card in React is not a gate. Without a server-side check
    anyone could POST placement="hero" and buy a tier we haven't committed
    to delivering."""
    slug = _catalog_tool(app, "staged-tool")
    called = []
    monkeypatch.setattr(
        "app.community_routes.verify_paypal_order",
        lambda *a, **k: called.append(1) or (True, "paypal_order_verified"),
    )

    for placement in ("hero", "board"):
        resp = client.post("/api/v1/community/sponsors/checkout", json={
            "order_id": f"STAGED-{placement}", "placement": placement,
            "weeks": 1, "tool_slug": slug,
        })
        assert resp.status_code == 400
        assert "isn't on sale yet" in resp.get_json()["error"]

    # Refused before any payment work — we must not hold money for a tier
    # we won't deliver.
    assert called == []

    ok = client.post("/api/v1/community/sponsors/checkout", json={
        "order_id": "STAGED-rail", "placement": "rail", "weeks": 1, "tool_slug": slug,
    })
    assert ok.status_code == 201


def test_inventory_marks_unsold_tiers_coming_soon_not_sold_out(client):
    """"Full this week" and "we don't sell this yet" are different answers
    and the page must not conflate them."""
    inventory = {
        row["placement"]: row
        for row in client.get("/api/v1/community/sponsors/inventory").get_json()["inventory"]
    }
    assert inventory["rail"]["for_sale"] is True
    assert inventory["rail"]["coming_soon"] is False
    assert inventory["rail"]["price_weekly"] == 19.99
    for placement in ("hero", "board"):
        assert inventory[placement]["coming_soon"] is True
        assert inventory[placement]["sold_out"] is False


def test_admin_can_still_place_a_not_yet_public_tier(client, app):
    """"Not for sale" must not mean "cannot exist" — comps and hand-
    negotiated deals still need to be placeable."""
    _login(client, _admin(app))
    resp = client.post("/api/v1/community/admin/slots", json={
        "tool_slug": "comped-hero", "placement": "hero", "weeks": 1, "amount_paid": 0,
    })
    assert resp.status_code == 201
    assert client.get("/api/v1/community/sponsors").get_json()["hero"][0]["slug"] == "comped-hero"


# --- PayPal credential isolation -------------------------------------------

def test_sponsor_credentials_fall_back_to_shared_vars(monkeypatch):
    from app.payments import sponsor_credentials

    monkeypatch.delenv("PAYPAL_SPONSOR_CLIENT_ID", raising=False)
    monkeypatch.delenv("PAYPAL_SPONSOR_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("PAYPAL_SPONSOR_MODE", raising=False)
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "shared-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "shared-secret")
    monkeypatch.setenv("PAYPAL_MODE", "live")

    assert sponsor_credentials() == ("shared-id", "shared-secret", "live")


def test_sponsor_credentials_override_without_touching_submit_flow(monkeypatch):
    """Switching sponsorship to sandbox must not swap the live client ID out
    from under /submit — that would break real submission payments during a
    sponsorship test."""
    from app.payments import sponsor_credentials

    monkeypatch.setenv("PAYPAL_CLIENT_ID", "live-hosted-button-id")
    monkeypatch.setenv("PAYPAL_MODE", "live")
    monkeypatch.setenv("PAYPAL_SPONSOR_CLIENT_ID", "sandbox-rest-id")
    monkeypatch.setenv("PAYPAL_SPONSOR_CLIENT_SECRET", "sandbox-rest-secret")
    monkeypatch.setenv("PAYPAL_SPONSOR_MODE", "sandbox")

    assert sponsor_credentials() == ("sandbox-rest-id", "sandbox-rest-secret", "sandbox")
    assert os.environ["PAYPAL_CLIENT_ID"] == "live-hosted-button-id"


def test_paypal_config_endpoint_serves_the_sponsor_app(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "submit-client-id")
    monkeypatch.setenv("PAYPAL_SPONSOR_CLIENT_ID", "sponsor-client-id")
    monkeypatch.setenv("PAYPAL_SPONSOR_MODE", "sandbox")

    sponsor = client.get("/api/v1/config/paypal?context=sponsor").get_json()
    assert sponsor["client_id"] == "sponsor-client-id"
    assert sponsor["mode"] == "sandbox"

    submit = client.get("/api/v1/config/paypal").get_json()
    assert submit["client_id"] == "submit-client-id"


def test_paypal_config_never_leaks_the_secret(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_SPONSOR_CLIENT_SECRET", "top-secret-value")
    body = client.get("/api/v1/config/paypal?context=sponsor").get_data(as_text=True)
    assert "top-secret-value" not in body
