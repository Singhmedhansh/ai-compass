"""Monthly listing report, pushed to the founder.

The submitter dashboard already computes everything a founder wants to know
— views, clicks, CTR, favourites, ratings, a trend, and how they rank in
their category. Nobody visits a dashboard for a directory listing. So the
report goes to them instead, once a month, and the marginal cost is one
email.

Two things this is deliberately NOT:

  * Not a newsletter. It goes only to people whose listing earns analytics —
    a verified paid tier (see pricing_tiers.includes_sponsored_perks and the
    dashboard's own gate). The report IS the paid deliverable; mailing the
    same numbers to free listings would give away what the tier sells.
  * Not a highlight reel. The numbers are quoted as they are, including the
    small ones. A report that only arrives in good months is a report nobody
    can plan against, and this audience can check every figure on their own
    dashboard the moment they doubt it.

Sends go through the shared Resend budget (app/send_budget.py) like the
digest and outreach: this list is short, but a mail path that ignores the
budget is one that can silently starve the ones that respect it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from flask import render_template

from app import db
from app.email_utils import email_enabled, make_unsubscribe_token, send_email
from app.models import CatalogTool, Submission
from app.pricing_tiers import effective_tier, includes_sponsored_perks

log = logging.getLogger(__name__)

BASE = "https://ai-compass.in"

REPORT_CLAIM_KEY = "founder_report_last_run"
_EPOCH = "1970-01-01T00:00:00+00:00"

WINDOW_DAYS = 30


def _naive(dt):
    return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt


def recipients():
    """(submission, catalog_row) for every listing owed a report.

    Verified paid tiers only, live listings only. A tool still inside its
    release delay has nothing to report yet, and saying "0 views" about a
    page nobody could have visited reads as a broken product rather than an
    honest number.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = (
        db.session.query(Submission, CatalogTool)
        .join(CatalogTool, CatalogTool.submission_id == Submission.id)
        .filter(
            Submission.status == "approved",
            Submission.payment_status == "verified",
            Submission.is_test.is_(False),
            Submission.submitter_email.isnot(None),
            CatalogTool.hidden.is_(False),
        )
        .all()
    )

    out = []
    for submission, tool in rows:
        tier = effective_tier(submission.pricing_model, submission.payment_status)
        if tier == "free":
            continue
        visible_at = tool.visible_at
        if visible_at is not None and _naive(visible_at) > now:
            continue
        out.append((submission, tool))
    return out


def build_report(submission, tool):
    """Everything the email says about one listing, computed once."""
    from app.api_routes import (
        _combined_rating_summary,
        _submission_dashboard_category_benchmark,
    )
    from app.models import Favorite, OutboundClick, ToolPageView

    slug = tool.slug
    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    prev_since = since - timedelta(days=WINDOW_DAYS)

    views = ToolPageView.query.filter(
        ToolPageView.slug == slug, ToolPageView.created_at >= since
    ).count()
    clicks = OutboundClick.query.filter(
        OutboundClick.slug == slug, OutboundClick.created_at >= since
    ).count()

    # The previous window, so the email can say "up from" rather than quoting
    # a number with nothing to compare it to.
    prev_views = ToolPageView.query.filter(
        ToolPageView.slug == slug,
        ToolPageView.created_at >= prev_since,
        ToolPageView.created_at < since,
    ).count()
    prev_clicks = OutboundClick.query.filter(
        OutboundClick.slug == slug,
        OutboundClick.created_at >= prev_since,
        OutboundClick.created_at < since,
    ).count()

    rating_avg, rating_count = _combined_rating_summary(slug)
    tier = effective_tier(submission.pricing_model, submission.payment_status)

    benchmark = None
    if includes_sponsored_perks(tier):
        try:
            benchmark = _submission_dashboard_category_benchmark(tool, _naive(since))
        except Exception:
            log.exception("benchmark failed for %s", slug)

    return {
        "slug": slug,
        "name": tool.name,
        "tier": tier,
        "window_days": WINDOW_DAYS,
        "views": views,
        "clicks": clicks,
        "prev_views": prev_views,
        "prev_clicks": prev_clicks,
        "views_delta": views - prev_views,
        "clicks_delta": clicks - prev_clicks,
        # None, not 0%, when there is no view data: "0% click-through" and
        # "nobody has looked yet" are different facts.
        "ctr": round((clicks / views) * 100, 1) if views else None,
        "favorites": Favorite.query.filter_by(tool_id=slug).count(),
        "rating": rating_avg,
        "rating_count": rating_count,
        "benchmark": benchmark if (benchmark or {}).get("available") else None,
        "dashboard_url": f"{BASE}/dashboard/submission?submission_id={submission.id}",
        "tool_url": f"{BASE}/tools/{slug}",
    }


