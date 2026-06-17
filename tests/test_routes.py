import pytest


# Routes that the React SPA actually renders (kept in sync with
# frontend/src/App.jsx and _KNOWN_SPA_ROUTES in app/routes.py).
@pytest.mark.parametrize("route", [
    "/",
    "/tools",
    "/ai-tool-finder",
    "/collections",
    "/compare",
    "/login",
    "/register",
    "/dashboard",
    "/profile",
    "/submit",
    "/team",
    "/contact",
    "/privacy",
    "/terms",
    "/best-ai-tools-for-students",
    "/best-free-ai-tools",
    "/best-coding-tools-for-students",
    "/guides/github-student-pack",
    "/health",
])
def test_route_exists(client, route):
    resp = client.get(route, follow_redirects=True)
    assert resp.status_code in (200, 302, 401)


def test_tool_detail_route(client):
    resp = client.get("/tool/1", follow_redirects=True)
    assert resp.status_code in (200, 404, 401)


def test_health_route_returns_json(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.is_json
    payload = resp.get_json()
    assert payload["status"] in {"ok", "degraded"}
    assert "checks" in payload
    assert "database" in payload["checks"]
    assert "tools_cache" in payload["checks"]


# --- 404 / soft-404 fix --------------------------------------------------
# Production used to serve the SPA shell with status 200 for any URL,
# which Google treated as a soft-404. These tests guard the fix.

@pytest.mark.parametrize("route", [
    "/this-page-does-not-exist",
    "/some-non-existent-page",
    "/settings",
    "/saved-tools",
    "/random/nested/garbage",
])
def test_unknown_paths_return_404(client, route):
    resp = client.get(route)
    assert resp.status_code == 404


def test_unknown_tool_slug_returns_404(client):
    resp = client.get("/tools/this-tool-definitely-does-not-exist-xyz")
    assert resp.status_code == 404


def test_unknown_alternatives_slug_returns_404(client):
    resp = client.get("/alternatives/this-tool-definitely-does-not-exist-xyz")
    assert resp.status_code == 404


def test_about_route_returns_200(client):
    resp = client.get("/about")
    assert resp.status_code == 200
    assert b"About Us" in resp.data or b"About AI Compass" in resp.data
