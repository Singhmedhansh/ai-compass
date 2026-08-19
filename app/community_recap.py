"""Weekly community recap email.

Deliberately *not* the newsletter. The new-tools digest (app/digest.py) goes
to everyone who ever subscribed; this goes only to people who actually did
something in the community recently. A recap of a conversation is only
interesting to the people having it — mailing it to the whole list would
train the wider audience to ignore us, and would report a "community" to
people who have never seen it.

Each send is personalised with the recipient's own standing, because the
single line that brings someone back is "you're 24 karma from Navigator",
not a leaderboard they aren't on.

It also carries the sponsored "Presenting Partner" mention that the board
tier promises on /sponsor — the recap is where that deliverable is met.

Triggering mirrors the digest exactly: opportunistic, DB-claimed, and
manually pokeable via POST /api/v1/admin/send-community-recap with the
X-Digest-Secret header.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from flask import render_template

from app import db
from app.community_leaderboard import (
    BUILDER_WEIGHTS,
    display_name,
    next_builder_rank,
    resolve_builder_rank,
    score_builders,
)
from app.community_leaderboard import board as tool_board
from app.email_utils import email_enabled, make_unsubscribe_token, send_email
from app.models import (
    CommentVote,
    CommunityComment,
    CommunityPost,
    PostVote,
    User,
)

log = logging.getLogger(__name__)

BASE = "https://ai-compass.in"

# How far back "active" reaches. Wider than the 7-day reporting window on
# purpose: someone who posted 12 days ago is exactly who a weekly recap
# should be pulling back, and a 7-day definition would quietly shrink the
# audience to only people who never left.
ACTIVE_WINDOW_DAYS = 30
REPORT_WINDOW_DAYS = 7

RECAP_CLAIM_KEY = "community_recap_last_run"
_EPOCH = "1970-01-01T00:00:00+00:00"


def _naive_utc(dt):
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def active_member_ids(since=None):
    """Users who posted, commented, or voted inside the active window.

    Voting counts. A member who reads and upvotes all week is participating
    even if they never write anything, and excluding them would drop the
    quietest half of the community from its own recap.
    """
    since = since or (datetime.now(timezone.utc) - timedelta(days=ACTIVE_WINDOW_DAYS))
    cutoff = _naive_utc(since)

    ids: set[int] = set()
    ids.update(
        row[0] for row in db.session.query(CommunityPost.user_id)
        .filter(CommunityPost.created_at >= cutoff, CommunityPost.is_hidden.is_(False))
        .distinct().all()
    )
    ids.update(
        row[0] for row in db.session.query(CommunityComment.user_id)
        .filter(CommunityComment.created_at >= cutoff, CommunityComment.is_hidden.is_(False))
        .distinct().all()
    )
    ids.update(
        row[0] for row in db.session.query(PostVote.user_id)
        .filter(PostVote.created_at >= cutoff).distinct().all()
    )
    ids.update(
        row[0] for row in db.session.query(CommentVote.user_id)
        .filter(CommentVote.created_at >= cutoff).distinct().all()
    )
    ids.discard(None)
    return ids


def recipients():
    """Active members who still want email, as User rows."""
    ids = active_member_ids()
    if not ids:
        return []
    return [
        u for u in User.query.filter(
            User.id.in_(list(ids)),
            User.notifications_enabled.is_(True),
            User.email.isnot(None),
        ).all()
        if (u.email or "").strip()
    ]


def _top_threads(limit=5):
    """Most-discussed threads of the week, scored by comments then votes."""
    cutoff = _naive_utc(datetime.now(timezone.utc) - timedelta(days=REPORT_WINDOW_DAYS))
    posts = (
        CommunityPost.query
        .filter(CommunityPost.created_at >= cutoff, CommunityPost.is_hidden.is_(False))
        .all()
    )
    if not posts:
        return []

    post_ids = [p.id for p in posts]
    comment_counts = {}
    for row in db.session.query(CommunityComment.post_id).filter(
        CommunityComment.post_id.in_(post_ids), CommunityComment.is_hidden.is_(False)
    ).all():
        comment_counts[row[0]] = comment_counts.get(row[0], 0) + 1

    vote_scores = {}
    for vote in PostVote.query.filter(PostVote.post_id.in_(post_ids)).all():
        vote_scores[vote.post_id] = vote_scores.get(vote.post_id, 0) + vote.vote_type

    ranked = sorted(
        posts,
        key=lambda p: (comment_counts.get(p.id, 0), vote_scores.get(p.id, 0), p.created_at),
        reverse=True,
    )
    return [
        {
            "id": p.id,
            "title": p.title,
            "author": display_name(p.user),
            "comments": comment_counts.get(p.id, 0),
            "score": vote_scores.get(p.id, 0),
            "url": f"{BASE}/community/{p.id}",
        }
        for p in ranked[:limit]
    ]


def _sponsor_mentions():
    """Presenting Partners, for the mention their tier is sold on."""
    try:
        from app import sponsorship

        units = sponsorship.sponsored_units()
        mentions = []
        for unit in (units.get("hero") or []) + (units.get("board") or []):
            mentions.append({
                "name": unit.get("name"),
                "blurb": unit.get("headline") or unit.get("blurb") or unit.get("tagline") or "",
                "url": f"{BASE}/tools/{unit.get('slug')}",
                "label": unit.get("label"),
            })
        return mentions
    except Exception:
        log.exception("community recap: sponsor mentions failed (non-fatal)")
        return []


def build_summary():
    """Everything in the recap that is the same for every recipient."""
    rows = tool_board("week")[:5]

    # Resolve display names from the catalog rather than title-casing the
    # slug, which turns "chatgpt" into "Chatgpt" — a small thing that makes
    # an email look automated in exactly the wrong way.
    try:
        from app import sponsorship

        names = {
            slug: (tool.get("name") or slug)
            for slug, tool in sponsorship._tools_by_slug().items()
        }
    except Exception:
        log.exception("community recap: catalog name lookup failed (non-fatal)")
        names = {}

    return {
        "board": [
            {
                "rank": r["rank"],
                "name": names.get(r["slug"]) or r["slug"].replace("-", " ").title(),
                "slug": r["slug"],
                "score": r["score"],
                "movement": r["movement"],
                "is_new": r["is_new"],
                "url": f"{BASE}/tools/{r['slug']}",
            }
            for r in rows
        ],
        "builders": score_builders("week", limit=3),
        "threads": _top_threads(5),
        "sponsors": _sponsor_mentions(),
    }


def has_anything_to_report(summary):
    """No activity means no email.

    A recap that says "nothing happened this week" is worse than silence:
    it is the fastest way to teach people to filter us out.
    """
    return bool(summary["threads"] or summary["board"] or summary["builders"])


def _movement_label(row):
    if row["is_new"]:
        return "new"
    move = row["movement"]
    if not move:
        return "no change"
    return f"up {move}" if move > 0 else f"down {abs(move)}"


def _standing_for(user_id, builders_all):
    """The recipient's own line. None when they have no karma this week —
    the template then nudges instead of reporting a zero."""
    mine = next((b for b in builders_all if b["user_id"] == user_id), None)
    if not mine:
        return None
    nxt = next_builder_rank(mine["karma"])
    return {
        "rank": mine["rank"],
        "karma": mine["karma"],
        "badge": mine["rank_badge"]["label"],
        "next_label": nxt["label"] if nxt else None,
        "next_needed": max(0, nxt["at"] - mine["karma"]) if nxt else 0,
    }


def _subject(summary):
    """A thread with no replies is not a discussion. Counting it as one is a
    small lie, and a subject line that oversells is exactly what gets a
    weekly email muted."""
    discussions = [t for t in summary["threads"] if t["comments"] > 0]
    if discussions:
        n = len(discussions)
        return f"{n} discussion{'' if n == 1 else 's'} worth your week — AI Compass"
    if summary["threads"]:
        n = len(summary["threads"])
        return f"{n} new thread{'' if n == 1 else 's'} in the AI Compass community"
    return "Your AI Compass community week"


def _render(user, summary, standing, unsubscribe_url):
    subject = _subject(summary)

    html = render_template(
        "emails/community_recap.html",
        subject=subject,
        user_name=display_name(user).split()[0] if display_name(user) else "there",
        standing=standing,
        board=summary["board"],
        builders=summary["builders"],
        threads=summary["threads"],
        sponsors=summary["sponsors"],
        weights=BUILDER_WEIGHTS,
        community_url=f"{BASE}/community",
        board_url=f"{BASE}/community?view=board",
        unsubscribe_url=unsubscribe_url,
        movement_label=_movement_label,
    )

    lines = ["Your AI Compass community week", ""]
    if standing:
        lines.append(
            f"You're #{standing['rank']} ({standing['badge']}) with {standing['karma']} karma."
        )
        if standing["next_label"]:
            lines.append(f"{standing['next_needed']} karma to {standing['next_label']}.")
        lines.append("")
    if summary["board"]:
        lines.append("Tool board this week:")
        lines += [
            f"  {r['rank']}. {r['name']} — {r['score']} pts ({_movement_label(r)})"
            for r in summary["board"]
        ]
        lines.append("")
    if summary["threads"]:
        lines.append("Most discussed:")
        lines += [
            f"  - {t['title']} ({t['comments']} comments) {t['url']}"
            for t in summary["threads"]
        ]
        lines.append("")
    if summary["sponsors"]:
        lines.append("Sponsored this week:")
        lines += [f"  - {s['name']} — {s['blurb']} {s['url']}" for s in summary["sponsors"]]
        lines.append("")
    lines.append(f"Join in: {BASE}/community")
    lines.append(f"Unsubscribe: {unsubscribe_url}")

    return subject, html, "\n".join(lines)


def run_recap(dry_run: bool = False, force: bool = False) -> dict:
    summary = build_summary()

    if not has_anything_to_report(summary) and not force:
        return {"status": "noop", "message": "No community activity to report this week."}

    people = recipients()
    if not people:
        return {
            "status": "noop",
            "message": "No active members opted in to email.",
            "threads": len(summary["threads"]),
        }

    # Karma standings are computed once for everyone, then looked up per
    # recipient — otherwise this is one full leaderboard pass per email.
    builders_all = score_builders("week", limit=1000)

    if dry_run:
        return {
            "status": "dry_run",
            "recipients": len(people),
            "threads": len(summary["threads"]),
            "board": [r["name"] for r in summary["board"]],
            "builders": [b["name"] for b in summary["builders"]],
            "sponsors": [s["name"] for s in summary["sponsors"]],
            "sample_recipients": [u.email for u in people[:5]],
        }

    sent = 0
    for user in people:
        email = (user.email or "").strip()
        if not email:
            continue
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(email)}"
        standing = _standing_for(user.id, builders_all)
        subject, html, text = _render(user, summary, standing, unsub)
        if send_email(email, subject, html, text):
            sent += 1

    log.info("Community recap sent to %s/%s active members", sent, len(people))
    return {
        "status": "sent",
        "recipients": len(people),
        "delivered": sent,
        "threads": len(summary["threads"]),
    }


def maybe_run_recap(min_interval_hours: int = 168) -> None:
    """Self-scheduled weekly send, using the same atomic AppSetting claim as
    maybe_run_digest so exactly one worker wins per interval. Never raises —
    it runs off request traffic and must not affect the request."""
    try:
        if not email_enabled():
            return

        from sqlalchemy import update

        from app.models import AppSetting

        now = datetime.now(timezone.utc)
        threshold = (now - timedelta(hours=min_interval_hours)).isoformat()

        if db.session.query(AppSetting).filter_by(key=RECAP_CLAIM_KEY).one_or_none() is None:
            try:
                db.session.add(AppSetting(key=RECAP_CLAIM_KEY, value=_EPOCH))
                db.session.commit()
            except Exception:
                db.session.rollback()  # another worker inserted it concurrently

        res = db.session.execute(
            update(AppSetting)
            .where(AppSetting.key == RECAP_CLAIM_KEY)
            .where(AppSetting.value < threshold)
            .values(value=now.isoformat())
        )
        db.session.commit()
        if res.rowcount != 1:
            return  # not due, or another worker claimed it

        result = run_recap(dry_run=False, force=False)
        log.info("Auto community-recap tick result: %s", result)
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        log.exception("maybe_run_recap failed (non-fatal)")
