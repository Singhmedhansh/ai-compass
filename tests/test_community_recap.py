import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.models import (
    CommentVote,
    CommunityComment,
    CommunityPost,
    OutboundClick,
    PostVote,
    SponsorImpression,
    SponsorSlot,
    User,
)


@pytest.fixture(autouse=True)
def _isolate(app):
    """The session-scoped test DB has no per-test rollback, and every
    assertion here is about *which* people and posts are picked up."""
    def wipe():
        with app.app_context():
            for model in (
                SponsorImpression, SponsorSlot, OutboundClick,
                CommentVote, PostVote, CommunityComment, CommunityPost,
            ):
                model.query.delete()
            db.session.commit()
    wipe()
    yield
    wipe()


def _user(app, notifications=True):
    with app.app_context():
        user = User(
            email=f"member-{uuid.uuid4().hex[:12]}@example.com",
            notifications_enabled=notifications,
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _post(app, user_id, slug=None, days_ago=0, title="A community thread here"):
    with app.app_context():
        post = CommunityPost(
            user_id=user_id, title=title, body="A body long enough to be valid.",
            post_type="discussion", tool_slug=slug,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago),
        )
        db.session.add(post)
        db.session.commit()
        return post.id


# --- audience selection ----------------------------------------------------

def test_only_active_members_are_recipients(app):
    """The whole premise: this is not the newsletter. A registered user who
    has never touched the community must not receive a recap about it."""
    from app.community_recap import recipients

    active = _user(app)
    _user(app)  # registered but never participated
    _post(app, active)

    with app.app_context():
        emails = [u.id for u in recipients()]
    assert emails == [active]


def test_voting_alone_makes_a_member_active(app):
    """Someone who reads and upvotes all week is participating. Excluding
    them would drop the quietest half of the community from its own recap."""
    from app.community_recap import recipients

    author = _user(app)
    voter = _user(app)
    post_id = _post(app, author)
    with app.app_context():
        db.session.add(PostVote(post_id=post_id, user_id=voter, vote_type=1))
        db.session.commit()
        ids = {u.id for u in recipients()}
    assert voter in ids


def test_commenting_makes_a_member_active(app):
    from app.community_recap import recipients

    author = _user(app)
    commenter = _user(app)
    post_id = _post(app, author)
    with app.app_context():
        db.session.add(CommunityComment(post_id=post_id, user_id=commenter, body="Good point."))
        db.session.commit()
        ids = {u.id for u in recipients()}
    assert commenter in ids


def test_activity_older_than_the_window_does_not_qualify(app):
    from app.community_recap import recipients

    stale = _user(app)
    _post(app, stale, days_ago=60)
    with app.app_context():
        assert recipients() == []


def test_unsubscribed_members_are_excluded(app):
    """notifications_enabled is what /unsubscribe flips, so honouring it
    here is what makes that link actually work for the recap."""
    from app.community_recap import recipients

    optout = _user(app, notifications=False)
    _post(app, optout)
    with app.app_context():
        assert recipients() == []


# --- content ---------------------------------------------------------------

def test_summary_ranks_threads_by_discussion(app):
    from app.community_recap import build_summary

    author = _user(app)
    quiet = _post(app, author, title="A thread nobody replied to")
    busy = _post(app, author, title="A thread people argued about")
    with app.app_context():
        for _ in range(3):
            db.session.add(CommunityComment(post_id=busy, user_id=author, body="Replying here."))
        db.session.commit()
        summary = build_summary()

    assert summary["threads"][0]["id"] == busy
    assert summary["threads"][0]["comments"] == 3
    assert quiet in [t["id"] for t in summary["threads"]]


def test_summary_uses_catalog_names_not_titlecased_slugs(app):
    """Title-casing a slug turns "chatgpt" into "Chatgpt", which makes an
    otherwise personal email look machine-generated."""
    from app.models import CatalogTool
    from app.community_recap import build_summary

    author = _user(app)
    with app.app_context():
        db.session.add(CatalogTool(slug="chatgpt", name="ChatGPT", data="{}"))
        db.session.commit()
    _post(app, author, slug="chatgpt")

    with app.app_context():
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()
        names = [r["name"] for r in build_summary()["board"]]
    assert "ChatGPT" in names


def test_sponsored_partners_are_mentioned_and_labelled(app):
    """The board tier is sold on this mention — if it silently stops
    appearing we are billing for something we do not deliver."""
    from app.community_recap import build_summary

    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(SponsorSlot(
            tool_slug="partner-tool", placement="board",
            headline="We just shipped v2.",
            ends_at=now + timedelta(days=7), amount_paid=89.0,
        ))
        db.session.commit()
        sponsors = build_summary()["sponsors"]

    assert [s["name"] for s in sponsors] == ["Partner Tool"]
    assert sponsors[0]["label"] == "Presenting Partner"
    assert sponsors[0]["blurb"] == "We just shipped v2."


# --- send behaviour --------------------------------------------------------

def test_no_activity_means_no_email(app):
    """A recap saying "nothing happened" is the fastest way to get filtered."""
    from app.community_recap import run_recap

    with app.app_context():
        assert run_recap(dry_run=True)["status"] == "noop"


