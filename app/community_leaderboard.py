"""Scoring engine for the community leaderboards.

Two separate boards, deliberately scored from different signals:

  * The Tool Board ranks *tools* by what the community actually did with
    them in a period (voted, discussed, clicked through). This is the
    surface sponsors want to be next to, which is exactly why paid money
    must never buy a rank on it — sponsored units are rendered as a
    separately labelled row (see community_routes.sponsors) and are scored
    at zero here. A board that can be bought is a board nobody reads, and a
    board nobody reads has no sponsorship inventory worth selling.

  * The Builder Board ranks *people* by contribution karma. It exists to
    give the feed a reason to come back to daily, which is what turns a
    dead directory comment section into inventory in the first place.

Everything is computed from tables that already exist (post/comment votes,
trending votes, outbound clicks) plus the new sponsor tables — no
background job, no denormalized counter to drift out of sync.
"""

from datetime import datetime, timedelta, timezone

from app.models import (
    CommentVote,
    CommunityComment,
    CommunityPost,
    OutboundClick,
    PostVote,
    TrendingVote,
    User,
)

# Weights are intentionally coarse and readable rather than tuned: the point
# of a public leaderboard is that a builder can predict what moves them up.
TOOL_WEIGHTS = {
    "post": 6,
    "post_upvote": 4,
    "comment": 3,
    "trending_upvote": 2,
    "click": 3,
}

# Clicks are scored on a square root rather than linearly. Without this the
# board stops being a community board: a catalogue tool with a few hundred
# passive click-throughs outscores anything people actually discussed, and
# nobody can move the ranking by participating. Damped, 150 clicks is worth
# ~37 points (six posts' worth) instead of 150 — real weight, not a veto.
def click_points(clicks: int) -> int:
    return int(round((clicks ** 0.5) * TOOL_WEIGHTS["click"]))

BUILDER_WEIGHTS = {
    "post": 6,
    "comment": 2,
    "upvote_received": 3,
}

PERIODS = {
    "week": 7,
    "month": 30,
    "all": None,
}

# Karma thresholds for the public rank names shown next to a builder. Kept
# ascending; resolve_builder_rank walks it forwards and keeps the last hit.
BUILDER_RANKS = [
    (0, "Explorer", "explorer"),
    (50, "Navigator", "navigator"),
    (150, "Cartographer", "cartographer"),
    (400, "Pathfinder", "pathfinder"),
    (1000, "Compass Keeper", "keeper"),
]


def period_start(period: str):
    """UTC datetime the period opened, or None for all-time."""
    days = PERIODS.get(period, PERIODS["week"])
    if days is None:
        return None
    return datetime.now(timezone.utc) - timedelta(days=days)


