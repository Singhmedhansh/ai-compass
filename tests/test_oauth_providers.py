"""GitHub + LinkedIn OAuth wiring.

Regression cover for: GitHub's callback used to redirect via
url_for("main.dashboard"/"auth.login") — server routes that don't
exist in this SPA — so the flow 500'd even when configured; LinkedIn
was a no-op stub. All providers must now (a) register from env, (b)
degrade to a SPA /login?error=… redirect when unconfigured (never
crash), and (c) hand success back to /auth/callback like Google.

Own function-scoped app/DB so request-driven tests can't pollute the
session-scoped conftest fixture (see test_submissions_and_digest.py).
"""
import os
import tempfile

import pytest

from app import create_app, db
from app.models import User


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
        "FRONTEND_URL": "https://ai-compass.in",
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


@pytest.mark.parametrize("path", [
    "/login/github", "/auth/github",
    "/login/linkedin", "/auth/linkedin",
])
def test_unconfigured_provider_redirects_to_spa_not_500(client, path):
    """The old bug: GitHub crashed with a url_for BuildError. Now an
    unconfigured provider must cleanly 302 to the SPA login with an
    error code — never 5xx."""
    resp = client.get(path)
    assert resp.status_code in (302, 303)
    loc = resp.headers["Location"]
    assert "/login?error=" in loc
    assert "not_configured" in loc


def test_oauth_callback_routes_registered(app):
    rules = {r.endpoint for r in app.url_map.iter_rules()}
    assert "oauth.github_callback" in rules
    assert "oauth.linkedin_callback" in rules
    assert "oauth.login_linkedin" in rules


def test_spa_success_redirect_contract(app):
    """Success funnels through /auth/callback with the params the React
    app reads into localStorage, and marks the user onboarded."""
    from app.oauth import _spa_success_redirect

    with app.test_request_context("/login/github/callback"):
        user = User(email="dev@example.com", display_name="Dev",
                    oauth_provider="github", first_login=True)
        db.session.add(user)
        db.session.commit()

        resp = _spa_success_redirect(user, "Dev", "https://avatar.test/x.png")
        assert resp.status_code in (302, 303)
        loc = resp.headers["Location"]
        assert loc.startswith("https://ai-compass.in/auth/callback?")
        assert "email=dev%40example.com" in loc
        assert f"id={user.id}" in loc

        refreshed = db.session.get(User, user.id)
        assert refreshed.first_login is False
        assert refreshed.onboarding_completed is True
