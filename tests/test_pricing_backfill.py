"""Admin pricing backfill: preview vs commit, and what it must not touch.

The payload it writes is hand-transcribed from a vendor's pricing page and
lands on a public listing, so the two properties worth pinning are that a
preview writes nothing and that a commit is a MERGE — the catalog row is
production source of truth and carries editorial fields (description,
tagline, rating) that no pricing write may clobber.

Runs on its own function-scoped app + DB for the same isolation reason as
test_admin_tier_breakdown.py.
"""
import json
import os
import tempfile

import pytest

from app import create_app, db
from app.models import CatalogTool, User


@pytest.fixture()
def app():
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


@pytest.fixture()
def client(app):
    return app.test_client()


def _login_as_admin(client, app, email="backfill-admin@t.test"):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _seed_screenpipe(app, **data_overrides):
    """A row shaped like the real one: editorial copy present, pricing absent."""
    data = {
        "slug": "screenpipe",
        "name": "screenpipe",
        "description": "Local-first computer history for AI agents.",
        "tagline": "Local-first computer history for AI agents.",
        "category": "Coding",
        "rating": 4.6,
    }
    data.update(data_overrides)
    with app.app_context():
        db.session.add(CatalogTool(
            slug="screenpipe",
            name="screenpipe",
            category="Coding",
            hidden=False,
            data=json.dumps(data),
        ))
        db.session.commit()


def _row_data(app):
    with app.app_context():
        row = CatalogTool.query.filter_by(slug="screenpipe").first()
        return json.loads(row.data), row.affiliate_url


def test_backfill_requires_admin(client, app):
    _seed_screenpipe(app)
    assert client.get(
        "/api/v1/admin/tools/screenpipe/pricing-backfill"
    ).status_code in (401, 403)
    assert client.post(
        "/api/v1/admin/tools/screenpipe/pricing-backfill"
    ).status_code in (401, 403)


def test_get_previews_without_writing(client, app):
    _seed_screenpipe(app)
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tools/screenpipe/pricing-backfill").get_json()
    assert body["preview"] is True
    assert body["committed"] is False
    assert {c["field"] for c in body["changes"]} >= {
        "pricing", "pricing_tiers", "student_perk", "affiliate_url"
    }

    data, affiliate_url = _row_data(app)
    assert "pricing_tiers" not in data
    assert affiliate_url is None


def test_post_commits_the_transcribed_prices(client, app):
    _seed_screenpipe(app)
    _login_as_admin(client, app)

    body = client.post("/api/v1/admin/tools/screenpipe/pricing-backfill").get_json()
    assert body["committed"] is True

    data, affiliate_url = _row_data(app)
    assert affiliate_url == "https://go.screenpi.pe/ai-compass"
    assert data["student_perk"] is True

    tiers = {t["name"]: t for t in data["pricing_tiers"]["tiers"]}
    assert [t["price_amount"] for t in data["pricing_tiers"]["tiers"]] == [0, 21, 42]
    # The annual totals the page states, carried verbatim — a listing that
    # says "$21/mo" without "$250/yr billed annually" misreports the offer.
    assert "$250/yr" in tiers["Basic"]["price_display"]
    assert "$500/seat/yr" in tiers["Business"]["price_display"]
    # Not a general 50% discount — first month of an individual subscription.
    assert "first month" in data["pricing_tiers"]["student_discount"]


def test_commit_merges_and_leaves_editorial_fields_alone(client, app):
    _seed_screenpipe(app)
    _login_as_admin(client, app)
    client.post("/api/v1/admin/tools/screenpipe/pricing-backfill")

    data, _ = _row_data(app)
    assert data["description"] == "Local-first computer history for AI agents."
    assert data["rating"] == 4.6
    assert data["category"] == "Coding"


def test_second_commit_reports_nothing_left_to_change(client, app):
    _seed_screenpipe(app)
    _login_as_admin(client, app)
    client.post("/api/v1/admin/tools/screenpipe/pricing-backfill")

    body = client.post("/api/v1/admin/tools/screenpipe/pricing-backfill").get_json()
    assert body["changes"] == []
    # Already-applied is a success, not a no-op worth retrying.
    assert body["committed"] is False


def test_unregistered_slug_is_refused(client, app):
    _seed_screenpipe(app)
    _login_as_admin(client, app)

    resp = client.post("/api/v1/admin/tools/elevenlabs/pricing-backfill")
    assert resp.status_code == 404
    assert "screenpipe" in resp.get_json()["available"]


def test_missing_row_is_not_created(client, app):
    _login_as_admin(client, app)

    resp = client.post("/api/v1/admin/tools/screenpipe/pricing-backfill")
    assert resp.status_code == 404
    with app.app_context():
        assert CatalogTool.query.filter_by(slug="screenpipe").first() is None
