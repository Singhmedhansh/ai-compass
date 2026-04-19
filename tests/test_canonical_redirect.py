from app import create_app


def _build_production_app(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CANONICAL_HOST", "ai-compass.in")
    monkeypatch.setenv("FRONTEND_URL", "https://ai-compass.in")

    app = create_app(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key",
        }
    )
    # Redirect middleware is skipped while TESTING is true.
    app.config["TESTING"] = False
    return app


def test_onrender_host_redirects_to_canonical_domain(monkeypatch):
    app = _build_production_app(monkeypatch)
    client = app.test_client()

    response = client.get(
        "/tools?category=Coding&q=chat",
        base_url="https://ai-compass-1.onrender.com",
        follow_redirects=False,
    )

    assert response.status_code == 308
    assert response.headers["Location"] == "https://ai-compass.in/tools?category=Coding&q=chat"


def test_canonical_host_does_not_redirect(monkeypatch):
    app = _build_production_app(monkeypatch)
    client = app.test_client()

    response = client.get("/", base_url="https://ai-compass.in", follow_redirects=False)

    assert response.status_code == 200