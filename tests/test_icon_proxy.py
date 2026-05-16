"""First-party favicon proxy (/icon/<domain>).

Logos used to load directly from icons.duckduckgo.com in the browser;
privacy blockers (Brave Shields, uBlock) stripped that third-party
request, so blocked users saw letter tiles site-wide. The proxy makes
it a same-origin, cached request. These tests cover input hardening
and caching without depending on live network (fetch is monkeypatched).
"""
import app.routes as routes


def test_icon_rejects_junk_and_traversal(client):
    for bad in ("not-a-domain", "../etc/passwd", "javascript:alert(1)", "a"):
        resp = client.get(f"/icon/{bad}")
        assert resp.status_code == 404, bad


def test_icon_serves_and_caches(client, monkeypatch):
    calls = []

    def fake_fetch(domain):
        calls.append(domain)
        return b"\x00\x00\x01\x00" + b"fake-icon-bytes" * 8

    monkeypatch.setattr(routes, "_fetch_icon_bytes", fake_fetch)
    routes._ICON_CACHE.pop("example.com", None)
    routes._ICON_NEG_CACHE.discard("example.com")

    r1 = client.get("/icon/example.com")
    assert r1.status_code == 200
    assert r1.mimetype == "image/x-icon"
    assert "max-age=604800" in r1.headers["Cache-Control"]
    assert len(r1.data) > 70

    # Second hit must be served from cache (no second upstream fetch).
    r2 = client.get("/icon/example.com")
    assert r2.status_code == 200
    assert calls == ["example.com"]


def test_icon_negative_cached(client, monkeypatch):
    calls = []

    def fail_fetch(domain):
        calls.append(domain)
        return None

    monkeypatch.setattr(routes, "_fetch_icon_bytes", fail_fetch)
    routes._ICON_CACHE.pop("nope.com", None)
    routes._ICON_NEG_CACHE.discard("nope.com")

    assert client.get("/icon/nope.com").status_code == 404
    assert client.get("/icon/nope.com").status_code == 404
    # Negative-cached: upstream tried only once.
    assert calls == ["nope.com"]
