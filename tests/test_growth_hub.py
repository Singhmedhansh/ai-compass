"""First-login forced password change, the Growth Hub nav/data, and
session-based (in addition to token-based) submission-dashboard access.

See app/__init__.py's enforce_password_change_gate, the new
/api/v1/auth/change-password and /api/v1/founder/tools endpoints, and the
session branch added to /api/v1/submissions/dashboard.
"""
import os
import tempfile

import pytest

from app import bcrypt, create_app, db
from app.models import Submission, User


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


def _create_user(app, email, password="temp-password-123", must_change_password=False):
    with app.app_context():
        user = User(
            email=email,
            password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
            must_change_password=must_change_password,
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _login(client, email, password="temp-password-123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _create_submission(app, email, name="Founder Tool", founder_user_id=None):
    with app.app_context():
        s = Submission(
            name=name,
            website=f"https://{name.lower().replace(' ', '')}.example.com",
            category="Productivity",
            description="A tool.",
            pricing_model="sponsored_paypal:GH111111",
            submitter_email=email,
            status="pending",
            payment_status="verified",
            is_priority=True,
            founder_user_id=founder_user_id,
        )
        db.session.add(s)
        db.session.commit()
        return s.id


# --- Server-side password-change gate ---------------------------------------


def test_gated_user_login_response_flags_must_change_password(client, app):
    _create_user(app, "gated@example.com", must_change_password=True)
    resp = _login(client, "gated@example.com")
    assert resp.status_code == 200
    assert resp.get_json()["must_change_password"] is True


def test_gate_blocks_other_authenticated_endpoints(client, app):
    """The load-bearing test: hitting an unrelated authenticated API
    endpoint directly (not via any UI) must be rejected server-side while
    must_change_password is still True."""
    _create_user(app, "gated2@example.com", must_change_password=True)
    _login(client, "gated2@example.com")

    resp = client.post("/api/v1/tools/some-tool/ratings", json={"value": 5})
    assert resp.status_code == 403
    assert resp.get_json()["error"] == "password_change_required"


def test_gate_allows_me_logout_and_change_password_endpoints(client, app):
    _create_user(app, "gated3@example.com", must_change_password=True)
    _login(client, "gated3@example.com")

    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.get_json()["must_change_password"] is True

    change_resp = client.post(
        "/api/v1/auth/change-password", json={"new_password": "brand-new-password-1"}
    )
    assert change_resp.status_code == 200


def test_gate_does_not_affect_users_without_the_flag(client, app):
    _create_user(app, "normal@example.com", must_change_password=False)
    _login(client, "normal@example.com")

    resp = client.post("/api/v1/tools/some-tool/ratings", json={"value": 5})
    # Not 403 from the gate — whatever the route itself returns (a rating
    # value/slug validation error is fine, the point is it isn't gated).
    assert resp.status_code != 403 or resp.get_json().get("error") != "password_change_required"


# --- The password-change flow itself ----------------------------------------


def test_change_password_success_clears_flag_and_rehashes(client, app):
    user_id = _create_user(app, "changeme@example.com", password="original-temp-pw", must_change_password=True)
    _login(client, "changeme@example.com", password="original-temp-pw")

    resp = client.post("/api/v1/auth/change-password", json={"new_password": "a-new-strong-password"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["must_change_password"] is False

    with app.app_context():
        user = User.query.get(user_id)
        assert user.must_change_password is False
        assert bcrypt.check_password_hash(user.password_hash, "a-new-strong-password")
        assert not bcrypt.check_password_hash(user.password_hash, "original-temp-pw")


def test_change_password_allows_reusing_the_temporary_password(client, app):
    """Explicitly allowed per spec — not worth blocking on for v1."""
    _create_user(app, "reuse@example.com", password="original-temp-pw", must_change_password=True)
    _login(client, "reuse@example.com", password="original-temp-pw")

    resp = client.post("/api/v1/auth/change-password", json={"new_password": "original-temp-pw"})
    assert resp.status_code == 200
    assert resp.get_json()["must_change_password"] is False


def test_change_password_rejects_weak_password(client, app):
    _create_user(app, "weak@example.com", must_change_password=True)
    _login(client, "weak@example.com")

    resp = client.post("/api/v1/auth/change-password", json={"new_password": "short"})
    assert resp.status_code == 400

    with app.app_context():
        user = User.query.filter_by(email="weak@example.com").first()
        assert user.must_change_password is True  # unchanged


def test_gate_lifted_after_password_change(client, app):
    _create_user(app, "unlocked@example.com", must_change_password=True)
    _login(client, "unlocked@example.com")
    client.post("/api/v1/auth/change-password", json={"new_password": "a-new-strong-password"})

    resp = client.post("/api/v1/tools/some-tool/ratings", json={"value": 5})
    assert resp.status_code != 403 or resp.get_json().get("error") != "password_change_required"


# --- Growth Hub: founder tools listing --------------------------------------


def test_founder_tools_returns_only_own_submissions(client, app):
    owner_id = _create_user(app, "owner@example.com")
    other_id = _create_user(app, "other@example.com")
    sub1 = _create_submission(app, "owner@example.com", "Owner Tool One", founder_user_id=owner_id)
    _create_submission(app, "other@example.com", "Other Tool", founder_user_id=other_id)

    _login(client, "owner@example.com")
    resp = client.get("/api/v1/founder/tools")
    assert resp.status_code == 200
    tools = resp.get_json()["tools"]
    assert len(tools) == 1
    assert tools[0]["submission_id"] == sub1
    assert tools[0]["name"] == "Owner Tool One"


def test_founder_tools_lists_multiple_for_repeat_founder(client, app):
    owner_id = _create_user(app, "repeat@example.com")
    _create_submission(app, "repeat@example.com", "Repeat Tool One", founder_user_id=owner_id)
    _create_submission(app, "repeat@example.com", "Repeat Tool Two", founder_user_id=owner_id)

    _login(client, "repeat@example.com")
    resp = client.get("/api/v1/founder/tools")
    assert resp.status_code == 200
    assert len(resp.get_json()["tools"]) == 2


def test_founder_tools_requires_login(client, app):
    resp = client.get("/api/v1/founder/tools")
    assert resp.status_code == 401


def test_is_founder_flag_on_serialized_user(app):
    # Two separate clients: the session-revocation guard in
    # enforce_user_sessions() correctly logs out a second login attempted
    # through the same client/cookie jar (its session_uuid is still tied to
    # the first user's UserSession row) — reusing one client here would be
    # testing that guard, not is_founder.
    owner_id = _create_user(app, "flagged@example.com")
    _create_user(app, "notfounder@example.com")
    _create_submission(app, "flagged@example.com", "Flagged Tool", founder_user_id=owner_id)

    founder_client = app.test_client()
    _login(founder_client, "flagged@example.com")
    assert founder_client.get("/api/v1/auth/me").get_json()["is_founder"] is True

    other_client = app.test_client()
    _login(other_client, "notfounder@example.com")
    assert other_client.get("/api/v1/auth/me").get_json()["is_founder"] is False


# --- Session-based dashboard access, additive to the token path ------------


def test_session_dashboard_access_for_owning_founder(client, app):
    owner_id = _create_user(app, "dashowner@example.com")
    sub_id = _create_submission(app, "dashowner@example.com", "Dash Owner Tool", founder_user_id=owner_id)

    _login(client, "dashowner@example.com")
    resp = client.get(f"/api/v1/submissions/dashboard?submission_id={sub_id}")
    assert resp.status_code == 200
    assert resp.get_json()["submission"]["name"] == "Dash Owner Tool"


def test_session_dashboard_access_denied_for_non_owning_founder(client, app):
    owner_id = _create_user(app, "realowner@example.com")
    _create_user(app, "intruder@example.com")
    sub_id = _create_submission(app, "realowner@example.com", "Guarded Tool", founder_user_id=owner_id)

    _login(client, "intruder@example.com")
    resp = client.get(f"/api/v1/submissions/dashboard?submission_id={sub_id}")
    assert resp.status_code == 403


def test_session_dashboard_access_requires_login(client, app):
    owner_id = _create_user(app, "needslogin@example.com")
    sub_id = _create_submission(app, "needslogin@example.com", "Needs Login Tool", founder_user_id=owner_id)

    resp = client.get(f"/api/v1/submissions/dashboard?submission_id={sub_id}")
    assert resp.status_code == 401


def test_token_path_still_works_unchanged(client, app):
    sub_id = _create_submission(app, "tokenfounder@example.com", "Token Tool", founder_user_id=None)

    with app.app_context():
        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "tokenfounder@example.com")

    resp = client.get(f"/api/v1/submissions/dashboard?token={token}")
    assert resp.status_code == 200
    assert resp.get_json()["submission"]["name"] == "Token Tool"
