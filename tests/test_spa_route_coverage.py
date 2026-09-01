"""The server's known-SPA-route set must not drift from App.jsx.

Five live routes — /growth-hub, /account/change-password, /u/<name>,
/stacks/<id>, /shared-toolkit/<id> — shipped with a <Route> in App.jsx and no
entry here, so every one of them answered 404 with a "Page not found" title
before React mounted over it. Shared-toolkit links were the worst of it: the
syllabus parser hands that URL to the user to send to someone else.

This test reads App.jsx directly so the next added route fails here rather
than in production.
"""
import re
from pathlib import Path

import pytest

from app.routes import _KNOWN_SPA_PREFIXES, _KNOWN_SPA_ROUTES, _ROUTE_META

APP_JSX = Path(__file__).resolve().parents[1] / "frontend" / "src" / "App.jsx"

# Handled by their own branch in _meta_for_request_path (they validate the
# slug and emit bespoke meta), so they are legitimately absent from the set.
_SERVED_ELSEWHERE = {"tools/:slug", "alternatives/:slug", "compare/:pair",
                     "collections/:slug", "community/:id", "*"}


def _declared_routes():
    if not APP_JSX.exists():  # frontend not checked out
        pytest.skip("frontend/src/App.jsx not available")
    return {
        m.rstrip("/").lstrip("/")
        for m in re.findall(r'<Route\s+path="([^"]+)"', APP_JSX.read_text(encoding="utf-8"))
    }


def test_every_react_route_is_known_to_the_server():
    missing = []
    for route in sorted(_declared_routes() - _SERVED_ELSEWHERE):
        if route in _KNOWN_SPA_ROUTES or route in _ROUTE_META:
            continue
        # A dynamic route is covered if its static prefix is registered.
        if ":" in route and any(route.startswith(p) for p in _KNOWN_SPA_PREFIXES):
            continue
        missing.append(route)
    assert not missing, (
        "App.jsx declares routes the Flask catch-all will 404: "
        f"{missing}. Add them to _KNOWN_SPA_ROUTES / _KNOWN_SPA_PREFIXES."
    )


@pytest.mark.parametrize("path", [
    "/growth-hub",
    "/account/change-password",
    "/u/someone",
    "/stacks/1",
    "/shared-toolkit/abc123",
])
def test_known_spa_routes_serve_200(client, path):
    assert client.get(path).status_code == 200


def test_unknown_route_still_404s():
    """The fix must not regress the soft-404 behaviour it sits next to."""
    from app.routes import _KNOWN_SPA_ROUTES as known
    assert "definitely-not-a-page" not in known


@pytest.mark.parametrize("path", ["/definitely-not-a-page", "/u/a/b/c"])
def test_genuine_404s_are_still_404(client, path):
    assert client.get(path).status_code == 404
