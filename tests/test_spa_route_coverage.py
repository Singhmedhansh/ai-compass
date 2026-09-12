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


# Routes that legitimately serve the unmodified shell: every one is private
# (auth, dashboard, admin) and carries its own noindex client-side, so a
# server-rendered title would only ever be read by a crawler told to skip it.
_PRIVATE_SPA_ROUTES = {
    "dashboard",
    "dashboard/submission",
    "profile",
    "login",
    "register",
    "admin",
    "auth/callback",
    "forgot-password",
    "reset-password",
    "verify-email-pending",
    "verify-success",
    "growth-hub",
    "account/change-password",
    "clerk-test",
}


def test_every_public_spa_route_has_server_side_meta():
    """A public route with no _ROUTE_META entry inherits the homepage meta.

    Routes render their own <Helmet>/<SEO> once React mounts, so Google
    recovers on re-render — but the social scrapers (Facebook, LinkedIn,
    Slack, X) never run JS. Before this test, /pricing, /submit, /terms,
    /privacy, /refunds, /contact, /support, /team, /model-comparison and
    /stacks all previewed as the homepage when shared, and shipped the
    homepage canonical to any crawler that did not re-render.
    """
    uncovered = sorted(
        route
        for route in _KNOWN_SPA_ROUTES
        if route and route not in _ROUTE_META and route not in _PRIVATE_SPA_ROUTES
    )
    assert not uncovered, (
        "Public SPA routes with no server-side title/description/canonical: "
        f"{uncovered}. Add an entry to _ROUTE_META (keep it in sync with the "
        "page's own <Helmet>/<SEO>), or list it in _PRIVATE_SPA_ROUTES if the "
        "page is genuinely private."
    )


@pytest.mark.parametrize("path,expected_title", [
    ("/pricing", "Pricing"),
    ("/submit", "Submit Your AI Tool"),
    ("/terms", "Terms of Service"),
    ("/privacy", "Privacy Policy"),
    ("/refunds", "Refund"),
    ("/contact", "Contact"),
    ("/support", "Support AI Compass"),
    ("/team", "Built by Medhansh"),
    ("/model-comparison", "LLM API Cost Calculator"),
    ("/stacks", "Community AI Toolkits"),
    ("/trending", "Trending Today"),
])
def test_public_routes_render_their_own_title_and_canonical(client, path, expected_title):
    body = client.get(path).data.decode("utf-8")
    title = re.search(r"<title>(.*?)</title>", body, re.S)
    assert title and expected_title in title.group(1), (
        f"{path} served title {title.group(1) if title else None!r}"
    )
    assert f'<link rel="canonical" href="https://ai-compass.in{path}"' in body


@pytest.mark.parametrize("path", ["/favicon.ico", "/site.webmanifest", "/robots.txt"])
def test_root_level_static_files_are_served(client, path):
    """These are requested by name, so a miss lands in the SPA catch-all.

    /favicon.ico and /site.webmanifest had no file behind them and 404'd
    into the "Page not found" shell.
    """
    assert client.get(path).status_code == 200


@pytest.mark.parametrize("path", ["/", "/tools", "/pricing", "/nope-not-a-page"])
def test_shell_seeds_the_tool_count(client, path):
    """The shell hands the SPA the tool count so it need not fetch it.

    Without this the browser could not ask for /api/v1/stats until the JS
    bundle had downloaded, parsed and mounted React — a whole extra round
    trip to a single-region origin for one integer.
    """
    body = client.get(path).data.decode("utf-8")
    m = re.search(r"window\.__AIC_BOOT__=(\{.*?\});", body)
    assert m, f"{path} served no boot state"
    import json as _json
    assert isinstance(_json.loads(m.group(1))["total_tools"], (int, type(None)))


def test_boot_state_is_nonced_like_every_other_inline_script(client):
    """CSP uses strict-dynamic, under which a nonce-less inline script is
    blocked outright — the seed would silently never run."""
    body = client.get("/").data.decode("utf-8")
    seed = re.search(r"<script[^>]*>window\.__AIC_BOOT__", body)
    assert seed, "boot state script not found"
    assert "nonce=" in seed.group(0), seed.group(0)
