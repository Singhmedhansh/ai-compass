
import pytest


# Smoke test that the real React routes all serve (200/302/401). The
# list used to include /settings, /saved-tools, /compare-tools,
# /submit-tool, /updates, /weekly-ai-tools, /report-bug — none of which
# exist in the SPA router. They only passed because the catch-all used
# to serve the SPA shell with status 200 for every URL (a soft-404). The
# soft-404 was fixed in app/routes.py; those routes belong in the 404
# coverage below, not in this smoke list.
@pytest.mark.parametrize("route", [
    "/",
    "/login",
    "/register",
    "/tools",
    "/dashboard",
    "/profile",
    "/compare",
    "/health",
])
def test_route_exists(client, route):
    resp = client.get(route, follow_redirects=True)
    assert resp.status_code in (200, 302, 401)


@pytest.mark.parametrize("route", [
    "/settings",
    "/saved-tools",
    "/compare-tools",
    "/submit-tool",
    "/updates",
    "/weekly-ai-tools",
    "/report-bug",
])
def test_unknown_paths_return_404(client, route):
    resp = client.get(route)
    assert resp.status_code == 404
