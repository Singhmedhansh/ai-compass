from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy.orm import joinedload

from app import csrf, db
from app.models import (
    CatalogTool,
    CommentVote,
    CommunityComment,
    CommunityPost,
    PostVote,
    SponsorSlot,
    Submission,
    User,
)
from app.payments import sponsor_credentials, verify_paypal_order
from app.pricing_tiers import tier_for_pricing_model
from app.rate_limit import is_rate_limited
from app import community_leaderboard as lb
from app import sponsorship

community_bp = Blueprint("community", __name__)

POST_TYPES = {"news", "question", "showcase", "discussion"}

# A changelog post is a maker announcing a release on their OWN tool. It is
# the reason a claimed listing is an account rather than a receipt: the
# founder has a standing reason to come back. Restricted to the tool's
# claimed owner — anyone may post about any tool, but only its maker may
# speak as its maker, or the label means nothing.
OWNER_ONLY_POST_TYPES = {"changelog"}
# Includes the retired "quick" tier: rows bought before it was retired
# keep what they paid for.
FEATURED_TIERS = {"quick", "sponsored", "reviewed"}
FEATURED_WINDOW_DAYS = 30


def _author_name(user):
    if not user:
        return "Anonymous"
    return (
        getattr(user, "display_name", None)
        or getattr(user, "public_username", None)
        or getattr(user, "email", None)
        or "Anonymous"
    )


def _is_tool_featured(tool_slug):
    """A post is 'featured' when its tool is currently paying for visibility,
    by either of the two routes that exist:

      1. An active sponsor slot (rented weekly inventory). Every placement
         tier on /sponsor advertises a Featured badge on discussion threads,
         so this branch is what makes that promise true — without it we
         would be billing for a perk the code never delivers.
      2. A verified paid submission inside its boost window, which is how
         the feature originally shipped and what the one-time Fast-Track
         tier still grants.
    """
    slug = str(tool_slug or "").strip().lower()
    if not slug:
        return False

    if any(
        str(s.tool_slug or "").strip().lower() == slug
        for s in sponsorship.active_slots()
    ):
        return True

    tool = CatalogTool.query.filter_by(slug=slug).first()
    if not tool or not tool.submission_id:
        return False
    submission = Submission.query.get(tool.submission_id)
    if not submission or submission.payment_status != "verified":
        return False
    tier = tier_for_pricing_model(submission.pricing_model)
    if tier not in FEATURED_TIERS:
        return False
    age_days = (datetime.now(timezone.utc) - submission.submitted_at.replace(tzinfo=timezone.utc)).days
    return age_days <= FEATURED_WINDOW_DAYS


def _post_payload(post, comment_counts=None):
    score = sum(v.vote_type for v in post.votes)
    user_vote = None
    if current_user and current_user.is_authenticated:
        user_vote = next((v.vote_type for v in post.votes if v.user_id == current_user.id), None)
    comment_count = (
        comment_counts.get(post.id, 0)
        if comment_counts is not None
        else CommunityComment.query.filter_by(post_id=post.id, is_hidden=False).count()
    )
    can_moderate = bool(
        current_user and current_user.is_authenticated
        and (current_user.id == post.user_id or current_user.is_admin)
    )
    return {
        "id": post.id,
        "title": post.title,
        "body": post.body,
        "post_type": post.post_type,
        "tool_slug": post.tool_slug,
        "author": _author_name(post.user),
        "created_at": post.created_at.isoformat(),
        "score": score,
        "user_vote": user_vote,
        "comment_count": comment_count,
        "is_featured": _is_tool_featured(post.tool_slug),
        # True when the post is the tool's own maker speaking. Read live so a
        # revoked claim stops a historical post from still carrying the label.
        "by_maker": _is_by_maker(post),
        "can_delete": can_moderate,
    }


def _is_by_maker(post):
    """Is this post its tool's owner speaking as the owner?

    Computed rather than stored: a claim can be revoked, and a post that
    keeps claiming to be from the maker after that is a label nobody can
    trust. Cheap enough — one indexed lookup, and only for posts that name a
    tool at all.
    """
    if not post.tool_slug:
        return False
    try:
        from app import claims as claims_module

        claim = claims_module.approved_claim_for_slug(post.tool_slug)
        return bool(claim and claim.user_id == post.user_id)
    except Exception:
        return False