def has_anything_to_say(report):
    """A month with no views, no clicks, no ratings and no benchmark is a
    month where the email would be four zeros and a link.

    Deliberately not "only send good news" — a month of 2 views still sends,
    because the point is a number they can plan against. This only skips the
    case where we would be mailing to say nothing at all.
    """
    return bool(
        report["views"] or report["clicks"] or report["rating_count"] or report["benchmark"]
    )


def _subject(report):
    if report["clicks"]:
        return f"{report['name']}: {report['clicks']} clicks from AI Compass this month"
    if report["views"]:
        return f"{report['name']}: {report['views']} views on AI Compass this month"
    return f"{report['name']}: your AI Compass month"


def _render(report, unsubscribe_url):
    subject = _subject(report)
    html = render_template(
        "emails/founder_report.html",
        subject=subject,
        report=report,
        unsubscribe_url=unsubscribe_url,
    )
    text_lines = [
        f"{report['name']} — last {report['window_days']} days on AI Compass",
        "",
        f"Views: {report['views']} (previous {report['window_days']} days: {report['prev_views']})",
        f"Clicks to your site: {report['clicks']} (previous: {report['prev_clicks']})",
    ]
    if report["ctr"] is not None:
        text_lines.append(f"Click-through rate: {report['ctr']}%")
    if report["rating_count"]:
        text_lines.append(f"Rating: {report['rating']} from {report['rating_count']} people")
    if report["benchmark"]:
        b = report["benchmark"]
        text_lines.append(
            f"Category: #{b['your_rank']} of {b['total_tools_in_category']} in {b['category']}"
        )
    text_lines += [
        "",
        f"Full dashboard: {report['dashboard_url']}",
        f"Your listing: {report['tool_url']}",
        "",
        f"Unsubscribe: {unsubscribe_url}",
    ]
    return subject, html, "\n".join(text_lines)


def run_reports(dry_run: bool = False, force: bool = False) -> dict:
    pairs = recipients()
    if not pairs:
        return {"status": "noop", "message": "No paid listings are live yet."}

    reports = []
    for submission, tool in pairs:
        report = build_report(submission, tool)
        if has_anything_to_say(report) or force:
            reports.append((submission, report))

    if not reports:
        return {
            "status": "noop",
            "eligible": len(pairs),
            "message": "Nothing to report for any live paid listing this month.",
        }

    if dry_run:
        return {
            "status": "dry_run",
            "eligible": len(pairs),
            "reports": len(reports),
            "sample": [
                {"slug": r["slug"], "views": r["views"], "clicks": r["clicks"]}
                for _s, r in reports[:5]
            ],
        }

    from app.send_budget import release_send_slots, reserve_send_slots

    reservation = reserve_send_slots(len(reports), requester="founder_report")
    granted = reservation.get("granted", 0)
    if granted <= 0:
        return {
            "status": "deferred",
            "reports": len(reports),
            "message": "Shared send budget exhausted; reports deferred to the next run.",
        }

    sent = 0
    attempted = reports[:granted]
    for submission, report in attempted:
        email = (submission.submitter_email or "").strip()
        if not email:
            continue
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(email)}"
        subject, html, text = _render(report, unsub)
        if send_email(email, subject, html, text):
            sent += 1

    # Hand back what we reserved and did not use, so a failed send does not
    # quietly eat a slot the digest or outreach could have had.
    unused = granted - sent
    if unused > 0:
        release_send_slots(unused, requester="founder_report")

    log.info("Founder reports sent to %s/%s listings", sent, len(reports))
    return {
        "status": "sent",
        "eligible": len(pairs),
        "reports": len(reports),
        "delivered": sent,
        "deferred": max(0, len(reports) - granted),
    }


def maybe_run_reports(min_interval_hours: int = 720) -> None:
    """Self-scheduled monthly send, using the same atomic AppSetting claim as
    maybe_run_digest so exactly one worker wins per interval. Never raises —
    it runs off request traffic and must not affect the request."""
    try:
        if not email_enabled():
            return

        from sqlalchemy import update

        from app.models import AppSetting

        now = datetime.now(timezone.utc)
        threshold = (now - timedelta(hours=min_interval_hours)).isoformat()

        if db.session.query(AppSetting).filter_by(key=REPORT_CLAIM_KEY).one_or_none() is None:
            try:
                db.session.add(AppSetting(key=REPORT_CLAIM_KEY, value=_EPOCH))
                db.session.commit()
            except Exception:
                db.session.rollback()  # another worker inserted it concurrently

        res = db.session.execute(
            update(AppSetting)
            .where(AppSetting.key == REPORT_CLAIM_KEY)
            .where(AppSetting.value < threshold)
            .values(value=now.isoformat())
        )
        db.session.commit()
        if res.rowcount != 1:
            return  # not due, or another worker claimed it

        result = run_reports(dry_run=False, force=False)
        log.info("Auto founder-report tick result: %s", result)
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        log.exception("maybe_run_reports failed (non-fatal)")
