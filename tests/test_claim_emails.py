"""Telling a claimant what happened to their claim (app/claim_emails.py).

The bug these pin was not a crash. Filing a claim rendered "you'll hear back
by email", and approving one set a status, committed, and sent nothing — the
whole claim path contained no mail call at all. So the permission became real
and the person it belonged to was never told; the only way to discover you had
been approved was to reopen the tool's page and notice the button had changed.

What each test is really protecting:

  * The promise the form makes is kept, on BOTH routes into approval — the
    admin queue and the instant domain match. The domain-match path is the
    easier one to forget, and it is the one where the notice is the only
    message that claimant will ever get.
  * The email carries the editor link. A permission the reader has to go
    hunting for is not much of a gift.
  * Mail failure never breaks the decision. The status change is the
    substantive act; the email is the courtesy, and an approve button that
    500s on a mail outage gets clicked again, which is how one founder is
    told three times.
"""
import json
import os
import tempfile
from unittest.mock import patch

import pytest

from app import create_app, db
from app.models import CatalogTool, ToolClaim, User
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
    refresh_tools_cache()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


_IP_SEQ = iter(range(1, 250))


def _tool(slug="mailable-tool", name="Mailable Tool", url="https://mailable.example.com"):
    data = {
        "slug": slug, "name": name, "category": "Productivity",
        "description": "Description.", "link": url, "sponsored": False,
    }
    db.session.add(CatalogTool(slug=slug, name=name, category="Productivity",
                               hidden=False, data=json.dumps(data)))
    db.session.commit()
    refresh_tools_cache()


def _user(app, email, is_admin=False):
    with app.app_context():
        u = User(email=email, is_admin=is_admin)
        db.session.add(u)
        db.session.commit()
        return u.id


def _login(client, user_id):
    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True


def _claim(client, slug="mailable-tool", **payload):
    return client.post(
        f"/api/v1/claims/{slug}",
        environ_base={"REMOTE_ADDR": f"10.9.0.{next(_IP_SEQ)}"},
        json=payload,
    )


class _Sent:
    """Records send_email calls so a test can assert on what a founder would
    actually have received, rather than only that something was attempted."""

    def __init__(self, ok=True):
        self.ok = ok
        self.calls = []

    def __call__(self, to=None, subject=None, html=None, text=None, **kw):
        self.calls.append({"to": to, "subject": subject, "html": html or "", "text": text or ""})
        return self.ok


def _mail(ok=True):
    """Patch the transport and the budget. Both are patched at the point
    app.claim_emails imports them, since it imports inside the function."""
    sent = _Sent(ok=ok)
    return sent, (
        patch("app.email_utils.send_email", sent),
        patch("app.email_utils.email_enabled", lambda: True),
        patch("app.send_budget.reserve_send_slots", lambda n, requester=None: {"granted": n}),
    )


# --- the promise the claim form makes ---------------------------------------


def test_an_admin_approval_emails_the_claimant(client, app):
    with app.app_context():
        _tool()
    founder = _user(app, "founder@gmail.com")
    _login(client, founder)
    _claim(client, evidence="I built it.")

    admin_id = _user(app, "mail-admin@example.com", is_admin=True)
    _login(client, admin_id)
    claim_id = client.get("/api/v1/claims/admin/queue").get_json()["claims"][0]["id"]

    sent, patches = _mail()
    with patches[0], patches[1], patches[2]:
        resp = client.patch(f"/api/v1/claims/admin/{claim_id}", json={"status": "approved"})

    assert resp.status_code == 200
    assert resp.get_json()["notified"] is True
    assert len(sent.calls) == 1
    call = sent.calls[0]
    # To the person who claimed it, at the address they claimed with.
    assert call["to"] == "founder@gmail.com"
    assert "Mailable Tool" in call["subject"]
    # And it hands them the editor rather than announcing one exists.
    assert "/dashboard/listing/mailable-tool" in call["html"]
    assert "/dashboard/listing/mailable-tool" in call["text"]


def test_an_instant_domain_match_is_also_told(client, app):
    """The easier path to forget, and the one where it matters most: a domain
    match approves without an admin ever opening the queue, so this is the
    ONLY message that claimant will ever get about it."""
    with app.app_context():
        _tool()
    founder = _user(app, "founder@mailable.example.com")
    _login(client, founder)

    sent, patches = _mail()
    with patches[0], patches[1], patches[2]:
        resp = _claim(client)

    assert resp.status_code == 201
    assert resp.get_json()["claim"]["status"] == "approved"
    assert len(sent.calls) == 1
    assert sent.calls[0]["to"] == "founder@mailable.example.com"
    assert "/dashboard/listing/mailable-tool" in sent.calls[0]["html"]


def test_a_rejection_is_explained_and_appealable(client, app):
    """A queue nobody hears back from is indistinguishable from one that
    ignores them. The admin's own note is what the claimant reads."""
    with app.app_context():
        _tool()
    founder = _user(app, "stranger@gmail.com")
    _login(client, founder)
    _claim(client)

    admin_id = _user(app, "mail-admin2@example.com", is_admin=True)
    _login(client, admin_id)
    claim_id = client.get("/api/v1/claims/admin/queue").get_json()["claims"][0]["id"]

    sent, patches = _mail()
    with patches[0], patches[1], patches[2]:
        resp = client.patch(f"/api/v1/claims/admin/{claim_id}", json={
            "status": "rejected",
            "admin_note": "We could not match you to the team behind the tool.",
        })

    assert resp.status_code == 200
    assert len(sent.calls) == 1
    assert sent.calls[0]["to"] == "stranger@gmail.com"
    assert "could not match you" in sent.calls[0]["html"]
    # No editor link in a rejection — offering one would be worse than silence.
    assert "/dashboard/listing/" not in sent.calls[0]["html"]


