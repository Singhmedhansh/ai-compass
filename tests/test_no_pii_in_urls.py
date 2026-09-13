"""No email address may travel in a URL the browser visits.

Any page the browser loads is an ordinary pageview: PostHog records the full
URL, GA4 records the full URL, the browser keeps it in history, and it can
leak onward in a Referer header. So an address in a query string is an address
handed to two analytics vendors and left on the user's machine.

Two links did this:

  /auth/callback?email=...&name=...&id=...   every OAuth sign-in
  /register?email=...                        the submission-confirmation email

Both now carry either nothing personal or a signed token that is exchanged for
the address over the API.

This file is the regression net for the whole class, not for the two instances
— it asserts the property ("no address in the URL") rather than the specific
spelling of the fix, so a third link that reintroduces the habit is caught too.
"""

import pytest

from app import db
from app.email_utils import make_register_prefill_token, read_register_prefill_token
from app.models import User

ADDRESS = "founder@example.com"


class TestRegisterPrefillToken:
    def test_the_token_does_not_contain_the_address(self):
        """A token that merely encodes the address is not a fix — itsdangerous
        payloads are signed, not encrypted, so anything readable in the URL is
        still readable by anyone who sees the URL."""
        token = make_register_prefill_token(ADDRESS)

        assert ADDRESS not in token
        assert "founder" not in token.lower()
        assert "example.com" not in token.lower()

    def test_a_valid_token_resolves_to_the_address(self):
        assert read_register_prefill_token(make_register_prefill_token(ADDRESS)) == ADDRESS

    def test_the_address_is_normalised(self):
        assert read_register_prefill_token(make_register_prefill_token("  Founder@Example.COM  ")) == ADDRESS

    @pytest.mark.parametrize(
        "bad",
        ["", "not-a-token", "a.b.c", "eyJlbWFpbCI6ICJmb3VuZGVyQGV4YW1wbGUuY29tIn0"],
    )
    def test_a_forged_or_empty_token_yields_nothing(self, bad):
        """The last case is the interesting one: plain base64 of a plausible
        payload, i.e. what someone would try after guessing the shape."""
        assert read_register_prefill_token(bad) is None


class TestRegisterPrefillEndpoint:
    def test_a_valid_token_is_exchanged_for_the_address(self, client):
        token = make_register_prefill_token(ADDRESS)
        resp = client.get(f"/api/v1/auth/register-prefill?rt={token}")

        assert resp.status_code == 200
        assert resp.get_json()["email"] == ADDRESS

    def test_a_forged_token_returns_no_address_and_no_error_detail(self, client):
        resp = client.get("/api/v1/auth/register-prefill?rt=forged")

        assert resp.status_code == 200
        assert resp.get_json()["email"] is None

    def test_a_missing_token_is_not_a_crash(self, client):
        resp = client.get("/api/v1/auth/register-prefill")

        assert resp.status_code == 200
        assert resp.get_json()["email"] is None


class TestOAuthRedirect:
    def test_the_callback_url_carries_no_identity(self, app):
        """The OAuth half of the same class. Asserted here as well as in
        test_oauth_providers.py so the property is stated in one place
        alongside the other URL that leaked."""
        from app.oauth import _spa_success_redirect

        with app.test_request_context("/login/github/callback"):
            user = User(
                email="oauth-url-probe@example.com",
                display_name="Probe Person",
                oauth_provider="github",
            )
            db.session.add(user)
            db.session.commit()

            location = _spa_success_redirect(
                user, "Probe Person", "https://avatar.test/x.png"
            ).headers["Location"]

        assert "oauth-url-probe@example.com" not in location
        assert "oauth-url-probe%40example.com" not in location
        assert "email=" not in location
        assert "Probe" not in location
        assert "avatar.test" not in location