def _hot_score(post):
    score = sum(v.vote_type for v in post.votes)
    age_hours = max(0.0, (datetime.now(timezone.utc) - post.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600.0)
    return score / (age_hours + 2) ** 1.5


@community_bp.get("/posts")
def list_posts():
    try:
        sort = request.args.get("sort", "hot")
        tool_slug = request.args.get("tool_slug")
        page = max(1, int(request.args.get("page", 1)))
        per_page = 20

        query = CommunityPost.query.options(joinedload(CommunityPost.user), joinedload(CommunityPost.votes)).filter_by(is_hidden=False)
        if tool_slug:
            query = query.filter_by(tool_slug=tool_slug.strip().lower())

        posts = query.all()
        payloads = [_post_payload(p) for p in posts]

        # Featured posts (paid-tier tools) always pin to the top, then sort
        # normally within each group — the revenue hook for sponsored listings.
        featured = [p for p in payloads if p["is_featured"]]
        rest = [p for p in payloads if not p["is_featured"]]

        by_id = {p.id: p for p in posts}
        if sort == "new":
            def key(pl):
                return by_id[pl["id"]].created_at
        elif sort == "top":
            def key(pl):
                return pl["score"]
        else:  # hot
            def key(pl):
                return _hot_score(by_id[pl["id"]])

        featured.sort(key=key, reverse=True)
        rest.sort(key=key, reverse=True)
        ordered = featured + rest

        start = (page - 1) * per_page
        page_items = ordered[start:start + per_page]

        return jsonify({
            "posts": page_items,
            "count": len(ordered),
            "page": page,
            "has_more": start + per_page < len(ordered),
        })
    except Exception:
        current_app.logger.exception("community list_posts failed")
        return jsonify({"posts": [], "count": 0, "page": 1, "has_more": False}), 200


@community_bp.get("/posts/<int:post_id>")
def get_post(post_id: int):
    post = CommunityPost.query.options(joinedload(CommunityPost.user), joinedload(CommunityPost.votes)).filter_by(id=post_id, is_hidden=False).first()
    if not post:
        return jsonify({"error": "Post not found"}), 404

    comments = (
        CommunityComment.query.options(joinedload(CommunityComment.user), joinedload(CommunityComment.votes))
        .filter_by(post_id=post_id, is_hidden=False)
        .order_by(CommunityComment.created_at.asc())
        .all()
    )

    def comment_payload(c):
        score = sum(v.vote_type for v in c.votes)
        user_vote = None
        can_moderate = bool(
            current_user and current_user.is_authenticated
            and (current_user.id == c.user_id or current_user.is_admin)
        )
        if current_user and current_user.is_authenticated:
            user_vote = next((v.vote_type for v in c.votes if v.user_id == current_user.id), None)
        return {
            "id": c.id,
            "body": c.body,
            "author": _author_name(c.user),
            "created_at": c.created_at.isoformat(),
            "score": score,
            "user_vote": user_vote,
            "can_delete": can_moderate,
        }

    payload = _post_payload(post, comment_counts={post.id: len(comments)})
    payload["comments"] = [comment_payload(c) for c in comments]
    return jsonify(payload)


@community_bp.post("/posts")
@csrf.exempt
@login_required
def create_post():
    try:
        ip = request.remote_addr or "unknown"
        if is_rate_limited(f"community_post:{current_user.id}", limit=5, window_seconds=3600) or \
           is_rate_limited(f"community_post_ip:{ip}", limit=10, window_seconds=3600):
            return jsonify({"error": "You're posting too fast. Try again later."}), 429

        payload = request.get_json(silent=True) or {}
        title = str(payload.get("title") or "").strip()
        body = str(payload.get("body") or "").strip()
        post_type = str(payload.get("post_type") or "discussion").strip().lower()
        tool_slug = payload.get("tool_slug")
        tool_slug = str(tool_slug).strip().lower() if tool_slug else None

        if len(title) < 5 or len(title) > 200:
            return jsonify({"error": "Title must be 5-200 characters"}), 400
        if len(body) < 10 or len(body) > 2000:
            return jsonify({"error": "Body must be 10-2000 characters"}), 400
        if post_type in OWNER_ONLY_POST_TYPES:
            from app import claims as claims_module

            if not tool_slug:
                return jsonify({
                    "error": "A changelog post has to name the tool it is about.",
                }), 400
            if not claims_module.user_can_edit(current_user, tool_slug):
                return jsonify({
                    "error": "Only the maker of a claimed listing can post a changelog for it. "
                             "Claim the listing on its page first.",
                }), 403
        elif post_type not in POST_TYPES:
            post_type = "discussion"

        post = CommunityPost(
            user_id=current_user.id,
            title=title,
            body=body,
            post_type=post_type,
            tool_slug=tool_slug or None,
        )
        db.session.add(post)
        db.session.commit()
        return jsonify({"success": True, "id": post.id}), 201
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community create_post failed")
        return jsonify({"error": "Could not create post"}), 500


@community_bp.delete("/posts/<int:post_id>")
@csrf.exempt
@login_required
def delete_post(post_id: int):
    post = CommunityPost.query.get_or_404(post_id)
    if post.user_id != current_user.id and not current_user.is_admin:
        return jsonify({"error": "Not allowed"}), 403
    try:
        db.session.delete(post)
        db.session.commit()
        return jsonify({"success": True})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community delete_post failed")
        return jsonify({"error": "Could not delete post"}), 500


@community_bp.post("/posts/<int:post_id>/vote")
@csrf.exempt
@login_required
def vote_post(post_id: int):
    try:
        post = CommunityPost.query.get_or_404(post_id)
        if post.user_id == current_user.id:
            return jsonify({"error": "You can't vote on your own post"}), 403

        ip = request.remote_addr or "unknown"
        if is_rate_limited(f"community_vote:{current_user.id}", limit=60, window_seconds=3600) or \
           is_rate_limited(f"community_vote_ip:{ip}", limit=120, window_seconds=3600):
            return jsonify({"error": "You're voting too fast. Try again later."}), 429

        payload = request.get_json(silent=True) or {}
        vote_type = payload.get("vote_type")
        if vote_type not in (1, -1, 0):
            return jsonify({"error": "Invalid vote type"}), 400

        existing = PostVote.query.filter_by(post_id=post_id, user_id=current_user.id).first()
        if vote_type == 0:
            if existing:
                db.session.delete(existing)
        elif existing:
            existing.vote_type = vote_type
        else:
            db.session.add(PostVote(post_id=post_id, user_id=current_user.id, vote_type=vote_type))
        db.session.commit()

        votes = PostVote.query.filter_by(post_id=post_id).all()
        return jsonify({"success": True, "score": sum(v.vote_type for v in votes)})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community vote_post failed")
        return jsonify({"error": "Could not save vote"}), 500


@community_bp.post("/posts/<int:post_id>/comments")
@csrf.exempt
@login_required
def create_comment(post_id: int):
    try:
        CommunityPost.query.get_or_404(post_id)
        ip = request.remote_addr or "unknown"
        if is_rate_limited(f"community_comment:{current_user.id}", limit=20, window_seconds=3600) or \
           is_rate_limited(f"community_comment_ip:{ip}", limit=40, window_seconds=3600):
            return jsonify({"error": "You're commenting too fast. Try again later."}), 429

        payload = request.get_json(silent=True) or {}
        body = str(payload.get("body") or "").strip()
        if len(body) < 2 or len(body) > 1000:
            return jsonify({"error": "Comment must be 2-1000 characters"}), 400

        comment = CommunityComment(post_id=post_id, user_id=current_user.id, body=body)
        db.session.add(comment)
        db.session.commit()
        return jsonify({"success": True, "id": comment.id}), 201
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community create_comment failed")
        return jsonify({"error": "Could not save comment"}), 500


@community_bp.delete("/comments/<int:comment_id>")
@csrf.exempt
@login_required
def delete_comment(comment_id: int):
    comment = CommunityComment.query.get_or_404(comment_id)
    if comment.user_id != current_user.id and not current_user.is_admin:
        return jsonify({"error": "Not allowed"}), 403
    try:
        db.session.delete(comment)
        db.session.commit()
        return jsonify({"success": True})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community delete_comment failed")
        return jsonify({"error": "Could not delete comment"}), 500


@community_bp.post("/comments/<int:comment_id>/vote")
@csrf.exempt
@login_required
def vote_comment(comment_id: int):
    try:
        comment = CommunityComment.query.get_or_404(comment_id)
        if comment.user_id == current_user.id:
            return jsonify({"error": "You can't vote on your own comment"}), 403

        ip = request.remote_addr or "unknown"
        if is_rate_limited(f"community_vote:{current_user.id}", limit=60, window_seconds=3600) or \
           is_rate_limited(f"community_vote_ip:{ip}", limit=120, window_seconds=3600):
            return jsonify({"error": "You're voting too fast. Try again later."}), 429

        payload = request.get_json(silent=True) or {}
        vote_type = payload.get("vote_type")
        if vote_type not in (1, -1, 0):
            return jsonify({"error": "Invalid vote type"}), 400

        existing = CommentVote.query.filter_by(comment_id=comment_id, user_id=current_user.id).first()
        if vote_type == 0:
            if existing:
                db.session.delete(existing)
        elif existing:
            existing.vote_type = vote_type
        else:
            db.session.add(CommentVote(comment_id=comment_id, user_id=current_user.id, vote_type=vote_type))
        db.session.commit()

        votes = CommentVote.query.filter_by(comment_id=comment_id).all()
        return jsonify({"success": True, "score": sum(v.vote_type for v in votes)})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("community vote_comment failed")
        return jsonify({"error": "Could not save vote"}), 500


# ---------------------------------------------------------------------------
# Leaderboards
#
# Two boards, one shape: {period, rows, updated_at}. Both are computed live
# from existing tables (see community_leaderboard) so there is no cron job
# to fall behind and no cached rank to contradict the feed underneath it.
# ---------------------------------------------------------------------------

VALID_PERIODS = ("week", "month", "all")


def _period_arg():
    period = str(request.args.get("period") or "week").strip().lower()
    return period if period in VALID_PERIODS else "week"


def _limit_arg(default=10, ceiling=50):
    try:
        limit = int(request.args.get("limit", default))
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, ceiling))


