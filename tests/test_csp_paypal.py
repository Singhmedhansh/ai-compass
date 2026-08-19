"""The CSP must not lock PayPal out.

This is a regression guard, not a style check. The policy originally shipped
without any PayPal allowance, which meant every PayPal *button* on the site
failed to load — silently, with nothing in the UI but "could not reach the
SDK". Only the plain hosted-button link kept working, because a link
navigation is not a script load, so the breakage went unnoticed.

Talisman is disabled under TESTING, so these assert against the policy dict
the app builds rather than a live response header.
"""

import re

import pytest


def _csp():
    """The CSP dict create_app() builds, extracted without running Talisman."""
    import inspect

    from app import create_app

    source = inspect.getsource(create_app)
    # The policy is a local inside create_app; rebuild it here from the same
    # literal so the test breaks if a directive is dropped.
    match = re.search(r"PAYPAL_HOSTS = \"([^\"]+)\"", source)
    assert match, "PAYPAL_HOSTS constant is gone from create_app"
    return match.group(1), source


PAYPAL_DIRECTIVES = ("script-src", "connect-src", "frame-src", "form-action")


@pytest.mark.parametrize("directive", PAYPAL_DIRECTIVES)
def test_csp_directive_allows_paypal(directive):
    """Each of these is separately required by PayPal's SDK. Missing any one
    produces the same opaque failure, so they are asserted individually."""
    _hosts, source = _csp()
    pattern = rf'"{directive}":\s*f?"[^"]*\{{PAYPAL_HOSTS\}}[^"]*"'
    assert re.search(pattern, source), (
        f"CSP {directive} no longer includes PAYPAL_HOSTS — PayPal checkout will break"
    )


def test_paypal_hosts_cover_sdk_and_assets():
    hosts, _source = _csp()
    assert "paypal.com" in hosts
    # The SDK pulls images, fonts and iframes from paypalobjects.com.
    assert "paypalobjects.com" in hosts


def test_payment_permission_is_not_disabled():
    """permissions-policy: payment=() switches off the Payment Request API
    that PayPal's checkout depends on."""
    import inspect

    from app import create_app

    source = inspect.getsource(create_app)
    match = re.search(r'"payment":\s*(.+?),\n', source)
    assert match, "payment permissions-policy entry is gone"
    value = match.group(1)
    assert value.strip() not in ('"()"', "'()'"), "payment=() disables PayPal checkout"
    assert "paypal.com" in value


def test_csp_still_locks_down_the_dangerous_directives():
    """Opening things up for PayPal must not have loosened the rest."""
    import inspect

    from app import create_app

    source = inspect.getsource(create_app)
    assert '"object-src": "\'none\'"' in source
    assert '"base-uri": "\'self\'"' in source
    assert '"frame-ancestors": "\'self\'"' in source
    assert '"default-src": "\'self\'"' in source
