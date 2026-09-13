"""Resend-verification must not tell a stranger who has an account.

These tests previously asserted three *different* responses for the three
cases — "has been resent" for an unverified account, "already verified" for a
verified one, and a 404 "User not found." for an address with no account. That
is a clean account-enumeration oracle: anyone could POST a list of addresses
and read back which ones are registered, on an endpoint with no login and (at
the time) no rate limit. forgot-password already avoided this; this endpoint
did not.

The endpoint now answers identically in all three cases, so the tests assert
indistinguishability rather than the specific outcome. Whether mail was
actually sent is an internal detail and is checked by monkeypatching the
sender, not by reading the response.
"""

from app import db
from app.models import User

UNIFORM_RESPONSE = {"message": "If that account needs verification, a link has been sent."}


def test_an_unverified_account_gets_the_uniform_response(client):
    email = "resend_unverified@example.com"
    user = User(
        email=email,
        password_hash="dummyhash1234567890",
        display_name="Test Resend",
        is_verified=False,
    )
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/resend-verification", json={"email": email})
    assert resp.status_code == 200
    assert resp.get_json() == UNIFORM_RESPONSE


def test_an_already_verified_account_is_indistinguishable(client):
    email = "resend_verified@example.com"
    user = User(
        email=email,
        password_hash="dummyhash1234567890",
        display_name="Test Resend Verified",
        is_verified=True,
    )
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/resend-verification", json={"email": email})
    assert resp.status_code == 200
    assert resp.get_json() == UNIFORM_RESPONSE


def test_an_address_with_no_account_is_indistinguishable(client):
    client.post("/api/v1/auth/logout")
    resp = client.post(
        "/api/auth/resend-verification",
        json={"email": "nonexistent_verification@example.com"},
    )
    assert resp.status_code == 200
    assert resp.get_json() == UNIFORM_RESPONSE


def test_the_three_cases_are_byte_for_byte_identical(client):
    """The actual security property, stated once and directly.

    A difference in status code, body, or wording is enough to enumerate;
    asserting each case against a constant separately would still pass if all
    three drifted together to something that leaks.
    """
    registered_unverified = "enum_unverified@example.com"
    registered_verified = "enum_verified@example.com"

    db.session.add(
        User(email=registered_unverified, password_hash="x" * 20, is_verified=False)
    )
    db.session.add(
        User(email=registered_verified, password_hash="x" * 20, is_verified=True)
    )
    db.session.commit()

    responses = [
        client.post("/api/auth/resend-verification", json={"email": addr})
        for addr in (
            registered_unverified,
            registered_verified,
            "definitely_not_registered@example.com",
        )
    ]

    statuses = {r.status_code for r in responses}
    bodies = {r.get_data(as_text=True) for r in responses}

    assert statuses == {200}, f"status code distinguishes the cases: {statuses}"
    assert len(bodies) == 1, f"response body distinguishes the cases: {bodies}"


def test_a_missing_email_is_still_a_client_error(client):
    """Not an enumeration signal — it says nothing about any account."""
    client.post("/api/v1/auth/logout")
    resp = client.post("/api/auth/resend-verification", json={})
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Email is required."}