def test_dry_run_reports_audience_without_sending(app, monkeypatch):
    from app import community_recap

    sent = []
    monkeypatch.setattr(community_recap, "send_email", lambda *a, **k: sent.append(a))

    author = _user(app)
    _post(app, author, title="Something happened this week")

    with app.app_context():
        result = community_recap.run_recap(dry_run=True)
    assert result["status"] == "dry_run"
    assert result["recipients"] == 1
    assert sent == []


def test_send_renders_and_delivers_to_each_active_member(app, monkeypatch):
    from app import community_recap

    delivered = []

    def fake_send(to, subject, html, text):
        delivered.append({"to": to, "subject": subject, "html": html, "text": text})
        return True

    monkeypatch.setattr(community_recap, "send_email", fake_send)

    author = _user(app)
    _post(app, author, title="A thread that made the recap")

    with app.app_context():
        result = community_recap.run_recap()

    assert result["status"] == "sent"
    assert result["delivered"] == 1
    body = delivered[0]
    assert "A thread that made the recap" in body["html"]
    assert "unsubscribe?token=" in body["html"]
    # Personalised standing — the line that actually drives a return visit.
    assert "builder board" in body["html"]
    assert "karma" in body["text"]


def test_recipients_with_no_karma_still_get_a_useful_email(app, monkeypatch):
    """A voter earns no karma but is still active. Their email must nudge
    rather than report a bare zero."""
    from app import community_recap

    delivered = []
    monkeypatch.setattr(
        community_recap, "send_email",
        lambda to, subject, html, text: delivered.append({"to": to, "html": html}) or True,
    )

    author = _user(app)
    voter = _user(app)
    post_id = _post(app, author, title="A thread worth voting on")
    with app.app_context():
        db.session.add(PostVote(post_id=post_id, user_id=voter, vote_type=1))
        db.session.commit()
        community_recap.run_recap()

    voter_email = next(d for d in delivered if d["to"] != _email_of(app, author))
    assert "didn&#39;t pick up karma" in voter_email["html"] or "didn't pick up karma" in voter_email["html"]


def _email_of(app, user_id):
    with app.app_context():
        return User.query.get(user_id).email


# --- scheduling ------------------------------------------------------------

def test_weekly_claim_lets_only_one_run_win(app, monkeypatch):
    """Render runs several workers; without the atomic claim every one of
    them would send the same recap."""
    from app import community_recap
    from app.models import AppSetting

    runs = []
    monkeypatch.setattr(community_recap, "email_enabled", lambda: True)
    monkeypatch.setattr(community_recap, "run_recap", lambda **k: runs.append(1))

    with app.app_context():
        AppSetting.query.filter_by(key=community_recap.RECAP_CLAIM_KEY).delete()
        db.session.commit()
        community_recap.maybe_run_recap()
        community_recap.maybe_run_recap()
        community_recap.maybe_run_recap()

    assert len(runs) == 1


def test_no_email_transport_means_no_run(app, monkeypatch):
    from app import community_recap

    runs = []
    monkeypatch.setattr(community_recap, "email_enabled", lambda: False)
    monkeypatch.setattr(community_recap, "run_recap", lambda **k: runs.append(1))
    with app.app_context():
        community_recap.maybe_run_recap()
    assert runs == []


# --- admin trigger ---------------------------------------------------------

def test_admin_trigger_requires_the_shared_secret(client, app, monkeypatch):
    monkeypatch.setenv("DIGEST_SECRET", "s3cret")
    assert client.post("/api/v1/admin/send-community-recap").status_code == 401
    assert client.post(
        "/api/v1/admin/send-community-recap",
        headers={"X-Digest-Secret": "wrong"},
    ).status_code == 401
    ok = client.post(
        "/api/v1/admin/send-community-recap?dry_run=1",
        headers={"X-Digest-Secret": "s3cret"},
    )
    assert ok.status_code == 200


def test_admin_trigger_is_locked_when_no_secret_is_configured(client, monkeypatch):
    """An unset DIGEST_SECRET must fail closed — otherwise the endpoint is
    an open relay for mailing the whole active community."""
    monkeypatch.delenv("DIGEST_SECRET", raising=False)
    resp = client.post(
        "/api/v1/admin/send-community-recap",
        headers={"X-Digest-Secret": ""},
    )
    assert resp.status_code == 401


def test_subject_does_not_call_a_reply_less_thread_a_discussion(app):
    from app.community_recap import _subject, build_summary

    author = _user(app)
    post_id = _post(app, author, title="Nobody replied to this one")
    with app.app_context():
        assert "new thread" in _subject(build_summary())

        db.session.add(CommunityComment(post_id=post_id, user_id=author, body="A reply."))
        db.session.commit()
        assert "1 discussion worth your week" in _subject(build_summary())


def test_admin_panel_recap_endpoints_require_admin(client, app):
    """Session-authed twins of the secret-header endpoints — a logged-in
    non-admin must not be able to mail the community."""
    with app.app_context():
        user = User(email=f"plain-{uuid.uuid4().hex[:8]}@example.com")
        db.session.add(user)
        db.session.commit()
        user_id = user.id
    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True

    assert client.post("/api/v1/admin/recap?dry_run=1").status_code == 403
    assert client.post("/api/v1/admin/recap/test").status_code == 403
