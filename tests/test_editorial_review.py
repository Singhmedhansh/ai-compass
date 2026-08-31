"""Commissioned editorial reviews: ordering, publishing, and what a reader
(and a crawler) actually sees.

See app/editorial.py for the product rules these lock in — the money buys
the work and never the verdict, capacity is real, a draft is not a product,
and every published review carries its disclosure.

Same isolated app+DB fixture as test_editorial_blurb.py, since these also
seed CatalogTool rows directly and hit catalog-serving routes.
"""
import json
import os
import tempfile
from unittest.mock import patch

import pytest

from app import create_app, db, editorial
from app.models import CatalogTool, EditorialReview, User
from app.tool_cache import refresh_tools_cache


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


BODY = (
    "We spent a working day inside the editor, porting a real project into it.\n\n"
    "Autocomplete is fast and the diff view is the best of the ones we tried, but "
    "the indexing step choked twice on a monorepo and had to be restarted by hand. "
    "Support answered in under an hour both times, which counts for something."
) * 2


def _seed_tool(slug="reviewed-tool", name="Reviewed Tool"):
    data = {
        "slug": slug,
        "name": name,
        "category": "Productivity",
        "description": "The founder's own pitch.",
        "tagline": "The founder's own pitch.",
        "link": f"https://{slug}.example.com",
    }
    db.session.add(CatalogTool(
        slug=slug, name=name, category="Productivity", hidden=False,
        data=json.dumps(data),
    ))
    db.session.commit()
    refresh_tools_cache()


def _login_as_admin(client, app, email="admin@example.com"):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _publish(app, slug="reviewed-tool", **overrides):
    """A published review, written the way an admin would write one."""
    with app.app_context():
        review, err = editorial.create_order(
            tool_slug=slug, contact_email="founder@example.com",
            amount_paid=editorial.REVIEW_PRICE, payment_ref=overrides.pop("payment_ref", None),
        )
        assert err is None, err
        fields = {
            "headline": "Reviewed Tool, after a day of real work",
            "body": BODY,
            "verdict": "Worth the money if you live in a monorepo; wait a release if you do not.",
            "pros": ["Fast autocomplete", "Best-in-class diff view"],
            "cons": ["Indexing choked twice on a monorepo"],
            "score": 3.5,
            "author_name": "Lokendra Singh",
            "status": "published",
        }
        fields.update(overrides)
        assert editorial.update_review(review, fields) is None
        return review.id


# --- pricing / availability -------------------------------------------------


def test_pricing_endpoint_reports_price_and_honest_capacity(client, app):
    resp = client.get("/api/v1/reviews/pricing")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["price"] == editorial.REVIEW_PRICE
    assert body["slots_left"] == editorial.MONTHLY_CAPACITY
    assert body["disclosure"]


def test_open_orders_consume_this_month_capacity(client, app):
    with app.app_context():
        editorial.create_order("tool-a", payment_ref="A1")
        editorial.create_order("tool-b", payment_ref="B1")
    body = client.get("/api/v1/reviews/pricing").get_json()
    assert body["open_orders"] == 2
    assert body["slots_left"] == editorial.MONTHLY_CAPACITY - 2


# --- ordering ---------------------------------------------------------------


def test_checkout_queues_a_commission_when_paypal_verifies(client, app):
    with app.app_context():
        _seed_tool()

    with patch("app.editorial_routes.verify_paypal_order", return_value=(True, "paypal_order_verified")):
        resp = client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "reviewed-tool",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
            "brief": "Please try the monorepo indexing.",
        })

    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()["review"]["status"] == "ordered"
    with app.app_context():
        row = EditorialReview.query.filter_by(tool_slug="reviewed-tool").one()
        assert row.amount_paid == editorial.REVIEW_PRICE
        assert row.payment_ref == "8AB123456789"
        assert row.brief == "Please try the monorepo indexing."


def test_checkout_verifies_the_full_list_price(client, app):
    """The buyer chooses nothing about the amount, so the server must assert
    it — otherwise a $1 capture buys a $49 review."""
    with app.app_context():
        _seed_tool()

    with patch("app.editorial_routes.verify_paypal_order", return_value=(True, "ok")) as verify:
        client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "reviewed-tool",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
        })
    assert verify.call_args.kwargs["expected_amount"] == editorial.REVIEW_PRICE


def test_refused_payment_commissions_nothing(client, app):
    with app.app_context():
        _seed_tool()

    with patch("app.editorial_routes.verify_paypal_order", return_value=(False, "order_status_VOIDED")):
        resp = client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "reviewed-tool",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
        })

    assert resp.status_code == 402
    assert resp.get_json()["outcome"] == "refused"
    with app.app_context():
        assert EditorialReview.query.count() == 0


def test_unreachable_paypal_is_escalated_not_downgraded(client, app):
    """A payment we could not check may be perfectly real: 503 and a "do not
    pay again" message, never a silent drop."""
    with app.app_context():
        _seed_tool()

    with patch("app.editorial_routes.verify_paypal_order",
               return_value=(False, "paypal_api_unreachable")):
        resp = client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "reviewed-tool",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
        })

    assert resp.status_code == 503
    assert resp.get_json()["outcome"] == "indeterminate"
    assert "do NOT pay again" in resp.get_json()["error"]
    with app.app_context():
        assert EditorialReview.query.count() == 0


