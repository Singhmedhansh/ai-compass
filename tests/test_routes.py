import pytest

@pytest.mark.parametrize("route", [
    "/",
    "/tools",
    "/login",
    "/register",
    "/dashboard",
    "/profile",
    "/settings",
    "/saved-tools",
    "/compare",
    "/compare-tools",
    "/submit-tool",
    "/updates",
    "/weekly-ai-tools",
    "/report-bug",
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
