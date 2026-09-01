"""Logo on a submitted tool: the founder's upload, and the one we fetch.

Two separate promises, and the second is the one that used to be missing
entirely — an approved listing showed a letter tile unless a human went and
found a logo by hand, because the browser-side fallback guessed a domain from
the tool's NAME ("SimplAI" -> simplai.com) rather than reading the URL the
submission actually gave us.

Every request carries its own X-Forwarded-For. /submit-tool is rate limited to
5 per IP per hour and the app fixture is session-scoped, so tests that share
an IP start failing each other in whatever order pytest happens to pick.
"""

import base64
import zlib

import pytest

from app import db
from app.models import Submission, User


def _png_bytes(size=32):
    """A real, minimal PNG — the server sniffs magic bytes, so a fake won't do."""
    def chunk(tag, payload):
        body = tag + payload
        return (
            len(payload).to_bytes(4, "big")
            + body
            + (zlib.crc32(body) & 0xFFFFFFFF).to_bytes(4, "big")
        )

    ihdr = size.to_bytes(4, "big") + size.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * size for _ in range(size))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _data_url(raw, mime="image/png"):
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def _submit(client, ip, **overrides):
    payload = {
        "name": "SimplAI",
        "url": "https://simplai.ai/",
        "category": "Productivity",
        "reason": "An agentic AI operating system for enterprises.",
        "pricing_model": "free",
        "submitter_email": "media@simplai.ai",
    }
    payload.update(overrides)
    return client.post(
        "/api/v1/submit-tool", json=payload, headers={"X-Forwarded-For": ip}
    )


def _login_as_admin(client, app, email):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


@pytest.fixture(autouse=True)
def _clean_submissions(app):
    yield
    with app.app_context():
        Submission.query.delete()
        db.session.commit()


def test_uploaded_logo_is_stored_and_served(client, app):
    raw = _png_bytes()
    resp = _submit(client, "10.1.0.1", name="LogoUpload Tool", logo=_data_url(raw))
    assert resp.status_code in (200, 201), resp.data

    with app.app_context():
        sub = Submission.query.filter_by(name="LogoUpload Tool").one()
        assert bytes(sub.logo_data) == raw
        assert sub.logo_mime == "image/png"
        assert sub.logo_source == "upload"
        sub_id = sub.id

    served = client.get(f"/logo/submission/{sub_id}")
    assert served.status_code == 200
    assert served.mimetype == "image/png"
    assert served.data == raw


def test_submission_without_a_logo_is_still_accepted(client, app):
    """Optional means optional — the field is a nicety, not a new wall in
    front of a free listing."""
    resp = _submit(client, "10.1.0.2", name="NoLogo Tool")
    assert resp.status_code in (200, 201), resp.data
    with app.app_context():
        sub = Submission.query.filter_by(name="NoLogo Tool").one()
        assert sub.logo_data is None


def test_non_image_upload_is_rejected_before_the_row_is_written(client, app):
    """A PDF labelled image/png is refused on its magic bytes, not its label,
    and refused BEFORE the submission is recorded — a 400 the submitter can
    fix beats a saved row carrying a file we will never render."""
    resp = _submit(
        client,
        "10.1.0.3",
        name="Bad Logo Tool",
        logo=_data_url(b"%PDF-1.4 not really a png at all"),
    )
    assert resp.status_code == 400
    assert "PNG" in resp.get_json()["error"]
    with app.app_context():
        assert Submission.query.filter_by(name="Bad Logo Tool").first() is None


def test_oversized_logo_is_rejected(client, app):
    from app.tool_logos import LOGO_MAX_BYTES

    # A valid PNG header followed by enough bytes to blow the cap: the size
    # check must fire on real images too, not only on junk.
    big = _png_bytes() + b"\x00" * LOGO_MAX_BYTES
    resp = _submit(client, "10.1.0.4", name="Huge Logo Tool", logo=_data_url(big))
    assert resp.status_code == 400
    assert "KB" in resp.get_json()["error"]


def test_approval_fetches_a_logo_from_the_submitted_url(client, app, monkeypatch):
    """The domain comes from the submission's own website, not from its name.

    simplai.ai is the whole test: a name-derived guess produces simplai.com,
    which is a different company's favicon.
    """
    seen = {}
    raw = _png_bytes()

    def _fake_fetch(domain):
        seen["domain"] = domain
        return raw

    monkeypatch.setattr("app.routes._fetch_icon_bytes", _fake_fetch)

    assert _submit(client, "10.1.0.5", name="Autologo Tool").status_code in (200, 201)
    with app.app_context():
        sub_id = Submission.query.filter_by(name="Autologo Tool").one().id

    _login_as_admin(client, app, "admin-logo-auto@t.test")
    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data

    assert seen["domain"] == "simplai.ai"
    assert resp.get_json()["tool"]["logo_url"] == f"/logo/submission/{sub_id}"
    with app.app_context():
        sub = db.session.get(Submission, sub_id)
        assert sub.logo_source == "auto"


def test_approval_never_overwrites_an_uploaded_logo(client, app, monkeypatch):
    uploaded = _png_bytes(16)
    monkeypatch.setattr("app.routes._fetch_icon_bytes", lambda domain: _png_bytes(64))

    assert _submit(
        client, "10.1.0.6", name="Keep My Logo Tool", logo=_data_url(uploaded)
    ).status_code in (200, 201)
    with app.app_context():
        sub_id = Submission.query.filter_by(name="Keep My Logo Tool").one().id

    _login_as_admin(client, app, "admin-logo-keep@t.test")
    assert client.post(f"/api/v1/admin/submissions/{sub_id}/approve").status_code == 200

    with app.app_context():
        sub = db.session.get(Submission, sub_id)
        assert bytes(sub.logo_data) == uploaded
        assert sub.logo_source == "upload"


def test_approval_survives_a_failed_logo_fetch(client, app, monkeypatch):
    """A third-party favicon service being down must not cost the admin an
    approval — the listing goes live without a stored logo."""
    def _boom(domain):
        raise RuntimeError("favicon service down")

    monkeypatch.setattr("app.routes._fetch_icon_bytes", _boom)

    assert _submit(client, "10.1.0.7", name="Fetch Fails Tool").status_code in (200, 201)
    with app.app_context():
        sub_id = Submission.query.filter_by(name="Fetch Fails Tool").one().id

    _login_as_admin(client, app, "admin-logo-fail@t.test")
    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    assert "logo_url" not in resp.get_json()["tool"]


def test_logo_route_404s_for_a_submission_with_no_logo(client, app):
    with app.app_context():
        sub = Submission(
            name="Bare Tool", website="https://bare.example.com",
            category="Productivity", description="No logo here.",
            pricing_model="free", status="pending",
        )
        db.session.add(sub)
        db.session.commit()
        sub_id = sub.id

    assert client.get(f"/logo/submission/{sub_id}").status_code == 404
    assert client.get("/logo/submission/99999").status_code == 404
