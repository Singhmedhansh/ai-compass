import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.models import CatalogTool, CommunityComment, CommunityPost, Submission, User


@pytest.fixture(autouse=True)
def _bypass_rate_limit(monkeypatch):
    # Rate limiting itself is covered by test_rate_limit.py; the in-memory
    # limiter is a shared module-level dict keyed by IP, and Flask's test
    # client always uses the same IP, so every test in this file would
    # otherwise share one bucket and trip 429s well before hitting any
    # per-test limit.
    monkeypatch.setattr("app.community_routes.is_rate_limited", lambda *a, **k: False)


def _login(client, app, email=None):
    email = email or f"poster-{uuid.uuid4().hex[:12]}@example.com"
    with app.app_context():
        user = User(email=email)
        db.session.add(user)
        db.session.commit()
        user_id = user.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True
    return user_id


def test_create_post_requires_login(client):
    resp = client.post("/api/v1/community/posts", json={"title": "Hello world", "body": "This is a test post body."})
    assert resp.status_code in (302, 401)


def test_create_post_validates_length(client, app):
    _login(client, app)
    resp = client.post("/api/v1/community/posts", json={"title": "Hi", "body": "short"})
    assert resp.status_code == 400


def test_create_post_and_list(client, app):
    _login(client, app)
    resp = client.post("/api/v1/community/posts", json={
        "title": "A real discussion title",
        "body": "This is a long enough body to pass validation.",
        "post_type": "discussion",
    })
    assert resp.status_code == 201
    post_id = resp.get_json()["id"]

    listed = client.get("/api/v1/community/posts")
    assert listed.status_code == 200
    data = listed.get_json()
    assert data["count"] == 1
    assert data["posts"][0]["id"] == post_id
    assert data["posts"][0]["comment_count"] == 0
    assert data["posts"][0]["score"] == 0


def test_vote_toggle_and_score(client, app):
    _login(client, app)
    post_resp = client.post("/api/v1/community/posts", json={
        "title": "Vote on this post please",
        "body": "Body text long enough to pass validation checks.",
    })
    post_id = post_resp.get_json()["id"]

    up = client.post(f"/api/v1/community/posts/{post_id}/vote", json={"vote_type": 1})
    assert up.get_json()["score"] == 1

    # toggling the same vote_type again via the API directly (not the UI's
    # toggle-to-0 logic) just re-applies it — clearing is an explicit 0.
    clear = client.post(f"/api/v1/community/posts/{post_id}/vote", json={"vote_type": 0})
    assert clear.get_json()["score"] == 0

    down = client.post(f"/api/v1/community/posts/{post_id}/vote", json={"vote_type": -1})
    assert down.get_json()["score"] == -1


def test_comment_flow(client, app):
    _login(client, app)
    post_resp = client.post("/api/v1/community/posts", json={
        "title": "Post with comments",
        "body": "Body text long enough to pass validation checks.",
    })
    post_id = post_resp.get_json()["id"]

    comment = client.post(f"/api/v1/community/posts/{post_id}/comments", json={"body": "Nice post!"})
    assert comment.status_code == 201
    comment_id = comment.get_json()["id"]

    detail = client.get(f"/api/v1/community/posts/{post_id}")
    assert detail.status_code == 200
    body = detail.get_json()
    assert body["comment_count"] == 1
    assert body["comments"][0]["id"] == comment_id
    assert body["comments"][0]["body"] == "Nice post!"

    vote = client.post(f"/api/v1/community/comments/{comment_id}/vote", json={"vote_type": 1})
    assert vote.get_json()["score"] == 1


def test_delete_post_requires_ownership(client, app):
    owner_id = _login(client, app, email="owner@example.com")
    post_resp = client.post("/api/v1/community/posts", json={
        "title": "Owner's post to delete",
        "body": "Body text long enough to pass validation checks.",
    })
    post_id = post_resp.get_json()["id"]

    # Switching _user_id on the same client carries over the first login's
    # session_uuid, which the app's session-revocation middleware then
    # treats as hijacked for the new user_id. Use a separate client per
    # identity, matching how two real browsers would behave.
    other_client = app.test_client()
    _login(other_client, app, email="someone-else@example.com")
    forbidden = other_client.delete(f"/api/v1/community/posts/{post_id}")
    assert forbidden.status_code == 403

    with app.app_context():
        assert CommunityPost.query.get(post_id) is not None

    owner_client = app.test_client()
    with owner_client.session_transaction() as sess:
        sess["_user_id"] = str(owner_id)
        sess["_fresh"] = True
    ok = owner_client.delete(f"/api/v1/community/posts/{post_id}")
    assert ok.status_code == 200
    with app.app_context():
        assert CommunityPost.query.get(post_id) is None


