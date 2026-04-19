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