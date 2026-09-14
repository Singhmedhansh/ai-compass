"""Server-side visitor counting, with no cookie and no consent required.

WHY THIS EXISTS
---------------
On 2026-09-13 the cookie banner was made real: GA4 and PostHog stopped
loading until a visitor explicitly clicks Accept. Reported traffic fell ~77%
overnight - /best-free-ai-tools went from ~97 users/day to 22 - and the
obvious reading was that a deploy had broken SEO. It had not. Cloudflare's
edge analytics, which count at the network and cannot be affected by
anything the page does, showed 17 / 17 / 25 / 26 / 22 unique visitors across
those same days: completely flat. The traffic never moved. Only the
measurement did.

That is not a bug in the consent gate - the gate is correct, and the
previous behaviour (a "Decline" button that wrote a localStorage key nothing
read, plus scrolling 100px silently counting as consent) was not defensible.
It is a gap in where we were counting. A visitor who arrives from Google,
reads one page and leaves has, by design, consented to nothing, and a
consent-gated analytics product is therefore structurally blind to exactly
the audience the SEO pages exist to reach.

Counting here closes that gap. The request reaches Flask regardless of
consent, regardless of JavaScript, and regardless of whether an ad blocker
ate the third-party script.

WHY NO CONSENT IS REQUIRED
--------------------------
The consent requirement in ePrivacy Art. 5(3) is about storing or accessing
information on the visitor's device. This stores nothing there: no cookie,
no localStorage, no beacon, no identifier handed back to the browser. The
only personal data in play is the IP address, and it is never written - it
is hashed with a salt that rotates daily and then discarded. This is the
same shape as Plausible and Fathom, and it is why they operate without a
banner.

WHAT THIS DELIBERATELY CANNOT DO
--------------------------------
The daily salt rotation means a visitor's hash today and their hash
tomorrow are unrelated. Returning visitors, retention and cross-day
sessionisation are therefore not computable from this table - not
"difficult", not available. If that is ever wanted it needs a different
design and a different privacy answer, not a tweak to this one.

It also counts a *little* differently from GA4, and the numbers will not
reconcile. Expect this table to read HIGHER: a crawler with an honest
user-agent is filtered (see is_bot_user_agent), but one presenting as Chrome
is counted here and was invisible to GA4's own bot filtering. What matters
is that the series is consistent with itself day over day.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta, timezone

from flask import current_app

from app import db
from app.click_quality import client_ip, is_bot_user_agent

# Rows older than this are deleted. Long enough to see a season and to
# compare a launch against the month before it; short enough that the table
# stays small on a free Postgres plan.
RETENTION_DAYS = 400

# Paths we never count. These are not pages a person reads, and counting
# them would put a floor of bot and monitoring traffic under every number.
_IGNORED_PREFIXES = (
    "/static/",
    "/assets/",
    "/api/",
    "/ingest",
    "/go/",
    "/icon/",
    "/logo/",
    "/og/",
    "/healthz",
    "/health",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/security.txt",
    "/.well-known/",
    "/favicon",
)

# Per-worker memo of the last day this process ran a purge. Render's free
# tier has no cron, and the existing self-scheduled jobs are already the
# awkward part of this codebase, so the purge piggybacks on the write path:
# the first write after midnight does the delete. Worst case with N workers
# is N deletes a day, each a no-op after the first.
_last_purge_day: date | None = None


def _normalise_path(path: str) -> str:
    """Path as it should be grouped, or "" if it should not be counted."""
    if not path:
        return "/"
    # Query strings would explode cardinality (every utm_* combination its
    # own row) and can carry identifying values, which is exactly what this
    # module is supposed to avoid storing.
    path = str(path).split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/"):
        path = "/" + path
    lowered = path.lower()
    if any(lowered.startswith(prefix) for prefix in _IGNORED_PREFIXES):
        return ""
    # Trailing slash is the same page; "/" itself must survive this.
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/") or "/"
    # The column is 255. A path longer than that is not a real page, but
    # truncating rather than dropping keeps the view count honest.
    return path[:255]


def visitor_hash(ip, user_agent, day, secret):
    """Salted digest identifying one visitor within one day, or None.

    The salt is `secret:day`, so the value for a given person changes every
    midnight. Rotating it is what stops this table becoming a cross-day
    tracker - see the module docstring.

    The user-agent joins the IP because a household or campus behind one NAT
    address is many visitors, and IP alone would collapse them into one.
    """
    if not ip:
        return None
    ip = str(ip).strip()
    if not ip:
        return None
    salt = f"{secret}:{day.isoformat()}"
    material = f"{salt}:{ip}:{(user_agent or '').strip()}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def _purge_if_new_day(today):
    global _last_purge_day
    if _last_purge_day == today:
        return
    _last_purge_day = today
    cutoff = today - timedelta(days=RETENTION_DAYS)
    from app.models import PageViewDaily, VisitorDaily

    try:
        PageViewDaily.query.filter(PageViewDaily.day < cutoff).delete(
            synchronize_session=False
        )
        VisitorDaily.query.filter(VisitorDaily.day < cutoff).delete(
            synchronize_session=False
        )
        db.session.commit()
    except Exception:
        db.session.rollback()


def record_page_view(request, status_code=200):
    """Count one HTML page view. Returns True if a row was written.

    Fail-open by design: every failure path here returns False and lets the
    page render. A traffic counter that can 500 a page is worse than no
    traffic counter, and this runs on every single request.
    """
    if status_code != 200:
        # A 404 is not a page view. Counting them would put every broken
        # inbound link and every vulnerability scanner probing for
        # /wp-admin into the numbers we make decisions on.
        return False

    path = _normalise_path(getattr(request, "path", "") or "")
    if not path:
        return False

    user_agent = str(request.headers.get("User-Agent") or "").strip() or None
    if is_bot_user_agent(user_agent):
        return False

    today = datetime.now(timezone.utc).date()
    secret = current_app.config.get("SECRET_KEY") or "ai-compass"
    vhash = visitor_hash(client_ip(request), user_agent, today, secret)
    if not vhash:
        return False

    from sqlalchemy import text

    try:
        _purge_if_new_day(today)

        # ON CONFLICT rather than SELECT-then-INSERT: gunicorn runs several
        # workers and two of them counting the same page in the same second
        # is routine, not exceptional. The read-modify-write version loses
        # those races silently, which is the worst failure mode a counter
        # can have. Supported by Postgres and by SQLite >= 3.24, so the
        # tests exercise the same statement production runs.
        db.session.execute(
            text(
                "INSERT INTO page_view_daily (day, path, views) "
                "VALUES (:day, :path, 1) "
                "ON CONFLICT (day, path) "
                "DO UPDATE SET views = page_view_daily.views + 1"
            ),
            {"day": today, "path": path},
        )
        db.session.execute(
            text(
                "INSERT INTO visitor_daily (day, path, visitor_hash) "
                "VALUES (:day, :path, :hash) "
                "ON CONFLICT (day, path, visitor_hash) DO NOTHING"
            ),
            {"day": today, "path": path, "hash": vhash},
        )
        db.session.commit()
        return True
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            current_app.logger.warning(
                "traffic: failed to record page view", exc_info=True
            )
        except Exception:
            pass
        return False


def daily_totals(days=30):
    """Site-wide views and unique visitors per day, oldest first.

    Uniques are COUNT(DISTINCT visitor_hash) across paths, not the sum of
    per-page uniques - one person reading three pages is one visitor, and
    summing the per-page figures would report them as three.
    """
    from sqlalchemy import distinct, func

    from app.models import PageViewDaily, VisitorDaily

    since = datetime.now(timezone.utc).date() - timedelta(days=max(1, days) - 1)

    views = dict(
        db.session.query(PageViewDaily.day, func.sum(PageViewDaily.views))
        .filter(PageViewDaily.day >= since)
        .group_by(PageViewDaily.day)
        .all()
    )
    uniques = dict(
        db.session.query(
            VisitorDaily.day, func.count(distinct(VisitorDaily.visitor_hash))
        )
        .filter(VisitorDaily.day >= since)
        .group_by(VisitorDaily.day)
        .all()
    )

    out = []
    for day in sorted(set(views) | set(uniques)):
        out.append(
            {
                "day": day.isoformat() if hasattr(day, "isoformat") else str(day),
                "views": int(views.get(day) or 0),
                "unique_visitors": int(uniques.get(day) or 0),
            }
        )
    return out


def top_paths(days=7, limit=25):
    """Busiest paths over the window, with views and unique visitors."""
    from sqlalchemy import func

    from app.models import PageViewDaily, VisitorDaily

    since = datetime.now(timezone.utc).date() - timedelta(days=max(1, days) - 1)

    views = (
        db.session.query(PageViewDaily.path, func.sum(PageViewDaily.views))
        .filter(PageViewDaily.day >= since)
        .group_by(PageViewDaily.path)
        .order_by(func.sum(PageViewDaily.views).desc())
        .limit(limit)
        .all()
    )
    if not views:
        return []

    paths = [row[0] for row in views]
    uniques = dict(
        db.session.query(
            VisitorDaily.path, func.count(func.distinct(VisitorDaily.visitor_hash))
        )
        .filter(VisitorDaily.day >= since, VisitorDaily.path.in_(paths))
        .group_by(VisitorDaily.path)
        .all()
    )
    return [
        {
            "path": path,
            "views": int(total or 0),
            "unique_visitors": int(uniques.get(path) or 0),
        }
        for path, total in views
    ]