def test_a_pending_claim_is_not_emailed(client, app):
    """Filing is not a decision. The claimant already saw the on-screen
    confirmation, and a second 'we received it' costs a send slot out of the
    same 100/day pool outreach runs on."""
    with app.app_context():
        _tool()
    founder = _user(app, "stranger2@gmail.com")
    _login(client, founder)

    sent, patches = _mail()
    with patches[0], patches[1], patches[2]:
        resp = _claim(client)

    assert resp.status_code == 201
    assert resp.get_json()["claim"]["status"] == "pending"
    assert sent.calls == []


# --- the decision must survive the mail -------------------------------------


def test_the_approval_still_lands_when_the_mail_fails(client, app):
    """The permission is the substantive act. An approve button that 500s on
    a mail outage gets clicked again — which is how one founder is told three
    times, and how an admin stops trusting the queue."""
    with app.app_context():
        _tool()
    founder = _user(app, "founder3@gmail.com")
    _login(client, founder)
    _claim(client)

    admin_id = _user(app, "mail-admin3@example.com", is_admin=True)
    _login(client, admin_id)
    claim_id = client.get("/api/v1/claims/admin/queue").get_json()["claims"][0]["id"]

    with patch("app.email_utils.email_enabled", lambda: True), \
         patch("app.send_budget.reserve_send_slots", lambda n, requester=None: {"granted": n}), \
         patch("app.email_utils.send_email", side_effect=RuntimeError("SMTP down")):
        resp = client.patch(f"/api/v1/claims/admin/{claim_id}", json={"status": "approved"})

    assert resp.status_code == 200
    # Reported honestly, so the panel can say "approved, but we could not
    # reach them" instead of implying the founder has been told.
    assert resp.get_json()["notified"] is False

    with app.app_context():
        assert ToolClaim.query.get(claim_id).status == "approved"

    # And the thing the email was announcing actually works.
    _login(client, founder)
    assert client.patch("/api/v1/claims/mailable-tool/listing",
                        json={"description": "Mine now."}).status_code == 200


def test_no_transport_defers_rather_than_pretending(client, app):
    with app.app_context():
        _tool()
    founder = _user(app, "founder4@gmail.com")
    _login(client, founder)
    _claim(client)

    admin_id = _user(app, "mail-admin4@example.com", is_admin=True)
    _login(client, admin_id)
    claim_id = client.get("/api/v1/claims/admin/queue").get_json()["claims"][0]["id"]

    with patch("app.email_utils.email_enabled", lambda: False):
        resp = client.patch(f"/api/v1/claims/admin/{claim_id}", json={"status": "approved"})

    assert resp.status_code == 200
    assert resp.get_json()["notified"] is False
    with app.app_context():
        assert ToolClaim.query.get(claim_id).status == "approved"


def test_an_exhausted_send_budget_does_not_overdraw_the_cap(client, app):
    """Claim notices share the 100/day Resend cap with outreach and the
    digest. Taking a slot that is not there would push the whole day over and
    silently drop somebody else's mail."""
    with app.app_context():
        _tool()
    founder = _user(app, "founder5@gmail.com")
    _login(client, founder)
    _claim(client)

    admin_id = _user(app, "mail-admin5@example.com", is_admin=True)
    _login(client, admin_id)
    claim_id = client.get("/api/v1/claims/admin/queue").get_json()["claims"][0]["id"]

    sent = _Sent()
    with patch("app.email_utils.email_enabled", lambda: True), \
         patch("app.send_budget.reserve_send_slots", lambda n, requester=None: {"granted": 0}), \
         patch("app.email_utils.send_email", sent):
        resp = client.patch(f"/api/v1/claims/admin/{claim_id}", json={"status": "approved"})

    assert resp.status_code == 200
    assert sent.calls == []
    with app.app_context():
        assert ToolClaim.query.get(claim_id).status == "approved"


# --- gated change requests reach a human ------------------------------------


def test_a_gated_change_request_is_forwarded_to_an_admin(client, app):
    """The boundary that stops a maker moving their own listing's URL must not
    also lose what they asked for — that is the difference between a rule and
    a dead end."""
    with app.app_context():
        _tool()
    founder = _user(app, "founder@mailable.example.com")
    _login(client, founder)

    sent, patches = _mail()
    with patches[0], patches[1], patches[2]:
        _claim(client)
        sent.calls.clear()  # drop the approval notice; we want the next one
        resp = client.patch("/api/v1/claims/mailable-tool/listing", json={
            "description": "Edited.",
            "link": "https://moved.example.com",
        })

    assert resp.status_code == 200
    assert len(sent.calls) == 1
    call = sent.calls[0]
    assert "mailable-tool" in call["subject"]
    assert "https://moved.example.com" in call["text"]
    # Who asked, so an admin can reply to a person rather than to a slug.
    assert "founder@mailable.example.com" in call["text"]
