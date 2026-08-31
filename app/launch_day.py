"""Launch Day: a date the founder picks, not a flag we flip.

Everything a paid listing already earns — going live, the community rail
card, first position in the new-tools digest, the homepage strip — currently
starts whenever an admin happens to click approve. Spread across whichever
Tuesday that lands on, a small audience sees a trickle. Concentrated on one
announced date, the same audience is a spike the founder can plan around,
tell their own list about, and screenshot.

So this sells nothing new. It is the SCHEDULING of what Fast-Track and
Reviewed already include, which is why it adds no price point to a ladder
that was just deliberately simplified: the same perks, on a date the buyer
chose, are worth more than the same perks on a date nobody chose.

Three rules:

  1. One launch per day. The whole point is concentration; two launches
     sharing a Tuesday halve the thing being sold.
  2. A founder can move their date until it fires, and not after. A launch
     that already happened is a fact, not a preference.
  3. The date can never be earlier than the tier's own release delay — that
     delay is what the paid tiers are timed on, and a launch is not a way to
     buy past it.
"""

from datetime import date, datetime, timedelta, timezone

from app import db
from app.models import CatalogTool, Submission
from app.pricing_tiers import (
    effective_tier,
    includes_sponsored_perks,
    visibility_delay_days_for_tier,
)

# Launches per calendar day. One, because concentration is the product.
LAUNCHES_PER_DAY = 1

# How far out a founder may book. Beyond this the honest answer is "talk to
# us" rather than a date we have no idea we can honour.
MAX_LEAD_DAYS = 90


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _naive(value):
    value = _aware(value)
    return value.replace(tzinfo=None) if value else None


def is_eligible(submission):
    """Only a verified placement tier can schedule a launch — it is those
    perks that are being scheduled."""
    if submission is None or submission.payment_status != "verified":
        return False
    tier = effective_tier(submission.pricing_model, submission.payment_status)
    return includes_sponsored_perks(tier)


def earliest_date(submission):
    """The first day this submission may launch.

    Never earlier than the tier's release delay measured from approval: that
    delay is the thing the tier is timed on, and a launch date must not
    become a way to buy past it. A row not yet approved counts from today,
    since approval can only move the floor later.
    """
    tier = effective_tier(submission.pricing_model, submission.payment_status)
    delay = visibility_delay_days_for_tier(tier)
    base = _aware(submission.approved_at) or datetime.now(timezone.utc)
    floor = max(base + timedelta(days=delay), datetime.now(timezone.utc))
    return floor.date()


def taken_dates(exclude_submission_id=None):
    """Days already spoken for, as a set of date objects."""
    rows = (
        db.session.query(Submission.id, Submission.launch_at)
        .filter(Submission.launch_at.isnot(None))
        .all()
    )
    return {
        launch_at.date()
        for sub_id, launch_at in rows
        if launch_at is not None and sub_id != exclude_submission_id
    }


def availability(submission, days=30):
    """The next `days` bookable dates for this submission.

    Returned as a list the founder picks from rather than a free-text field:
    a date picker that offers a day we cannot honour is a promise broken at
    the moment it is made.
    """
    if not is_eligible(submission):
        return []

    first = earliest_date(submission)
    taken = taken_dates(exclude_submission_id=submission.id)
    horizon = date.today() + timedelta(days=MAX_LEAD_DAYS)

    out = []
    cursor = first
    while len(out) < days and cursor <= horizon:
        out.append({
            "date": cursor.isoformat(),
            "available": cursor not in taken,
        })
        cursor += timedelta(days=1)
    return out


def schedule(submission, when):
    """Books (or moves) a Launch Day. Returns (launch_date, error_code).

    `when` is a YYYY-MM-DD string or a date.
    """
    if not is_eligible(submission):
        return None, "tier_not_eligible"
    if submission.launched_at is not None:
        # A launch that already happened is a fact, not a preference.
        return None, "already_launched"

    if isinstance(when, str):
        try:
            when = date.fromisoformat(when.strip())
        except (TypeError, ValueError):
            return None, "invalid_date"
    if not isinstance(when, date):
        return None, "invalid_date"

    if when < earliest_date(submission):
        return None, "too_early"
    if when > date.today() + timedelta(days=MAX_LEAD_DAYS):
        return None, "too_far_out"
    if when in taken_dates(exclude_submission_id=submission.id):
        return None, "date_taken"

    submission.launch_at = datetime(when.year, when.month, when.day)
    # The listing goes live ON the day, not before — a launch nobody can
    # visit yet is an announcement of a 404.
    row = CatalogTool.query.filter_by(submission_id=submission.id).first()
    if row is not None:
        row.visible_at = submission.launch_at

    try:
        db.session.commit()
        return when, None
    except Exception:
        db.session.rollback()
        return None, "launch_write_failed"


