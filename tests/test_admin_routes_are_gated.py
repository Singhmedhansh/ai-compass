"""Every admin route must refuse an anonymous caller.

This exists because GET /api/v1/admin/users shipped with no authentication
decorator and no in-body check, and served the id, name, email address and
signup date of all 355 registered accounts to anyone who requested it. The
route looked like its neighbours — they were gated, it was not — so nothing
about reading the file made the omission obvious.

A per-route unit test would not have caught it either, because the problem was
an absent test, not a failing one. This walks the real URL map instead, so a
newly added admin endpoint is covered the moment it is registered, whether or
not anyone remembers to write a test for it.
"""

import pytest

# Routes under /admin that intentionally answer an anonymous caller.
# Keep this list empty unless there is a written reason to add to it.
ANONYMOUS_ADMIN_ROUTES_ALLOWED = set()

# 401 Unauthorized (not signed in) and 403 Forbidden (signed in, not an admin)
# are both correct refusals. 405 means the rule exists but not for this verb.
REFUSAL_CODES = {401, 403, 405}


def _admin_rules(app):
    for rule in app.url_map.iter_rules():
        path = str(rule.rule)
        if "/admin" not in path:
            continue
        if path in ANONYMOUS_ADMIN_ROUTES_ALLOWED:
            continue
        # Routes with URL parameters need a concrete value to be requested.
        # Substituting a placeholder is fine: authorization is checked before
        # the resource is looked up, so a non-existent id still gets refused.
        concrete = path
        for arg in rule.arguments:
            for converter in (f"<int:{arg}>", f"<string:{arg}>", f"<path:{arg}>", f"<{arg}>"):
                concrete = concrete.replace(converter, "1")
        if "<" in concrete:
            continue
        for method in ("GET", "POST", "PUT", "DELETE"):
            if method in rule.methods:
                yield concrete, method


def test_the_url_map_actually_contains_admin_routes(app):
    """Guards the guard: if the scan finds nothing, the test below is vacuous."""
    assert list(_admin_rules(app)), "no admin routes discovered — this test would pass trivially"


def test_no_admin_route_answers_an_anonymous_caller(app, client):
    leaks = []

    for path, method in _admin_rules(app):
        response = client.open(path, method=method)
        if response.status_code not in REFUSAL_CODES:
            leaks.append(f"{method} {path} -> {response.status_code}")

    assert not leaks, (
        "these admin routes responded to an unauthenticated request:\n  "
        + "\n  ".join(sorted(leaks))
    )


@pytest.mark.parametrize("path", ["/api/v1/admin/users", "/api/v1/admin/stats"])
def test_the_two_routes_that_were_actually_exposed_stay_gated(client, path):
    """Named explicitly so a regression names itself in the failure output."""
    response = client.get(path)
    assert response.status_code in REFUSAL_CODES
    assert b"@" not in response.data, "an email address appeared in an unauthenticated response"
