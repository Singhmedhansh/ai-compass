"""Commissioned editorial reviews — the product, not the placement.

The thing worth selling on a small-but-real audience is not an impression,
it is an artifact: a hands-on, 300-500 word review of one tool on its own
indexed /tools/<slug> page, with screenshots, pros, cons and a verdict,
written and bylined by a human. A founder can link that from their own
site, their launch post and their investor update, and it keeps working
long after a week of rail placement has expired.

Three constraints keep it honest, and all three are enforced here rather
than promised in marketing copy:

  1. The money buys the *work*, never the conclusion. `score` and `verdict`
     are ours; the buyer's input is a brief, which is context for the
     reviewer and is never published verbatim.
  2. Capacity is real. MONTHLY_CAPACITY is what one person can actually
     write in a month, and open orders count against it — overselling here
     produces a queue of angry people, not revenue.
  3. Every published review is labelled as commissioned. Disclosure is the
     reason the artifact is citable at all.

Nothing in this module can change a tool's ranking. See sponsorship.py for
the same rule applied to placements.
"""

import json
from datetime import datetime, timedelta, timezone

from app import db
from app.models import EditorialReview

# List price in USD for a review commissioned on its own, for a tool that
# is already listed. Buying it bundled with the listing is the "reviewed"
# tier in pricing_tiers.py ($79, listing included). Mirrored by
# REVIEW_PRODUCT in frontend/src/config/sponsorTiers.js — change together.
REVIEW_PRICE = 39.0

# What we commit to in the checkout copy. Deliberately generous: a review
# published late is a broken promise, a review published early is a nice
# surprise.
TURNAROUND_DAYS = 10

# Reviews we can genuinely write per calendar month. This is a person's
# writing throughput, not a revenue target.
MONTHLY_CAPACITY = 4

# Orders that still owe the buyer work.
OPEN_STATUSES = ("ordered", "drafting")

# The word we put on the page. Not configurable — a disclosure an operator
# can soften is not a disclosure.
DISCLOSURE = (
    "This review was commissioned: the tool's team paid a flat fee for us to "
    "test it and publish the result. They did not see it before it went live "
    "and could not change the verdict."
)


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _iso(value):
    value = _aware(value)
    return value.isoformat() if value else None


