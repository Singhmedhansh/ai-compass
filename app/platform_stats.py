"""Live platform metrics for the public "Verification and platform growth" section.

The numbers on the homepage used to be hand-typed literals inside
StatsShowcase.jsx, so they froze at whatever the PostHog dashboard said on the
day someone copied them. This module reads them back out of PostHog instead,
via the HogQL query API.

PostHog is queried at most once every CACHE_DURATION seconds and the result is
kept in a JSON file next to rates_cache.json (see app/currency.py, whose
fetch/cache/stale-fallback shape this mirrors). Render's disk is ephemeral, so
a cold boot simply refetches; if PostHog is unreachable and no cache exists we
fall back to the last hand-recorded snapshot rather than rendering an empty
section.
"""

import json
import os
import threading
import time

import requests

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'platform_stats_cache.json')
CACHE_DURATION = 86400  # 24 hours in seconds

# PostHog's app host, NOT the ingest host. Reads go to us.posthog.com; the
# us.i.posthog.com host in routes.py is the write/ingest endpoint.
POSTHOG_QUERY_HOST = os.environ.get('POSTHOG_QUERY_HOST', 'https://us.posthog.com').rstrip('/')

# Months of history to draw in the "Monthly Unique Visitors" chart.
SERIES_MONTHS = 6
# How far back the "Most Visited Path Details" table looks.
TOP_PATHS_DAYS = 90
TOP_PATHS_LIMIT = 5

# Window behind the "monthly visitors" and "avg daily readers" headline
# figures. A rolling 30 days rather than a calendar month, so the number never
# collapses on the 1st and then slowly climbs back.
ROLLING_DAYS = 30

# Last manually recorded snapshot (late August 2026). Only used when PostHog
# has never been reached and no cache file exists.
FALLBACK_STATS = {
    "totals": {
        "visitors": 7120,
        "views": 9520,
        "sessions": 7560,
        "monthly_visitors": 3822,
        "avg_daily_visitors": 230,
    },
    "series": [
        {"label": "May", "visitors": 300},
        {"label": "June", "visitors": 1000},
        {"label": "July", "visitors": 2000},
        {"label": "August", "visitors": 3822},
    ],
    "paths": [
        {"path": "/", "visitors": 1919, "views": 2257},
        {"path": "/alternatives/chatgpt", "visitors": 1043, "views": 1095},
        {"path": "/ai-tool-finder", "visitors": 743, "views": 1108},
        {"path": "/best-free-ai-tools", "visitors": 401, "views": 438},
        {"path": "/tools", "visitors": 350, "views": 422},
    ],
    "source": "fallback",
}

_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# PostHog's own "Filter test accounts" toggle is a project setting applied in
# the UI; the query API does not inherit it. We approximate it by dropping
# events flagged as internal/test users, which is what that filter does for us.
_NOT_TEST_USER = "AND coalesce(properties.$is_internal_or_test_user, false) = false"

TOTALS_QUERY = f"""
SELECT uniq(person_id) AS visitors,
       count() AS views,
       uniq(properties.$session_id) AS sessions
FROM events
WHERE event = '$pageview' {_NOT_TEST_USER}
"""

SERIES_QUERY = f"""
SELECT toStartOfMonth(timestamp) AS month,
       uniq(person_id) AS visitors
FROM events
WHERE event = '$pageview' {_NOT_TEST_USER}
  AND timestamp >= toStartOfMonth(now() - INTERVAL {SERIES_MONTHS} MONTH)
GROUP BY month
ORDER BY month
"""

# Rolling-window headline numbers. Kept as two queries because a 30-day unique
# count is not the sum (or the average) of the daily unique counts — the same
# person visiting on three days is one monthly visitor but three daily ones.
MONTHLY_QUERY = f"""
SELECT uniq(person_id) AS visitors
FROM events
WHERE event = '$pageview' {_NOT_TEST_USER}
  AND timestamp >= now() - INTERVAL {ROLLING_DAYS} DAY
"""

DAILY_QUERY = f"""
SELECT toDate(timestamp) AS day,
       uniq(person_id) AS visitors
FROM events
WHERE event = '$pageview' {_NOT_TEST_USER}
  AND timestamp >= now() - INTERVAL {ROLLING_DAYS} DAY
GROUP BY day
ORDER BY day
"""

PATHS_QUERY = f"""
SELECT properties.$pathname AS path,
       uniq(person_id) AS visitors,
       count() AS views
FROM events
WHERE event = '$pageview' {_NOT_TEST_USER}
  AND timestamp >= now() - INTERVAL {TOP_PATHS_DAYS} DAY
  AND path != ''
GROUP BY path
ORDER BY visitors DESC
LIMIT {TOP_PATHS_LIMIT}
"""


def _credentials():
    """Return (personal_api_key, project_id) or (None, None) if unconfigured."""
    key = os.environ.get('POSTHOG_PERSONAL_API_KEY')
    project = os.environ.get('POSTHOG_PROJECT_ID')
    if not key or not project:
        return None, None
    return key, str(project).strip()


