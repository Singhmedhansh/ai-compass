"""The homepage growth section used to render hand-typed numbers that froze at
whatever PostHog said the day they were copied. These pin the read path that
replaced them."""

import json

import pytest

from app import platform_stats


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Never touch the real app/platform_stats_cache.json from a test."""
    monkeypatch.setattr(
        platform_stats, "CACHE_FILE", str(tmp_path / "platform_stats_cache.json")
    )
    monkeypatch.delenv("POSTHOG_PERSONAL_API_KEY", raising=False)
    monkeypatch.delenv("POSTHOG_PROJECT_ID", raising=False)
    monkeypatch.setattr(platform_stats, "_refreshing", False)


@pytest.fixture
def refresh_inline(monkeypatch):
    """Run the background refresh synchronously.

    get_platform_stats never fetches on the request thread any more, so a test
    that wants live values has to let the refresh land first.
    """
    monkeypatch.setattr(
        platform_stats, "_start_refresh", platform_stats._refresh_in_background
    )


def _fake_posthog(monkeypatch, totals, series, paths, monthly=None, daily=None):
    """Stub _run_query, dispatching on which of the five queries came in."""
    def fake(hogql, key, project_id, timeout=10):
        if "toStartOfMonth(timestamp) AS month" in hogql:
            return series
        if "$pathname" in hogql:
            return paths
        if "toDate(timestamp) AS day" in hogql:
            return daily if daily is not None else []
        if "INTERVAL 30 DAY" in hogql:
            return monthly if monthly is not None else []
        return totals

    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "12345")
    monkeypatch.setattr(platform_stats, "_run_query", fake)


def test_unconfigured_falls_back_instead_of_erroring(client):
    """No key on the box (local dev) must still render the section."""
    stats = platform_stats.get_platform_stats()
    assert stats["source"] == "fallback"
    assert stats["totals"]["visitors"] > 0


def test_live_values_replace_the_snapshot(monkeypatch, refresh_inline):
    _fake_posthog(
        monkeypatch,
        totals=[[10300, 14100, 11000]],
        series=[["2026-08-01T00:00:00Z", 5100], ["2026-09-01T00:00:00Z", 2000]],
        paths=[["/", 1919, 2257], ["/tools", 350, 422]],
        monthly=[[4200]],
        daily=[["2026-09-08", 200], ["2026-09-09", 220], ["2026-09-10", 240]],
    )
    platform_stats.get_platform_stats()   # cold: serves the snapshot, refreshes
    stats = platform_stats.get_platform_stats()  # now reads the warm cache

    assert stats["source"] == "posthog"
    assert stats["totals"] == {
        "visitors": 10300,
        "views": 14100,
        "sessions": 11000,
        # A 30-day unique count is its own query, NOT the sum of the daily
        # uniques (4200 != 660) — one person over three days is 1 monthly
        # visitor but 3 daily ones.
        "monthly_visitors": 4200,
        "avg_daily_visitors": 220,
    }
    assert [p["label"] for p in stats["series"]] == ["August", "September"]
    assert stats["paths"][0] == {"path": "/", "visitors": 1919, "views": 2257}


def test_second_call_is_served_from_cache(monkeypatch):
    calls = []

    def counting(hogql, key, project_id, timeout=10):
        calls.append(hogql)
        if "toStartOfMonth(timestamp) AS month" in hogql:
            return [["2026-09-01T00:00:00Z", 7]]
        if "$pathname" in hogql:
            return [["/", 7, 9]]
        if "toDate(timestamp) AS day" in hogql:
            return [["2026-09-10", 7]]
        if "INTERVAL 30 DAY" in hogql:
            return [[7]]
        return [[7, 9, 8]]

    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "12345")
    monkeypatch.setattr(platform_stats, "_run_query", counting)
    monkeypatch.setattr(
        platform_stats, "_start_refresh", platform_stats._refresh_in_background
    )

    platform_stats.get_platform_stats()  # cold: snapshot + one refresh
    platform_stats.get_platform_stats()
    platform_stats.get_platform_stats()

    # Five queries for the single refresh, none for the calls that followed.
    assert len(calls) == 5


def test_stale_cache_beats_nothing_when_posthog_is_down(monkeypatch):
    """A PostHog outage must not blank the homepage or show the 2026 snapshot."""
    with open(platform_stats.CACHE_FILE, "w") as f:
        json.dump(
            {
                "last_fetched": 0,  # long expired
                "stats": {
                    "totals": {"visitors": 999, "views": 1, "sessions": 1},
                    "series": [],
                    "paths": [],
                    "source": "posthog",
                },
            },
            f,
        )

    def boom(hogql, key, project_id, timeout=10):
        raise RuntimeError("posthog unreachable")

    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "12345")
    monkeypatch.setattr(platform_stats, "_run_query", boom)

    assert platform_stats.get_platform_stats()["totals"]["visitors"] == 999


def test_endpoint_is_public(client, monkeypatch):
    """The section renders for logged-out visitors, so no auth on the route."""
    response = client.get("/api/v1/platform-stats")
    assert response.status_code == 200
    body = response.get_json()
    assert "totals" in body and "series" in body and "paths" in body


def test_expired_cache_is_served_stale_while_it_refreshes(monkeypatch):
    """The visitor who happens to arrive after the TTL must not pay for three
    sequential HogQL queries; they get yesterday's numbers immediately."""
    with open(platform_stats.CACHE_FILE, "w") as f:
        json.dump(
            {
                "last_fetched": 0,  # long expired
                "stats": {
                    "totals": {"visitors": 111, "views": 1, "sessions": 1},
                    "series": [],
                    "paths": [],
                    "source": "posthog",
                },
            },
            f,
        )

    started = []
    monkeypatch.setattr(platform_stats, "_start_refresh", lambda: started.append(1))
    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "12345")

    stats = platform_stats.get_platform_stats()

    assert stats["totals"]["visitors"] == 111  # stale value, served at once
    assert started == [1]  # and a refresh was kicked off


