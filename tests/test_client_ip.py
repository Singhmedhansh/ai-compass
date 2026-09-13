"""The client address must not be whatever the client says it is.

Every per-IP rate limit in the app keys on this. The previous implementation
read the FIRST entry of X-Forwarded-For, which is the part of the header the
caller writes — so a single forged header bought a fresh bucket. That was not
a theory: against production, after exhausting the login limit from a real
address, adding `X-Forwarded-For: 203.0.113.1` reset it and the next three
attempts were served.

The other failure mode is the opposite one, and it is just as bad: falling
back to remote_addr behind a proxy gives every visitor on the internet the
same bucket, so one person can lock everyone else out.
"""

import pytest

from app.client_ip import UNKNOWN, client_ip


class FakeRequest:
    def __init__(self, headers=None, remote_addr=None):
        self.headers = headers or {}
        self.remote_addr = remote_addr


def test_a_forged_forwarded_for_does_not_become_the_identity():
    """The regression that was live in production."""
    req = FakeRequest(
        headers={"X-Forwarded-For": "203.0.113.1, 198.51.100.7"},
        remote_addr="10.0.0.1",
    )
    assert client_ip(req) != "203.0.113.1"


def test_cloudflares_header_wins_over_anything_the_caller_sent():
    """CF-Connecting-IP is written by Cloudflare and overwrites a client copy,
    so it is the one value in the request the caller cannot author."""
    req = FakeRequest(
        headers={
            "CF-Connecting-IP": "198.51.100.7",
            "X-Forwarded-For": "203.0.113.1, 203.0.113.2",
        },
        remote_addr="10.0.0.1",
    )
    assert client_ip(req) == "198.51.100.7"


def test_without_cloudflare_the_rightmost_hop_is_used():
    """Proxies append, so the last entry is the one written closest to us."""
    req = FakeRequest(
        headers={"X-Forwarded-For": "203.0.113.1, 198.51.100.7"},
        remote_addr="10.0.0.1",
    )
    assert client_ip(req) == "198.51.100.7"


def test_remote_addr_is_the_last_resort_not_the_first_choice():
    req = FakeRequest(headers={}, remote_addr="198.51.100.7")
    assert client_ip(req) == "198.51.100.7"


def test_a_request_with_nothing_usable_is_named_not_crashed():
    req = FakeRequest(headers={}, remote_addr=None)
    assert client_ip(req) == UNKNOWN


@pytest.mark.parametrize(
    "header",
    [
        "203.0.113.1,",
        ",203.0.113.1",
        "203.0.113.1, ,",
        "  203.0.113.1  ,  198.51.100.7  ",
    ],
)
def test_ragged_header_values_do_not_yield_an_empty_identity(header):
    """An empty string would collapse every such caller into one shared
    bucket, which is the failure this helper exists to avoid."""
    req = FakeRequest(headers={"X-Forwarded-For": header}, remote_addr="10.0.0.1")
    resolved = client_ip(req)
    assert resolved.strip()
    assert resolved != ""


def test_two_different_callers_never_share_an_identity():
    """The shared-bucket failure: if this collapses, one visitor can exhaust
    the limit for everybody."""
    a = FakeRequest(headers={"CF-Connecting-IP": "198.51.100.7"}, remote_addr="10.0.0.1")
    b = FakeRequest(headers={"CF-Connecting-IP": "198.51.100.8"}, remote_addr="10.0.0.1")
    assert client_ip(a) != client_ip(b)
