
import pytest
@pytest.mark.parametrize("route", [
    "/",
    "/login",
    "/register",
    "/tools",
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