def test_avg_daily_ignores_days_posthog_has_no_data_for(monkeypatch, refresh_inline):
    """The average is over days that actually happened, not a hardcoded 30.

    Dividing a 12-day-old project's traffic by 30 would halve its average for
    no reason, so the mean is taken over the returned buckets only.
    """
    _fake_posthog(
        monkeypatch,
        totals=[[100, 200, 150]],
        series=[],
        paths=[],
        monthly=[[900]],
        daily=[["2026-09-09", 300], ["2026-09-10", 100]],
    )
    platform_stats.get_platform_stats()
    stats = platform_stats.get_platform_stats()

    assert stats["totals"]["avg_daily_visitors"] == 200  # (300+100)/2, not /30


def test_missing_site_counts_are_omitted_not_zeroed(monkeypatch):
    """A DB hiccup must not animate a real 305-member count down to zero.

    The homepage drops any tile whose key is absent; a 0 would render as a
    confident, wrong claim.
    """
    monkeypatch.setattr(
        platform_stats, "_site_counts_cache", {"at": 0.0, "value": None}
    )

    monkeypatch.setattr(platform_stats, "_read_site_counts", lambda: {})

    assert platform_stats.get_site_counts() == {}


def test_registered_users_match_the_admin_panel(client, monkeypatch):
    """The public trust bar and /admin/stats must never quote two different
    numbers, so both count the users table unfiltered."""
    from app.models import User

    monkeypatch.setattr(
        platform_stats, "_site_counts_cache", {"at": 0.0, "value": None}
    )

    counts = platform_stats._read_site_counts()
    assert counts["registered_users"] == User.query.count()


def test_endpoint_merges_site_counts_into_totals(client, monkeypatch):
    """One fetch feeds the whole trust bar: PostHog audience numbers plus our
    own registered-user and live-tool counts."""
    monkeypatch.setattr(
        platform_stats,
        "get_site_counts",
        lambda: {"registered_users": 305, "total_tools": 513},
    )

    body = client.get("/api/v1/platform-stats").get_json()

    assert body["totals"]["registered_users"] == 305
    assert body["totals"]["total_tools"] == 513
    # The PostHog half must survive the merge.
    assert "visitors" in body["totals"]


def test_cold_boot_never_queries_posthog_on_the_request_thread(monkeypatch):
    """Render's disk is ephemeral, so EVERY deploy boots with no cache file.

    Fetching inline there made the first visitor after a deploy wait on five
    sequential HogQL queries, on a 1-worker instance that was still warming
    up. Render reports a cold container answering that slowly as "No open HTTP
    ports detected" even though gunicorn bound the socket immediately. The
    request thread must hand back the snapshot and let the refresh happen
    behind it.
    """
    calls = []
    monkeypatch.setattr(
        platform_stats,
        "_run_query",
        lambda *a, **k: calls.append(1) or [[1, 1, 1]],
    )
    started = []
    monkeypatch.setattr(platform_stats, "_start_refresh", lambda: started.append(1))
    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "12345")

    stats = platform_stats.get_platform_stats()

    assert calls == []            # nothing blocked the request
    assert started == [1]         # but the refresh was kicked off
    assert stats["totals"]["visitors"] > 0  # and the section still renders