@community_bp.get("/leaderboard")
def leaderboard():
    """Tools ranked by community activity in the period.

    Sponsored units are returned alongside but never inside `rows` — the
    board's credibility is the asset the sponsorship is sold against, so
    money buys a labelled unit, never a rank.
    """
    period = _period_arg()
    limit = _limit_arg(10, 50)

    try:
        rows = lb.board(period)
    except Exception:
        current_app.logger.exception("community leaderboard failed")
        return jsonify({"period": period, "rows": [], "total": 0}), 200

    tools = sponsorship._tools_by_slug()
    enriched = []
    for row in rows[:limit]:
        card = sponsorship._tool_card(tools.get(row["slug"]), row["slug"])
        enriched.append({
            **card,
            "rank": row["rank"],
            "score": row["score"],
            "movement": row["movement"],
            "is_new": row["is_new"],
            "posts": row["breakdown"]["posts"],
            "comments": row["breakdown"]["comments"],
            "upvotes": row["breakdown"]["post_upvotes"] + row["breakdown"]["trending_upvotes"],
        })

    return jsonify({
        "period": period,
        "rows": enriched,
        "total": len(rows),
        "weights": lb.TOOL_WEIGHTS,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


@community_bp.get("/builders")
def builders():
    """People ranked by contribution reputation in the period."""
    period = _period_arg()
    limit = _limit_arg(10, 50)
    try:
        rows = lb.score_builders(period, limit=limit)
    except Exception:
        current_app.logger.exception("community builders failed")
        return jsonify({"period": period, "rows": [], "total": 0}), 200

    me = None
    if current_user and current_user.is_authenticated:
        me = next((r for r in rows if r["user_id"] == current_user.id), None)

    return jsonify({
        "period": period,
        "rows": rows,
        "total": len(rows),
        "you": me,
        "weights": lb.BUILDER_WEIGHTS,
        "ranks": [
            {"at": at, "label": label, "key": key}
            for at, label, key in lb.BUILDER_RANKS
        ],
    })


@community_bp.get("/stats")
def stats():
    """The pulse numbers above the fold.

    Doubles as the sponsor pitch: an advertiser reads these before deciding
    the surface is worth $39, so they are computed from real rows only —
    there is no floor, no rounding up, and an empty community reports zeros.
    """
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).replace(tzinfo=None)
        posts_total = CommunityPost.query.filter_by(is_hidden=False).count()
        posts_week = CommunityPost.query.filter(
            CommunityPost.is_hidden.is_(False),
            CommunityPost.created_at >= week_ago,
        ).count()
        comments_total = CommunityComment.query.filter_by(is_hidden=False).count()
        votes_total = PostVote.query.count() + CommentVote.query.count()
        members = User.query.count()
        discussed_tools = (
            db.session.query(CommunityPost.tool_slug)
            .filter(CommunityPost.tool_slug.isnot(None), CommunityPost.is_hidden.is_(False))
            .distinct()
            .count()
        )
        return jsonify({
            "posts": posts_total,
            "posts_this_week": posts_week,
            "comments": comments_total,
            "votes": votes_total,
            "members": members,
            "tools_discussed": discussed_tools,
        })
    except Exception:
        current_app.logger.exception("community stats failed")
        return jsonify({
            "posts": 0, "posts_this_week": 0, "comments": 0,
            "votes": 0, "members": 0, "tools_discussed": 0,
        }), 200


# ---------------------------------------------------------------------------
# Sponsored placements
# ---------------------------------------------------------------------------

@community_bp.get("/sponsors")
def sponsors():
    """The sponsored units to render, plus what is still for sale."""
    try:
        units = sponsorship.sponsored_units()
        return jsonify({
            "hero": units["hero"],
            "board": units["board"],
            "rail": units["rail"],
            "inventory": sponsorship.inventory(),
        })
    except Exception:
        current_app.logger.exception("community sponsors failed")
        # The degraded path has to actually degrade. On Postgres a failed
        # statement aborts the whole transaction, so the inventory() call
        # that used to sit unguarded here raised PendingRollbackError and
        # turned a handled failure into a 500 — taking /community and the
        # /sponsor sales page down with it. Roll back first, then treat the
        # fallback as fallible too.
        try:
            db.session.rollback()
        except Exception:
            current_app.logger.exception("community sponsors rollback failed")
        try:
            inventory = sponsorship.inventory()
        except Exception:
            current_app.logger.exception("community sponsors inventory fallback failed")
            inventory = []
        return jsonify({
            "hero": [], "board": [], "rail": [],
            "inventory": inventory,
        }), 200


@community_bp.get("/sponsors/inventory")
def sponsor_inventory():
    """Availability only — cheap enough for the /sponsor sales page to poll."""
    try:
        return jsonify({"inventory": sponsorship.inventory()})
    except Exception:
        current_app.logger.exception("community sponsor_inventory failed")
        try:
            db.session.rollback()
        except Exception:
            current_app.logger.exception("community sponsor_inventory rollback failed")
        return jsonify({"inventory": []}), 200


@community_bp.post("/sponsors/impression")
@csrf.exempt
def sponsor_impression():
    """Beacon fired once per rendered sponsored unit.

    Rate-limited per IP because the whole value of the number is that a
    sponsor can trust it; an endpoint anyone can inflate reports nothing.
    Always answers 200 — a dropped beacon is an undercount, not an error the
    visitor should ever see.
    """
    payload = request.get_json(silent=True) or {}
    slug = str(payload.get("tool_slug") or "").strip().lower()
    placement = str(payload.get("placement") or "rail").strip().lower()
    slot_id = payload.get("slot_id")
    try:
        slot_id = int(slot_id) if slot_id is not None else None
    except (TypeError, ValueError):
        slot_id = None

    if not slug:
        return jsonify({"recorded": False}), 200

    ip = request.remote_addr or "unknown"
    if is_rate_limited(f"sponsor_impr:{ip}:{slug}:{placement}", limit=6, window_seconds=3600):
        return jsonify({"recorded": False, "throttled": True}), 200

    return jsonify({"recorded": sponsorship.record_impression(slug, placement, slot_id)}), 200


MAX_BOOKING_WEEKS = 12


@community_bp.post("/sponsors/checkout")
@csrf.exempt
def sponsor_checkout():
    """Books a slot against a PayPal order the server independently verified.

    The order id arrives from the browser and is therefore untrusted — it is
    checked against PayPal's own API for COMPLETED status *and* the exact
    amount for the placement and week count requested, because otherwise
    anyone could buy one week of the cheapest rail slot and claim twelve
    weeks of the spotlight. Mirrors the submit-tool flow's stance: a
    payment nobody could confirm is never treated as paid.
    """
    payload = request.get_json(silent=True) or {}
    placement = str(payload.get("placement") or "").strip().lower()
    tool_slug = str(payload.get("tool_slug") or "").strip().lower()
    order_id = str(payload.get("order_id") or "").strip()
    contact_email = str(payload.get("contact_email") or "").strip() or None

    try:
        weeks = int(payload.get("weeks", 1))
    except (TypeError, ValueError):
        weeks = 1
    weeks = max(1, min(weeks, MAX_BOOKING_WEEKS))

    if placement not in sponsorship.PLACEMENT_CAPACITY:
        return jsonify({"error": "Unknown placement"}), 400
    if not sponsorship.is_for_sale(placement):
        # Checked before any payment work: refusing after capture would mean
        # holding money for a tier we have not committed to delivering.
        return jsonify({
            "error": "That placement isn't on sale yet. Email admin@ai-compass.in and we'll "
                     "arrange it manually.",
        }), 400
    if not tool_slug:
        return jsonify({"error": "A tool is required"}), 400
    if not order_id:
        return jsonify({"error": "Missing payment reference"}), 400

    tool = CatalogTool.query.filter_by(slug=tool_slug).first()
    if not tool:
        return jsonify({
            "error": "That tool isn't in the catalog yet. Submit it first, then book a placement.",
        }), 400

    ip = request.remote_addr or "unknown"
    if is_rate_limited(f"sponsor_checkout:{ip}", limit=8, window_seconds=3600):
        return jsonify({"error": "Too many checkout attempts. Please try again later."}), 429

    expected = round(sponsorship.PLACEMENT_PRICING[placement] * weeks, 2)
    sponsor_client_id, sponsor_secret, sponsor_mode = sponsor_credentials()
    verified, detail = verify_paypal_order(
        order_id,
        expected_amount=expected,
        client_id=sponsor_client_id,
        client_secret=sponsor_secret,
        mode=sponsor_mode,
    )
    if not verified:
        # "PayPal says this isn't a real payment" and "we couldn't reach
        # PayPal" need different words. Telling someone whose charge may have
        # gone through to just try again is how a buyer gets billed twice.
        from app.payments import VERIFY_INDETERMINATE, classify_failure

        outcome = classify_failure(detail)
        if outcome == VERIFY_INDETERMINATE:
            current_app.logger.error(
                "UNRESOLVED sponsor checkout — payment may be genuine. "
                "placement=%s weeks=%s order=%s reason=%s",
                placement, weeks, order_id, detail,
            )
            return jsonify({
                "error": "We couldn't reach PayPal to confirm this payment, so we haven't booked "
                         "the slot yet. Please do NOT pay again — if you were charged, email "
                         "admin@ai-compass.in with your order ID and we'll book it manually or "
                         "refund you.",
                "reason": detail,
                "outcome": outcome,
            }), 503

        current_app.logger.warning(
            "sponsor checkout rejected: placement=%s weeks=%s order=%s reason=%s",
            placement, weeks, order_id, detail,
        )
        return jsonify({
            "error": "PayPal could not confirm that payment. Nothing has been booked and you have "
                     "not been charged by us — email admin@ai-compass.in with your order ID if you "
                     "believe this is wrong.",
            "reason": detail,
            "outcome": outcome,
        }), 402

    slot, err = sponsorship.create_slot(
        tool_slug=tool_slug,
        placement=placement,
        weeks=weeks,
        amount_paid=expected,
        payment_ref=order_id,
        contact_email=contact_email,
        headline=str(payload.get("headline") or "").strip()[:140] or None,
        blurb=str(payload.get("blurb") or "").strip()[:280] or None,
        cta_label=str(payload.get("cta_label") or "").strip()[:40] or None,
        submission_id=tool.submission_id,
    )
    if err or not slot:
        current_app.logger.error("sponsor checkout paid but slot write failed: %s", err)
        return jsonify({
            "error": "Your payment went through but we couldn't schedule the slot automatically. "
                     "Email admin@ai-compass.in with your order ID — we'll place it manually.",
            "reason": err,
        }), 500

    return jsonify({"success": True, "slot": sponsorship.slot_payload(slot)}), 201


# --- admin slot management -------------------------------------------------

def _require_admin():
    if not (current_user and current_user.is_authenticated and current_user.is_admin):
        return jsonify({"error": "Forbidden"}), 403
    return None


@community_bp.get("/admin/slots")
@login_required
def admin_list_slots():
    denied = _require_admin()
    if denied:
        return denied
    slots = SponsorSlot.query.order_by(SponsorSlot.ends_at.desc()).limit(200).all()
    return jsonify({
        "slots": [
            {
                **sponsorship.slot_payload(s),
                **sponsorship.delivery_report(s.tool_slug, days=90),
            }
            for s in slots
        ],
        "inventory": sponsorship.inventory(),
    })


@community_bp.post("/admin/slots")
@csrf.exempt
@login_required
def admin_create_slot():
    """Manual placement — comp slots, make-goods, and invoiced deals that
    never went through PayPal."""
    denied = _require_admin()
    if denied:
        return denied

    payload = request.get_json(silent=True) or {}
    try:
        weeks = max(1, min(int(payload.get("weeks", 1)), MAX_BOOKING_WEEKS))
    except (TypeError, ValueError):
        weeks = 1

    slot, err = sponsorship.create_slot(
        tool_slug=payload.get("tool_slug"),
        placement=str(payload.get("placement") or "rail").strip().lower(),
        weeks=weeks,
        amount_paid=payload.get("amount_paid") or 0.0,
        contact_email=payload.get("contact_email"),
        headline=payload.get("headline"),
        blurb=payload.get("blurb"),
        cta_label=payload.get("cta_label"),
    )
    if err or not slot:
        return jsonify({"error": err or "Could not create slot"}), 400
    return jsonify({"success": True, "slot": sponsorship.slot_payload(slot)}), 201


@community_bp.patch("/admin/slots/<int:slot_id>")
@csrf.exempt
@login_required
def admin_update_slot(slot_id):
    """Extend, edit copy, or pause a slot."""
    denied = _require_admin()
    if denied:
        return denied

    slot = SponsorSlot.query.get_or_404(slot_id)
    payload = request.get_json(silent=True) or {}

    if "is_active" in payload:
        slot.is_active = bool(payload["is_active"])
    for field, limit in (("headline", 140), ("blurb", 280), ("cta_label", 40)):
        if field in payload:
            value = str(payload[field] or "").strip()[:limit]
            setattr(slot, field, value or None)
    if payload.get("extend_weeks"):
        try:
            extra = max(1, min(int(payload["extend_weeks"]), MAX_BOOKING_WEEKS))
            slot.ends_at = slot.ends_at + timedelta(days=7 * extra)
        except (TypeError, ValueError):
            pass

    try:
        db.session.commit()
        return jsonify({"success": True, "slot": sponsorship.slot_payload(slot)})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("admin_update_slot failed")
        return jsonify({"error": "Could not update slot"}), 500


@community_bp.delete("/admin/slots/<int:slot_id>")
@csrf.exempt
@login_required
def admin_delete_slot(slot_id):
    denied = _require_admin()
    if denied:
        return denied
    slot = SponsorSlot.query.get_or_404(slot_id)
    try:
        db.session.delete(slot)
        db.session.commit()
        return jsonify({"success": True})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("admin_delete_slot failed")
        return jsonify({"error": "Could not delete slot"}), 500


@community_bp.get("/sponsors/<slug>/report")
@login_required
def sponsor_report(slug):
    """Delivery numbers for one tool — the sponsor's own ROI view.

    Restricted to the account whose verified submission owns the listing (or
    an admin), because impressions and CTR are the sponsor's commercial data,
    not public directory stats.
    """
    slug = str(slug or "").strip().lower()
    try:
        days = int(request.args.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 180))

    tool = CatalogTool.query.filter_by(slug=slug).first()
    if not tool:
        return jsonify({"error": "Tool not found"}), 404

    if not current_user.is_admin:
        submission = Submission.query.get(tool.submission_id) if tool.submission_id else None
        owner_email = (getattr(submission, "submitter_email", None) or "").strip().lower()
        if not owner_email or owner_email != (current_user.email or "").strip().lower():
            return jsonify({"error": "Not allowed"}), 403

    try:
        report = sponsorship.delivery_report(slug, days=days)
        report["slots"] = [
            {
                "id": s.id,
                "placement": s.placement,
                "label": sponsorship.PLACEMENT_LABELS.get(s.placement, s.placement),
                "ends_at": sponsorship._aware(s.ends_at).isoformat(),
            }
            for s in sponsorship.active_slots()
            if str(s.tool_slug or "").strip().lower() == slug
        ]
        return jsonify(report)
    except Exception:
        current_app.logger.exception("community sponsor_report failed")
        return jsonify({"error": "Could not build report"}), 500