def cancel(submission):
    """Unbooks a launch that has not fired, returning the listing to the
    ordinary release schedule."""
    if submission is None:
        return "not_found"
    if submission.launched_at is not None:
        return "already_launched"

    submission.launch_at = None
    row = CatalogTool.query.filter_by(submission_id=submission.id).first()
    if row is not None:
        tier = effective_tier(submission.pricing_model, submission.payment_status)
        base = _aware(submission.approved_at) or datetime.now(timezone.utc)
        row.visible_at = _naive(base + timedelta(days=visibility_delay_days_for_tier(tier)))
    try:
        db.session.commit()
        return None
    except Exception:
        db.session.rollback()
        return "launch_write_failed"


def status(submission):
    """What the founder dashboard shows about their launch."""
    if submission is None or not is_eligible(submission):
        return None
    launch_at = _aware(submission.launch_at)
    launched_at = _aware(submission.launched_at)
    now = datetime.now(timezone.utc)
    return {
        "eligible": True,
        "launch_at": launch_at.date().isoformat() if launch_at else None,
        "launched": launched_at is not None,
        "launched_at": launched_at.isoformat() if launched_at else None,
        "days_until": (launch_at.date() - now.date()).days if launch_at and not launched_at else None,
        "earliest_date": earliest_date(submission).isoformat(),
        "can_change": launched_at is None,
    }


def due_launches(now=None):
    """Scheduled launches whose day has arrived and that have not fired."""
    now = now or datetime.now(timezone.utc)
    return (
        Submission.query
        .filter(
            Submission.launch_at.isnot(None),
            Submission.launched_at.is_(None),
            Submission.launch_at <= now.replace(tzinfo=None),
            Submission.status == "approved",
            Submission.payment_status == "verified",
        )
        .all()
    )


def _showcase_post(submission, tool):
    """The community post that makes a launch a moment rather than a setting.

    Written under the founder's own account when they have one, because a
    showcase posted by the directory reads as an ad, and posted by the maker
    reads as news. No account, no post — we do not put words in a stranger's
    mouth.
    """
    from app.models import CommunityPost

    if not submission.founder_user_id:
        return None

    existing = CommunityPost.query.filter_by(
        user_id=submission.founder_user_id,
        tool_slug=tool.slug,
        post_type="showcase",
    ).first()
    if existing is not None:
        return existing

    post = CommunityPost(
        user_id=submission.founder_user_id,
        title=f"{tool.name} is live on AI Compass",
        body=(
            f"{tool.name} launches on AI Compass today. It is listed in "
            f"{tool.category or 'the catalog'} — take a look, and tell me what is missing.\n\n"
            "You can edit this post, or delete it, from your account."
        ),
        post_type="showcase",
        tool_slug=tool.slug,
    )
    db.session.add(post)
    return post


def fire_due_launches(now=None):
    """Runs every due launch. Idempotent — `launched_at` is the guard.

    What firing actually does is mostly nothing, on purpose: visible_at was
    already aligned to the date when it was booked, so the listing appears,
    the digest picks it up as newly-live, the rail window starts from the
    launch date (see sponsorship.complimentary_window) and the homepage strip
    reads the same sponsored flag it always did. The only new side effect is
    the showcase post, and stamping the date so none of it repeats.
    """
    fired = []
    for submission in due_launches(now=now):
        tool = CatalogTool.query.filter_by(submission_id=submission.id).first()
        if tool is None:
            continue
        try:
            _showcase_post(submission, tool)
            submission.launched_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db.session.commit()
            fired.append(tool.slug)
        except Exception:
            db.session.rollback()

    return fired
