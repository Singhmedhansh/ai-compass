"""/api/v1/community/sponsors must degrade, not 500.

Production returned a 500 here for weeks. The handler *looked* safe — it had
an except that returned an empty payload — but the fallback called
sponsorship.inventory() outside any guard. On Postgres the failed statement
had already aborted the transaction, so the fallback query raised
PendingRollbackError and the handled failure became an unhandled one, taking
/community and the /sponsor sales page with it.
"""
import pytest

from app import sponsorship


@pytest.fixture
def broken_units(monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("simulated UndefinedColumn on submissions")
    monkeypatch.setattr(sponsorship, "sponsored_units", boom)


def test_sponsors_returns_200_when_units_fail(client, broken_units):
    resp = client.get("/api/v1/community/sponsors")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["hero"] == [] and body["board"] == [] and body["rail"] == []


def test_sponsors_returns_200_when_the_fallback_also_fails(client, broken_units, monkeypatch):
    """The exact production shape: the fallback query fails too."""
    def boom(*a, **kw):
        raise RuntimeError("session is in a failed transaction")
    monkeypatch.setattr(sponsorship, "inventory", boom)

    resp = client.get("/api/v1/community/sponsors")
    assert resp.status_code == 200
    assert resp.get_json()["inventory"] == []


def test_inventory_endpoint_degrades_too(client, monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("db down")
    monkeypatch.setattr(sponsorship, "inventory", boom)

    resp = client.get("/api/v1/community/sponsors/inventory")
    assert resp.status_code == 200
    assert resp.get_json()["inventory"] == []


def test_paid_slots_survive_a_broken_complimentary_lookup(app, monkeypatch):
    """Perk lookup and rented inventory read different tables. A failure in
    the perk path must not blank the placements people paid for."""
    def boom(*a, **kw):
        raise RuntimeError("simulated UndefinedColumn on submissions")
    monkeypatch.setattr(sponsorship, "_complimentary_rail_units", boom)

    with app.app_context():
        units = sponsorship.sponsored_units()

    assert set(units) == {"hero", "board", "rail"}