def _aware(value):
    """DB datetimes come back naive; compare them as UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _in_window(value, since, until=None):
    stamped = _aware(value)
    if stamped is None:
        return False
    if since is not None and stamped < since:
        return False
    if until is not None and stamped >= until:
        return False
    return True


def resolve_builder_rank(karma: int):
    label, key = BUILDER_RANKS[0][1], BUILDER_RANKS[0][2]
    for threshold, name, slug in BUILDER_RANKS:
        if karma >= threshold:
            label, key = name, slug
    return {"label": label, "key": key}


def next_builder_rank(karma: int):
    """What the builder is climbing toward — the progress bar needs a target."""
    for threshold, name, slug in BUILDER_RANKS:
        if karma < threshold:
            return {"label": name, "key": slug, "at": threshold}
    return None


def _tool_signal_counts(since, until=None):
    """Raw per-slug tallies for the tool board, one pass per source table."""
    counts = {}

    def bucket(slug):
        key = str(slug or "").strip().lower()
        if not key:
            return None
        return counts.setdefault(key, {
            "posts": 0, "comments": 0, "post_upvotes": 0,
            "trending_upvotes": 0, "clicks": 0,
        })

    posts = CommunityPost.query.filter_by(is_hidden=False).all()
    posts_by_id = {p.id: p for p in posts}
    for post in posts:
        entry = bucket(post.tool_slug)
        if entry is not None and _in_window(post.created_at, since, until):
            entry["posts"] += 1

    for vote in PostVote.query.filter_by(vote_type=1).all():
        post = posts_by_id.get(vote.post_id)
        if not post:
            continue
        entry = bucket(post.tool_slug)
        if entry is not None and _in_window(vote.created_at, since, until):
            entry["post_upvotes"] += 1

    for comment in CommunityComment.query.filter_by(is_hidden=False).all():
        post = posts_by_id.get(comment.post_id)
        if not post:
            continue
        entry = bucket(post.tool_slug)
        if entry is not None and _in_window(comment.created_at, since, until):
            entry["comments"] += 1

    for vote in TrendingVote.query.filter_by(vote_type=1).all():
        entry = bucket(vote.tool_slug)
        if entry is not None and _in_window(vote.created_at, since, until):
            entry["trending_upvotes"] += 1

    for click in OutboundClick.query.all():
        entry = bucket(click.slug)
        if entry is not None and _in_window(click.created_at, since, until):
            entry["clicks"] += 1

    return counts


def _score_from_counts(c):
    return (
        c["posts"] * TOOL_WEIGHTS["post"]
        + c["post_upvotes"] * TOOL_WEIGHTS["post_upvote"]
        + c["comments"] * TOOL_WEIGHTS["comment"]
        + c["trending_upvotes"] * TOOL_WEIGHTS["trending_upvote"]
        + click_points(c["clicks"])
    )


def _ranked(counts):
    scored = []
    for slug, c in counts.items():
        score = _score_from_counts(c)
        if score <= 0:
            continue
        scored.append({"slug": slug, "score": score, "breakdown": c})
    scored.sort(key=lambda row: (-row["score"], row["slug"]))
    return scored


def score_tools(period: str = "week"):
    """[{slug, score, breakdown}] for the period, highest first."""
    return _ranked(_tool_signal_counts(period_start(period)))


def board(period: str = "week"):
    """The tool board with rank and movement resolved in one pass.

    Movement compares this window against the window immediately before it,
    which is what makes the board feel alive rather than a static top ten —
    a tool that jumped six places is the thing people screenshot and share.
    """
    current = score_tools(period)

    days = PERIODS.get(period, 7)
    prev_rank = {}
    if days is not None:
        now = datetime.now(timezone.utc)
        prev = _ranked(_tool_signal_counts(
            since=now - timedelta(days=days * 2),
            until=now - timedelta(days=days),
        ))
        prev_rank = {row["slug"]: i + 1 for i, row in enumerate(prev)}

    rows = []
    for i, row in enumerate(current):
        rank = i + 1
        was = prev_rank.get(row["slug"])
        rows.append({
            **row,
            "rank": rank,
            # None = no ranked activity in the previous window, i.e. "new".
            "movement": None if was is None else was - rank,
            "is_new": was is None,
        })
    return rows


def score_builders(period: str = "week", limit: int = 20):
    """Top contributors with karma, activity counts, and rank badge."""
    since = period_start(period)
    stats = {}

    def bucket(user_id):
        return stats.setdefault(user_id, {"posts": 0, "comments": 0, "upvotes": 0})

    posts = CommunityPost.query.filter_by(is_hidden=False).all()
    posts_by_id = {p.id: p for p in posts}
    for post in posts:
        if _in_window(post.created_at, since):
            bucket(post.user_id)["posts"] += 1

    comments = CommunityComment.query.filter_by(is_hidden=False).all()
    comments_by_id = {c.id: c for c in comments}
    for comment in comments:
        if _in_window(comment.created_at, since):
            bucket(comment.user_id)["comments"] += 1

    # Upvotes *received* — credited to the author of the voted-on content, so
    # writing something people actually value outranks sheer volume.
    for vote in PostVote.query.filter_by(vote_type=1).all():
        post = posts_by_id.get(vote.post_id)
        if post and _in_window(vote.created_at, since):
            bucket(post.user_id)["upvotes"] += 1

    for vote in CommentVote.query.filter_by(vote_type=1).all():
        comment = comments_by_id.get(vote.comment_id)
        if comment and _in_window(vote.created_at, since):
            bucket(comment.user_id)["upvotes"] += 1

    if not stats:
        return []

    users = {u.id: u for u in User.query.filter(User.id.in_(list(stats.keys()))).all()}

    rows = []
    for user_id, s in stats.items():
        karma = (
            s["posts"] * BUILDER_WEIGHTS["post"]
            + s["comments"] * BUILDER_WEIGHTS["comment"]
            + s["upvotes"] * BUILDER_WEIGHTS["upvote_received"]
        )
        if karma <= 0:
            continue
        user = users.get(user_id)
        rows.append({
            "user_id": user_id,
            "name": display_name(user),
            "username": getattr(user, "public_username", None),
            "avatar": getattr(user, "oauth_picture_url", None),
            "is_public": bool(getattr(user, "is_profile_public", False)),
            "karma": karma,
            "posts": s["posts"],
            "comments": s["comments"],
            "upvotes": s["upvotes"],
            "rank_badge": resolve_builder_rank(karma),
            "next_rank": next_builder_rank(karma),
        })

    rows.sort(key=lambda r: (-r["karma"], r["name"].lower()))
    for i, row in enumerate(rows):
        row["rank"] = i + 1
    return rows[:limit]


def display_name(user):
    if not user:
        return "Anonymous"
    name = (
        getattr(user, "display_name", None)
        or getattr(user, "public_username", None)
    )
    if name:
        return name
    email = getattr(user, "email", None) or ""
    return email.split("@")[0] if email else "Anonymous"