def test_delete_comment_requires_ownership(client, app):
    owner_id = _login(client, app, email="comment-owner@example.com")
    post_resp = client.post("/api/v1/community/posts", json={
        "title": "Post to comment on and delete",
        "body": "Body text long enough to pass validation checks.",
    })
    post_id = post_resp.get_json()["id"]
    comment_resp = client.post(f"/api/v1/community/posts/{post_id}/comments", json={"body": "A comment to delete"})
    comment_id = comment_resp.get_json()["id"]

    other_client = app.test_client()
    _login(other_client, app, email="comment-intruder@example.com")
    forbidden = other_client.delete(f"/api/v1/community/comments/{comment_id}")
    assert forbidden.status_code == 403

    owner_client = app.test_client()
    with owner_client.session_transaction() as sess:
        sess["_user_id"] = str(owner_id)
        sess["_fresh"] = True
    ok = owner_client.delete(f"/api/v1/community/comments/{comment_id}")
    assert ok.status_code == 200

    with app.app_context():
        assert CommunityComment.query.get(comment_id) is None


def test_featured_flag_for_sponsored_tool(client, app):
    _login(client, app)
    with app.app_context():
        submission = Submission(
            name="Sponsored Tool",
            website="https://sponsored-tool.example.com",
            category="Productivity",
            description="A sponsored tool.",
            pricing_model="sponsored_paypal:ABC123",
            status="approved",
            payment_status="verified",
        )
        db.session.add(submission)
        db.session.commit()
        submission_id = submission.id

        tool = CatalogTool(
            slug="sponsored-tool",
            name="Sponsored Tool",
            data="{}",
            submission_id=submission_id,
        )
        db.session.add(tool)
        db.session.commit()

    resp = client.post("/api/v1/community/posts", json={
        "title": "Check out this sponsored tool",
        "body": "Body text long enough to pass validation checks.",
        "tool_slug": "sponsored-tool",
    })
    assert resp.status_code == 201

    listed = client.get("/api/v1/community/posts").get_json()
    assert listed["posts"][0]["is_featured"] is True


def test_featured_flag_false_for_free_tier_tool(client, app):
    _login(client, app)
    with app.app_context():
        submission = Submission(
            name="Free Tool",
            website="https://free-tool.example.com",
            category="Productivity",
            description="A free tier tool.",
            pricing_model="free",
            status="approved",
            payment_status="unpaid",
        )
        db.session.add(submission)
        db.session.commit()
        submission_id = submission.id

        tool = CatalogTool(
            slug="free-tool",
            name="Free Tool",
            data="{}",
            submission_id=submission_id,
        )
        db.session.add(tool)
        db.session.commit()

    resp = client.post("/api/v1/community/posts", json={
        "title": "Check out this free tool",
        "body": "Body text long enough to pass validation checks.",
        "tool_slug": "free-tool",
    })
    assert resp.status_code == 201

    listed = client.get("/api/v1/community/posts").get_json()
    assert listed["posts"][0]["is_featured"] is False


def test_featured_flag_expires_after_window(client, app):
    _login(client, app)
    with app.app_context():
        submission = Submission(
            name="Old Sponsored Tool",
            website="https://old-sponsored-tool.example.com",
            category="Productivity",
            description="An old sponsored tool past its boost window.",
            pricing_model="sponsored_paypal:XYZ999",
            status="approved",
            payment_status="verified",
            submitted_at=datetime.now(timezone.utc) - timedelta(days=45),
        )
        db.session.add(submission)
        db.session.commit()
        submission_id = submission.id

        tool = CatalogTool(
            slug="old-sponsored-tool",
            name="Old Sponsored Tool",
            data="{}",
            submission_id=submission_id,
        )
        db.session.add(tool)
        db.session.commit()

    resp = client.post("/api/v1/community/posts", json={
        "title": "Check out this old sponsored tool",
        "body": "Body text long enough to pass validation checks.",
        "tool_slug": "old-sponsored-tool",
    })
    assert resp.status_code == 201

    listed = client.get("/api/v1/community/posts").get_json()
    assert listed["posts"][0]["is_featured"] is False


def test_tool_slug_filter(client, app):
    _login(client, app)
    client.post("/api/v1/community/posts", json={
        "title": "General discussion post",
        "body": "Body text long enough to pass validation checks.",
    })
    client.post("/api/v1/community/posts", json={
        "title": "Tool specific post",
        "body": "Body text long enough to pass validation checks.",
        "tool_slug": "some-tool",
    })

    filtered = client.get("/api/v1/community/posts?tool_slug=some-tool").get_json()
    assert filtered["count"] == 1
    assert filtered["posts"][0]["tool_slug"] == "some-tool"