def _load_list(raw):
    """JSON text column -> list. Never raises: a malformed blob renders as
    an empty section rather than 500-ing a tool page."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def _dump_list(items, limit=8):
    """list -> JSON text, trimmed and de-blanked. Accepts strings or
    {url, caption} dicts (screenshots) and drops anything else."""
    if not isinstance(items, list):
        return None
    cleaned = []
    for item in items[:limit]:
        if isinstance(item, str):
            text = item.strip()
            if text:
                cleaned.append(text[:400])
        elif isinstance(item, dict):
            url = str(item.get("url") or "").strip()
            if url.startswith(("http://", "https://", "/")):
                cleaned.append({
                    "url": url[:600],
                    "caption": str(item.get("caption") or "").strip()[:200] or None,
                })
    return json.dumps(cleaned) if cleaned else None


def _month_start(moment=None):
    now = moment or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=None)


def open_order_count():
    """Commissions that still owe someone a published review."""
    return EditorialReview.query.filter(
        EditorialReview.status.in_(OPEN_STATUSES)
    ).count()


def availability():
    """What the sales page shows. Honest scarcity, same idea as
    sponsorship.inventory(): a queue length converts an open-ended ask into
    a decision, and a full month has to say so rather than quietly taking
    the money and the blame."""
    open_orders = open_order_count()
    published_this_month = EditorialReview.query.filter(
        EditorialReview.status == "published",
        EditorialReview.published_at.isnot(None),
        EditorialReview.published_at >= _month_start(),
    ).count()
    taken = open_orders + published_this_month
    return {
        "price": REVIEW_PRICE,
        "currency": "USD",
        "turnaround_days": TURNAROUND_DAYS,
        "capacity_per_month": MONTHLY_CAPACITY,
        "open_orders": open_orders,
        "published_this_month": published_this_month,
        "slots_left": max(0, MONTHLY_CAPACITY - taken),
        # Still purchasable when full — we just quote the honest longer wait
        # instead of pretending the queue does not exist.
        "queue_weeks": (
            (taken - MONTHLY_CAPACITY) // MONTHLY_CAPACITY + 1
            if taken >= MONTHLY_CAPACITY else 0
        ),
        "disclosure": DISCLOSURE,
    }


def published_review_for_slug(slug):
    """The one review a reader should see for this tool, or None.

    Newest published wins, so re-reviewing a tool after a major release is a
    matter of publishing a second row rather than editing history.
    """
    slug = str(slug or "").strip().lower()
    if not slug:
        return None
    return (
        EditorialReview.query
        .filter(EditorialReview.tool_slug == slug,
                EditorialReview.status == "published")
        .order_by(EditorialReview.published_at.desc(),
                  EditorialReview.id.desc())
        .first()
    )


def has_open_order(slug):
    slug = str(slug or "").strip().lower()
    if not slug:
        return False
    return EditorialReview.query.filter(
        EditorialReview.tool_slug == slug,
        EditorialReview.status.in_(OPEN_STATUSES),
    ).count() > 0


def public_payload(review):
    """What a reader (and a crawler) gets. Purchase details never appear
    here — who paid is between us and them; *that* it was paid for is the
    disclosure, and that is always included."""
    if review is None:
        return None
    return {
        "tool_slug": review.tool_slug,
        "headline": review.headline,
        "body": review.body or "",
        "verdict": review.verdict,
        "score": review.score,
        "pros": _load_list(review.pros),
        "cons": _load_list(review.cons),
        "screenshots": _load_list(review.screenshots),
        "author_name": review.author_name or "AI Compass editorial",
        "published_at": _iso(review.published_at),
        "updated_at": _iso(review.updated_at),
        "commissioned": True,
        "disclosure": DISCLOSURE,
    }


def admin_payload(review):
    """Everything, including the money and the brief."""
    out = public_payload(review) or {}
    out.update({
        "id": review.id,
        "status": review.status,
        "brief": review.brief,
        "amount_paid": review.amount_paid,
        "payment_ref": review.payment_ref,
        "contact_email": review.contact_email,
        "admin_note": review.admin_note,
        "created_at": _iso(review.created_at),
        "due_at": (
            _iso(_aware(review.created_at) + timedelta(days=TURNAROUND_DAYS))
            if review.created_at else None
        ),
    })
    return out


def create_order(tool_slug, contact_email=None, brief=None,
                 amount_paid=REVIEW_PRICE, payment_ref=None):
    """Records a paid commission. Returns (review, error_code).

    Callers must have verified the payment already — like create_slot(), this
    function does not know or care how the money was taken.
    """
    slug = str(tool_slug or "").strip().lower()
    if not slug:
        return None, "missing_tool_slug"

    if payment_ref:
        existing = EditorialReview.query.filter_by(payment_ref=payment_ref).first()
        if existing:
            # Idempotent: a retried capture returns the commission it already
            # bought instead of queueing a second one.
            return existing, None

    if has_open_order(slug):
        # Refusing *before* payment is the caller's job; reaching here means
        # money is already captured, so this is the last line of defence and
        # the endpoint turns it into a refund instruction rather than a
        # silent duplicate.
        return None, "review_already_in_progress"

    review = EditorialReview(
        tool_slug=slug,
        status="ordered",
        contact_email=(contact_email or None),
        brief=(brief or None),
        amount_paid=float(amount_paid or 0.0),
        payment_ref=payment_ref or None,
    )
    try:
        db.session.add(review)
        db.session.commit()
        return review, None
    except Exception:
        db.session.rollback()
        return None, "review_write_failed"


# Fields an admin may write. `body`, `verdict` and `score` are the review
# itself; the buyer can reach none of them.
_EDITABLE_TEXT = ("headline", "body", "verdict", "author_name", "admin_note")
_EDITABLE_LISTS = ("pros", "cons", "screenshots")


def update_review(review, fields):
    """Applies an admin edit, including status transitions. Returns an error
    code, or None on success.

    Publishing is gated on there actually being a review: a row that says
    "published" over an empty body is the one failure this product cannot
    have, because the founder has already sent the URL to their investors.
    """
    if review is None:
        return "not_found"

    for key in _EDITABLE_TEXT:
        if key in fields:
            value = str(fields.get(key) or "").strip()
            setattr(review, key, value or None)

    for key in _EDITABLE_LISTS:
        if key in fields:
            setattr(review, key, _dump_list(fields.get(key)))

    if "score" in fields:
        raw = fields.get("score")
        if raw in (None, ""):
            review.score = None
        else:
            try:
                review.score = max(0.0, min(5.0, round(float(raw), 1)))
            except (TypeError, ValueError):
                db.session.rollback()
                return "invalid_score"

    if "status" in fields:
        status = str(fields.get("status") or "").strip().lower()
        if status not in EditorialReview.STATUSES:
            db.session.rollback()
            return "invalid_status"
        if status == "published":
            if len(str(review.body or "").strip()) < 200:
                db.session.rollback()
                return "body_too_short_to_publish"
            if not review.verdict:
                db.session.rollback()
                return "verdict_required_to_publish"
            if review.published_at is None:
                review.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
        review.status = status

    try:
        db.session.commit()
        return None
    except Exception:
        db.session.rollback()
        return "review_write_failed"


def _paragraphs(body):
    return [p.strip() for p in str(body or "").split("\n\n") if p.strip()]


def seo_block(review, tool_name, esc):
    """Crawler-visible HTML for the review, injected into the /tools/<slug>
    shell by app/routes.py.

    The whole point of the product is an indexed, citable page — a review
    that exists only inside the React bundle is one Google may never read,
    so it is rendered server-side too. `esc` is passed in (rather than
    imported) to keep this module free of a routes.py import cycle.
    """
    if review is None:
        return ""
    parts = [f'<h2>{esc(review.headline or (tool_name + " review"))}</h2>']
    byline = esc(review.author_name or "AI Compass editorial")
    dated = _aware(review.published_at)
    when = f' on {dated.strftime("%d %B %Y")}' if dated else ""
    parts.append(f"<p>Hands-on review by {byline}{when}.</p>")
    if review.score is not None:
        parts.append(f"<p>Our score: {review.score} out of 5.</p>")
    for para in _paragraphs(review.body)[:12]:
        parts.append(f"<p>{esc(para)}</p>")
    for label, items in (("Pros", _load_list(review.pros)),
                         ("Cons", _load_list(review.cons))):
        rows = "".join(f"<li>{esc(item)}</li>" for item in items if isinstance(item, str))
        if rows:
            parts.append(f"<h3>{label}</h3><ul>{rows}</ul>")
    if review.verdict:
        parts.append(f"<h3>Verdict</h3><p>{esc(review.verdict)}</p>")
    parts.append(f"<p><em>{esc(DISCLOSURE)}</em></p>")
    return "".join(parts)