def test_replayed_order_id_does_not_mint_a_second_commission(client, app):
    with app.app_context():
        _seed_tool()
        first, _ = editorial.create_order("reviewed-tool", payment_ref="8AB123456789")
        second, err = editorial.create_order("reviewed-tool", payment_ref="8AB123456789")
        assert err is None
        assert second.id == first.id
        assert EditorialReview.query.count() == 1


def test_second_order_for_a_tool_already_queued_is_refused_before_payment(client, app):
    with app.app_context():
        _seed_tool()
        editorial.create_order("reviewed-tool", payment_ref="EARLIER")

    with patch("app.editorial_routes.verify_paypal_order") as verify:
        resp = client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "reviewed-tool",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
        })
    assert resp.status_code == 409
    verify.assert_not_called()


def test_checkout_requires_a_catalog_tool(client, app):
    with patch("app.editorial_routes.verify_paypal_order") as verify:
        resp = client.post("/api/v1/reviews/checkout", json={
            "tool_slug": "not-in-the-catalog",
            "order_id": "8AB123456789",
            "contact_email": "founder@example.com",
        })
    assert resp.status_code == 400
    verify.assert_not_called()


# --- publishing -------------------------------------------------------------


def test_a_draft_is_not_visible_to_readers(client, app):
    with app.app_context():
        _seed_tool()
        review, _ = editorial.create_order("reviewed-tool", payment_ref="DRAFT1")
        editorial.update_review(review, {"body": BODY, "status": "drafting"})

    assert client.get("/api/v1/reviews/reviewed-tool").status_code == 404
    assert "editorial_review" not in client.get("/api/v1/tools/reviewed-tool").get_json()


def test_publishing_an_empty_review_is_refused(client, app):
    with app.app_context():
        _seed_tool()
        review, _ = editorial.create_order("reviewed-tool", payment_ref="EMPTY1")
        assert editorial.update_review(review, {"status": "published"}) == "body_too_short_to_publish"
        assert editorial.update_review(
            review, {"body": BODY, "status": "published"}
        ) == "verdict_required_to_publish"
        assert EditorialReview.query.one().status == "ordered"


def test_published_review_is_served_on_the_tool_payload_with_its_disclosure(client, app):
    with app.app_context():
        _seed_tool()
    _publish(app, payment_ref="PUB1")

    body = client.get("/api/v1/tools/reviewed-tool").get_json()
    review = body["editorial_review"]
    assert review["score"] == 3.5
    assert review["author_name"] == "Lokendra Singh"
    assert review["pros"] == ["Fast autocomplete", "Best-in-class diff view"]
    assert review["commissioned"] is True
    assert review["disclosure"] == editorial.DISCLOSURE
    assert review["published_at"]
    # The buyer's money and brief are ours and theirs, not the reader's.
    assert "payment_ref" not in review
    assert "brief" not in review


def test_published_review_is_in_the_crawler_html(client, app):
    """The artifact is only worth $49 because it is indexable — so it has to
    exist outside the React bundle."""
    with app.app_context():
        _seed_tool()
    _publish(app, payment_ref="PUB2")

    html = client.get("/tools/reviewed-tool").get_data(as_text=True)
    assert "Reviewed Tool, after a day of real work" in html
    assert "Best-in-class diff view" in html
    assert "Worth the money if you live in a monorepo" in html
    assert "commissioned" in html


def test_a_tool_without_a_review_renders_unchanged(client, app):
    with app.app_context():
        _seed_tool("plain-tool", "Plain Tool")
    resp = client.get("/tools/plain-tool")
    assert resp.status_code == 200
    assert "commissioned" not in resp.get_data(as_text=True)


def test_negative_verdicts_survive_publication(client, app):
    """The purchase buys the work, not the conclusion. Nothing in the write
    path may require a flattering score."""
    with app.app_context():
        _seed_tool()
    _publish(app, payment_ref="PUB3", score=1.5,
             verdict="Do not buy this yet — it lost work twice in a day.")

    review = client.get("/api/v1/reviews/reviewed-tool").get_json()["review"]
    assert review["score"] == 1.5
    assert review["verdict"].startswith("Do not buy this yet")


def test_publishing_frees_the_open_order(client, app):
    with app.app_context():
        _seed_tool()
    _publish(app, payment_ref="PUB4")
    with app.app_context():
        assert editorial.has_open_order("reviewed-tool") is False


# --- admin ------------------------------------------------------------------


def test_admin_queue_shows_the_money_and_the_deadline(client, app):
    with app.app_context():
        _seed_tool()
        editorial.create_order("reviewed-tool", contact_email="founder@example.com",
                               amount_paid=49.0, payment_ref="QUEUE1")
    _login_as_admin(client, app)

    body = client.get("/api/v1/reviews/admin/queue").get_json()
    assert len(body["reviews"]) == 1
    row = body["reviews"][0]
    assert row["contact_email"] == "founder@example.com"
    assert row["amount_paid"] == 49.0
    assert row["due_at"]


def test_review_queue_and_writing_are_admin_only(client, app):
    with app.app_context():
        _seed_tool()
        review, _ = editorial.create_order("reviewed-tool", payment_ref="LOCKED1")
        review_id = review.id

    assert client.get("/api/v1/reviews/admin/queue").status_code in (401, 403, 302)
    resp = client.patch(f"/api/v1/reviews/admin/orders/{review_id}",
                        json={"body": BODY, "status": "published"})
    assert resp.status_code in (401, 403, 302)
    with app.app_context():
        assert EditorialReview.query.get(review_id).status == "ordered"