def _run_query(hogql, key, project_id, timeout=10):
    """POST one HogQL query and return its result rows."""
    response = requests.post(
        f"{POSTHOG_QUERY_HOST}/api/projects/{project_id}/query/",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={"query": {"kind": "HogQLQuery", "query": hogql}},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json().get("results", []) or []


def _month_label(raw):
    """PostHog returns a month bucket as an ISO datetime string."""
    text = str(raw)
    try:
        month = int(text[5:7])
        return _MONTH_NAMES[month - 1]
    except (ValueError, IndexError):
        return text


def _fetch_from_posthog():
    """Query PostHog for all three panels. Returns None when unavailable."""
    key, project_id = _credentials()
    if not key:
        return None

    try:
        totals_rows = _run_query(TOTALS_QUERY, key, project_id)
        series_rows = _run_query(SERIES_QUERY, key, project_id)
        path_rows = _run_query(PATHS_QUERY, key, project_id)
        monthly_rows = _run_query(MONTHLY_QUERY, key, project_id)
        daily_rows = _run_query(DAILY_QUERY, key, project_id)
    except Exception as exc:  # network error, bad key, HogQL rejection
        print(f"Error fetching PostHog platform stats: {exc}")
        return None

    if not totals_rows:
        return None

    visitors, views, sessions = (list(totals_rows[0]) + [0, 0, 0])[:3]

    monthly_visitors = int(monthly_rows[0][0] or 0) if monthly_rows else 0

    # Mean over the days PostHog actually has data for, not over ROLLING_DAYS:
    # dividing by 30 when the project is 12 days old would halve the average
    # for no reason.
    daily_counts = [int(row[1] or 0) for row in daily_rows if int(row[1] or 0) > 0]
    avg_daily_visitors = round(sum(daily_counts) / len(daily_counts)) if daily_counts else 0

    return {
        "totals": {
            "visitors": int(visitors or 0),
            "views": int(views or 0),
            "sessions": int(sessions or 0),
            "monthly_visitors": monthly_visitors,
            "avg_daily_visitors": avg_daily_visitors,
        },
        "series": [
            {"label": _month_label(row[0]), "visitors": int(row[1] or 0)}
            for row in series_rows
        ],
        "paths": [
            {
                "path": str(row[0]),
                "visitors": int(row[1] or 0),
                "views": int(row[2] or 0),
            }
            for row in path_rows
        ],
        "source": "posthog",
    }


_refresh_lock = threading.Lock()
_refreshing = False


def _write_cache(stats, now):
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump({"last_fetched": now, "stats": stats}, f)
    except Exception as exc:
        # A read-only or full disk must not take the homepage down.
        print(f"Could not write platform stats cache: {exc}")


def _refresh_in_background():
    """Refresh the cache off the request thread.

    Three sequential HogQL queries can take tens of seconds. Making the first
    visitor after the TTL expires wait for that — on a cold-starting 512MB
    Render instance — is worse than showing them yesterday's numbers, so an
    expired cache is served stale while this repopulates it.
    """
    global _refreshing
    try:
        stats = _fetch_from_posthog()
        if stats:
            _write_cache(stats, time.time())
    finally:
        with _refresh_lock:
            _refreshing = False


def _start_refresh():
    global _refreshing
    with _refresh_lock:
        if _refreshing:
            return
        _refreshing = True
    threading.Thread(target=_refresh_in_background, daemon=True).start()


def get_platform_stats():
    """Return the PostHog panel data, refreshing at most once per day."""
    now = time.time()

    cache = None
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache = json.load(f)
        except Exception:
            pass

    if cache:
        stats = cache.get("stats", FALLBACK_STATS)
        if (now - cache.get("last_fetched", 0)) >= CACHE_DURATION:
            _start_refresh()
        return stats

    # No cache at all — which is EVERY boot, because Render's disk is
    # ephemeral and the cache file does not survive a deploy.
    #
    # This used to fetch inline "since there is nothing stale to serve in the
    # meantime". That made the first homepage visitor after each deploy block
    # on five sequential HogQL queries, inside the request thread, on a
    # 1-worker free instance that is simultaneously running warmup. A cold
    # container answering that slowly is what Render reports as "No open HTTP
    # ports detected on 0.0.0.0" even though gunicorn bound the socket
    # immediately — see the healthz docstring in app/routes.py.
    #
    # The snapshot is a few days stale at worst; a stalled boot costs the
    # whole site. Serve the fallback now and let the refresh land in the
    # background, exactly as the expired-cache path above does.
    _start_refresh()
    return FALLBACK_STATS


# --- Site-owned counters -------------------------------------------------
#
# Registered accounts and the live tool count come from our own database and
# catalog, not PostHog, but they belong on the same homepage panel. They are
# cached for SITE_COUNTS_TTL so a burst of homepage traffic does not turn into
# a COUNT(*) per visitor on the free Postgres instance.

SITE_COUNTS_TTL = 600  # 10 minutes

_site_counts_cache = {"at": 0.0, "value": None}
_site_counts_lock = threading.Lock()


def _read_site_counts():
    """Count registered users and visible catalog tools. Never raises."""
    counts = {}

    try:
        from app.models import User

        # Deliberately the same expression the admin panel's /admin/stats
        # reports as "total_users" (see admin_stats in app/api_routes.py):
        # an unfiltered count of the users table. The public trust bar and
        # the admin dashboard must never quote two different numbers.
        counts["registered_users"] = int(User.query.count())
    except Exception as exc:
        print(f"Could not count registered users: {exc}")
        try:
            from app import db

            db.session.rollback()
        except Exception:
            pass

    try:
        from app.api_routes import DATA_PATH
        from app.tool_cache import get_visible_tools

        counts["total_tools"] = len(get_visible_tools(DATA_PATH))
    except Exception as exc:
        print(f"Could not count visible tools: {exc}")

    return counts


def get_site_counts():
    """Return {"registered_users": n, "total_tools": n} with a 10 minute TTL.

    Keys are omitted rather than zeroed when their source is unreachable, so
    the homepage can fall back to its own last-known number instead of
    animating a real count down to 0.
    """
    now = time.time()
    with _site_counts_lock:
        cached = _site_counts_cache["value"]
        if cached is not None and (now - _site_counts_cache["at"]) < SITE_COUNTS_TTL:
            return dict(cached)

    counts = _read_site_counts()

    with _site_counts_lock:
        _site_counts_cache["at"] = now
        _site_counts_cache["value"] = counts

    return dict(counts)
