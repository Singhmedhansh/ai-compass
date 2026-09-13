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


def test_spa_success_redirect_carries_no_personal_data(app):
    """Success funnels through /auth/callback carrying nothing personal.

    This test used to assert the opposite — that the email address and user
    id appear in the redirect URL, which is what the React app read into
    localStorage. That contract was the bug: /auth/callback is an ordinary
    pageview, so PostHog (capture_pageview) and GA4 recorded the full URL,
    writing every OAuth user's email address into two third-party analytics
    products, plus browser history and any Referer header.

    login_user() has already set the session cookie by this point, so the
    callback page reads the account from GET /api/v1/auth/me instead. Only
    onboarding_completed stays in the URL: it steers the redirect and is not
    personal data.
    """
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

        # The whole point of the change: no identity in the query string.
        assert "dev@example.com" not in loc
        assert "email=dev%40example.com" not in loc
        assert "email=" not in loc
        assert "Dev" not in loc
        assert "avatar.test" not in loc

        assert "onboarding_completed=false" in loc

        refreshed = db.session.get(User, user.id)
        assert refreshed.first_login is False
        assert refreshed.onboarding_completed is False


def test_oauth_signup_is_verified(app):
    """Regression: OAuth accounts were created with the model default
    is_verified=False and nothing ever flipped it. They have no password and
    are never sent a verification mail, but AnimatedRoutes (frontend/src/App.jsx)
    bounces every unverified user off /profile, /submit and /admin to
    /verify-email-pending — so signing in with Google dead-ended one page load
    later, once the Navbar's /api/v1/auth/me refresh merged the server's
    `false` over AuthCallbackPage's optimistic `true`."""
    from app.oauth import _get_or_create_oauth_user

    with app.test_request_context("/auth/google/callback"):
        user = _get_or_create_oauth_user("newbie@example.com", "Newbie", "google")

    assert user.is_verified is True


def test_oauth_login_verifies_an_existing_unverified_account(app):
    """The provider has just proved control of the mailbox, so an account
    stranded at is_verified=False — including every one created before this
    fix — heals on its next OAuth sign-in rather than needing a migration."""
    from app.oauth import _get_or_create_oauth_user

    with app.app_context():
        db.session.add(User(email="stranded@example.com", display_name="Stranded", is_verified=False))
        db.session.commit()

    with app.test_request_context("/auth/google/callback"):
        user = _get_or_create_oauth_user("stranded@example.com", "Stranded", "google")

    assert user.is_verified is True
    assert user.oauth_provider == "google"
