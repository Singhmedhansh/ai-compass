"""PostHog read-path diagnostic — READ ONLY.

app/platform_stats.py catches every failure and silently returns
FALLBACK_STATS, so a bad key, a wrong project id or a slow query all look
identical from outside: the homepage just keeps showing the August snapshot.
This script runs the exact same credentials and the exact same HogQL through
the exact same endpoint, but prints PostHog's real response instead of
swallowing it.

Usage: .venv/Scripts/python.exe scripts/diagnose_posthog.py

Reads POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID from .env or the
environment. On Render, run it from the service shell so it picks up the
same env the web process sees.
"""
import importlib.util
import json
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

# Load app/platform_stats.py as a standalone module rather than importing
# app.platform_stats, which would pull in app/__init__.py. Same reasoning as
# scripts/diagnose_revenue.py: this is a read-only diagnostic and it should be
# impossible for it to touch the production DB, even indirectly.
_spec = importlib.util.spec_from_file_location(
    "_platform_stats",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "app", "platform_stats.py"),
)
ps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ps)

DAILY_QUERY = ps.DAILY_QUERY
MONTHLY_QUERY = ps.MONTHLY_QUERY
PATHS_QUERY = ps.PATHS_QUERY
POSTHOG_QUERY_HOST = ps.POSTHOG_QUERY_HOST
SERIES_QUERY = ps.SERIES_QUERY
TOTALS_QUERY = ps.TOTALS_QUERY


def section(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


key = os.environ.get("POSTHOG_PERSONAL_API_KEY", "").strip()
project = os.environ.get("POSTHOG_PROJECT_ID", "").strip()

section("CREDENTIALS")
if not key:
    raise SystemExit("POSTHOG_PERSONAL_API_KEY not set — _credentials() returns None "
                     "and get_platform_stats() serves FALLBACK_STATS forever.")
if not project:
    raise SystemExit("POSTHOG_PROJECT_ID not set — same outcome as above.")

print(f"key      : {key[:8]}…{key[-4:]}  (len {len(key)})")
print(f"project  : {project}")
print(f"host     : {POSTHOG_QUERY_HOST}")

# The two most common misconfigurations, both of which fail as an opaque
# 401/404 inside _fetch_from_posthog().
if not key.startswith("phx_"):
    print("\n  WARNING: personal API keys start with 'phx_'. A 'phc_' value is the "
          "PUBLIC project/ingest key used by posthog-js — it cannot read the query API.")
if not project.isdigit():
    print("\n  WARNING: POSTHOG_PROJECT_ID should be the NUMERIC id from the PostHog "
          "URL (us.posthog.com/project/<id>/...), not a token or a project name.")

# Cheapest possible authenticated call: proves the key is valid and scoped to
# this project before we blame the HogQL.
section("AUTH / PROJECT REACHABILITY")
try:
    r = requests.get(
        f"{POSTHOG_QUERY_HOST}/api/projects/{project}/",
        headers={"Authorization": f"Bearer {key}"},
        timeout=20,
    )
    print(f"GET /api/projects/{project}/ -> HTTP {r.status_code}")
    if r.status_code == 200:
        body = r.json()
        print(f"  project name : {body.get('name')}")
        print(f"  timezone     : {body.get('timezone')}")
    else:
        print(f"  body: {r.text[:800]}")
        if r.status_code == 401:
            print("\n  -> Key is invalid, revoked, or from a different PostHog region "
                  "(us vs eu). Check POSTHOG_QUERY_HOST too.")
        if r.status_code == 403:
            print("\n  -> Key is valid but lacks scope for this project. PostHog personal "
                  "API keys are scoped: this one needs 'Query: Read' (and the project "
                  "must be in the key's allowed projects list).")
        if r.status_code == 404:
            print("\n  -> No such project for this key. Wrong POSTHOG_PROJECT_ID.")
except Exception as exc:
    print(f"  FAILED: {type(exc).__name__}: {exc}")

section("HOGQL QUERIES (same five app/platform_stats.py runs)")
queries = [
    ("TOTALS  (all time, unbounded scan)", TOTALS_QUERY),
    ("SERIES  (6 months)", SERIES_QUERY),
    ("PATHS   (90 days)", PATHS_QUERY),
    ("MONTHLY (30 days)", MONTHLY_QUERY),
    ("DAILY   (30 days)", DAILY_QUERY),
]

total_elapsed = 0.0
for label, hogql in queries:
    started = time.time()
    try:
        r = requests.post(
            f"{POSTHOG_QUERY_HOST}/api/projects/{project}/query/",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json={"query": {"kind": "HogQLQuery", "query": hogql}},
            # Deliberately generous. The module uses timeout=10; if a query
            # lands between 10s and this, THAT is the bug and the line below
            # will say so.
            timeout=90,
        )
        elapsed = time.time() - started
        total_elapsed += elapsed
        print(f"\n{label}: HTTP {r.status_code} in {elapsed:.1f}s")
        if r.status_code == 200:
            rows = r.json().get("results", []) or []
            print(f"  rows: {json.dumps(rows[:8])}")
            if elapsed > 10:
                print(f"  -> EXCEEDS the module's timeout=10 in _run_query(). "
                      f"This query alone would abort the whole refresh.")
        else:
            print(f"  body: {r.text[:1200]}")
    except Exception as exc:
        elapsed = time.time() - started
        total_elapsed += elapsed
        print(f"\n{label}: {type(exc).__name__} after {elapsed:.1f}s: {exc}")

section("VERDICT")
print(f"Total wall time for all five queries: {total_elapsed:.1f}s")
print("The module runs these sequentially in a daemon thread; if the process "
      "recycles a worker before that finishes, no cache file is written and the "
      "next request starts over from FALLBACK_STATS.")
