from app import create_app
from app.oauth import _frontend_base_url, _google_redirect_uri


def test_oauth_urls_use_canonical_host_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CANONICAL_HOST", "ai-compass.in")
    monkeypatch.setenv("FRONTEND_URL", "https://old-host.onrender.com")
    monkeypatch.delenv("GOOGLE_REDIRECT_URI_LOCAL", raising=False)

    app = create_app(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key",
        }
    )

    with app.test_request_context("/auth/google", base_url="https://ai-compass.in"):
        assert _frontend_base_url() == "https://ai-compass.in"
        assert _google_redirect_uri() == "https://ai-compass.in/auth/google/callback"


def test_oauth_urls_use_local_defaults_in_development(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("CANONICAL_HOST", raising=False)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")
    monkeypatch.delenv("GOOGLE_REDIRECT_URI_LOCAL", raising=False)

    app = create_app(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key",
        }
    )

    with app.test_request_context("/auth/google", base_url="http://localhost:5000"):
        assert _frontend_base_url() == "http://localhost:5173"
        redirect_uri = _google_redirect_uri()
        assert redirect_uri.startswith("http://")
        assert redirect_uri.endswith("/auth/google/callback")

def _prod_app(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CANONICAL_HOST", "ai-compass.in")
    monkeypatch.setenv("FRONTEND_URL", "https://ai-compass.in")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.delenv("GOOGLE_REDIRECT_URI_LOCAL", raising=False)
    return create_app(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key",
        }
    )


def test_oauth_start_on_www_redirects_to_canonical_host_before_saving_state(monkeypatch):
    """Regression: www.ai-compass.in serves the app (enforce_canonical_host
    exempts it), but every provider callback URI is built against the apex.
    Authlib's `state` lives in a host-only session cookie, so a login begun on
    www came back to a host that had never seen it — "mismatching_state" for
    every www visitor. The provider entry points must bounce to the canonical
    host BEFORE authorize_redirect() writes any state."""
    from app.oauth import _canonical_host_redirect

    app = _prod_app(monkeypatch)

    for path in ("/auth/google", "/login/github", "/login/linkedin"):
        with app.test_request_context(path, base_url="https://www.ai-compass.in"):
            response = _canonical_host_redirect()
            assert response is not None, path
            assert response.headers["Location"] == f"https://ai-compass.in{path}"

    # …and is a no-op once already on the canonical host, so there is no loop.
    with app.test_request_context("/auth/google", base_url="https://ai-compass.in"):
        assert _canonical_host_redirect() is None


def test_google_login_on_www_never_reaches_google(monkeypatch):
    """End to end through the real view: the browser is sent to the apex, not
    to accounts.google.com, so the state cookie is written on the host that
    will read it back."""
    app = _prod_app(monkeypatch)
    client = app.test_client()

    response = client.get(
        "/auth/google",
        base_url="https://www.ai-compass.in",
        follow_redirects=False,
    )

    assert response.status_code in (301, 302, 307, 308)
    assert response.headers["Location"] == "https://ai-compass.in/auth/google"
    assert "accounts.google.com" not in response.headers["Location"]
