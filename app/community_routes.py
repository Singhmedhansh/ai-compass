from datetime import datetime, timezone

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
    Submission,
)
from app.pricing_tiers import tier_for_pricing_model
from app.rate_limit import is_rate_limited

community_bp = Blueprint("community", __name__)

POST_TYPES = {"news", "question", "showcase", "discussion"}
FEATURED_TIERS = {"quick", "sponsored"}
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
    """A post is 'featured' if it references a tool whose submission is on a
    paid (quick/sponsored) tier, verified, and still within the boost window.
    Reuses the exact tier/payment fields already used for submission
    approval (app/pricing_tiers.py) — no new payment plumbing."""
    if not tool_slug:
        return False
    tool = CatalogTool.query.filter_by(slug=tool_slug).first()
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
        "can_delete": can_moderate,
    }


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
            key = lambda pl: by_id[pl["id"]].created_at
        elif sort == "top":
            key = lambda pl: pl["score"]
        else:  # hot
            key = lambda pl: _hot_score(by_id[pl["id"]])

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
        if post_type not in POST_TYPES:
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
        CommunityPost.query.get_or_404(post_id)
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
        CommunityComment.query.get_or_404(comment_id)
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
