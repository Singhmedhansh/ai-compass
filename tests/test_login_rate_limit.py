"""The login brake has to actually stop repeated guessing.

Before this, /api/v1/auth/login had no rate limit, no lockout and no
failed-attempt counter, while GET /api/v1/admin/users was handing out every
registered email address to anonymous callers. Together those are not a
brute-force risk in the abstract sense — they are a credential-stuffing run
against a known list of 355 valid usernames.

Two buckets are tested separately because they defend different attacks:
per-IP stops one machine working through a password list, and per-account
stops a distributed attempt against one known mailbox from many addresses.
"""

import pytest

from app import bcrypt, db
from app.models import User

LOGIN = "/api/v1/auth/login"
LIMIT = 10  # keep in sync with auth_login() in app/api_routes.py


@pytest.fixture
def victim(app):
    """A target account with a known-good password.

    Reused rather than recreated: the `app` fixture is session-scoped, so the
    same database survives every test in the run and a plain insert collides
    on users.email the second time this fixture is requested.
    """
    email = "brute-target@example.com"
    user = User.query.filter_by(email=email).first()
    if user is None:
        user = User(
            email=email,
            password_hash=bcrypt.generate_password_hash("the-real-password").decode("utf-8"),
        )
        db.session.add(user)
        db.session.commit()
    return email


def _attempt(client, email, password="wrong-password", ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return client.post(LOGIN, json={"email": email, "password": password}, headers=headers)


def test_repeated_wrong_passwords_are_eventually_refused(client, victim):
    statuses = [_attempt(client, victim).status_code for _ in range(LIMIT + 5)]

    assert 429 in statuses, (
        "login accepted more than "
        f"{LIMIT} consecutive failures without throttling: {statuses}"
    )
    # Everything before the brake engages should be an ordinary auth failure,
    # not a server error.
    assert set(statuses) <= {401, 429}, statuses


def test_the_brake_does_not_leak_whether_the_account_exists(client, victim):
    """A throttled known account and a throttled unknown one look the same."""
    for _ in range(LIMIT + 2):
        _attempt(client, victim)
    known = _attempt(client, victim)

    for _ in range(LIMIT + 2):
        _attempt(client, "no-such-account@example.com")
    unknown = _attempt(client, "no-such-account@example.com")

    assert known.status_code == unknown.status_code == 429
    assert known.get_data(as_text=True) == unknown.get_data(as_text=True)


def test_a_correct_password_still_works_under_the_limit(client, victim):
    """The brake must not lock out the legitimate user on their first try."""
    resp = _attempt(client, victim, password="the-real-password")
    assert resp.status_code == 200
    assert resp.get_json()["email"] == victim


def test_one_account_is_protected_across_rotating_source_addresses(client, victim):
    """The per-account bucket, isolated from the per-IP one.

    An attacker with a proxy pool gets a fresh per-IP bucket for every
    request, so if the account bucket did not exist the brake would be
    trivially bypassed. Each attempt here comes from a different address.
    """
    statuses = [
        _attempt(client, victim, ip=f"203.0.113.{n}").status_code
        for n in range(1, LIMIT + 6)
    ]

    assert 429 in statuses, (
        "rotating the source address defeated the brake entirely — "
        f"the per-account bucket is not working: {statuses}"
    )
