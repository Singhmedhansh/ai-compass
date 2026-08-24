from datetime import datetime, timezone

from flask_login import UserMixin

from app import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=True)  # Nullable for OAuth-only accounts
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    display_name = db.Column(db.String(255), nullable=True)
    oauth_picture_url = db.Column(db.String(500), nullable=True)
    oauth_provider = db.Column(db.String(50), nullable=True)
    student_status = db.Column(db.Boolean, nullable=False, default=False)
    first_login = db.Column(db.Boolean, nullable=False, default=True)
    onboarding_completed = db.Column(db.Boolean, nullable=False, default=False)
    preferences = db.Column(db.Text, nullable=True)
    interests = db.Column(db.Text, nullable=True)
    skill_level = db.Column(db.String(32), nullable=True)
    pricing_pref = db.Column(db.String(32), nullable=True)
    goals = db.Column(db.Text, nullable=True)
    theme_preference = db.Column(db.String(20), nullable=True)
    notifications_enabled = db.Column(db.Boolean, nullable=False, default=True)
    is_verified = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    is_profile_public = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    public_username = db.Column(db.String(255), unique=True, nullable=True, index=True)
    bio = db.Column(db.Text, nullable=True)
    github_username = db.Column(db.String(255), nullable=True)
    linkedin_username = db.Column(db.String(255), nullable=True)
    twitter_username = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    favorites = db.relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    linked_accounts = db.relationship("LinkedAccount", back_populates="user", cascade="all, delete-orphan")
    sessions = db.relationship("UserSession", back_populates="user", cascade="all, delete-orphan")



class AppSetting(db.Model):
    """Tiny key/value store for server-managed settings that must survive
    deploys (e.g. a generated SECRET_KEY when none is provided via env)."""

    __tablename__ = "app_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=False)


class CatalogTool(db.Model):
    """Durable, editable catalog. tools.json becomes a one-time seed; from
    then on this DB table is the source of truth so admin edits survive
    Render's ephemeral filesystem. The full normalized record (all ~40
    fields) lives in `data`; the columns are just for fast query/filter.
    """

    __tablename__ = "catalog_tools"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    category = db.Column(db.String(100), nullable=True, index=True)
    hidden = db.Column(db.Boolean, nullable=False, default=False, index=True)
    # Staggered-release gate: a tool with visible_at in the future is kept out
    # of get_visible_tools() (public catalog) even though hidden=False, then
    # becomes visible automatically once now() passes it — no cron needed,
    # the read-path filter in tool_cache.get_visible_tools() just re-evaluates
    # this on every call. NULL means no release delay.
    visible_at = db.Column(db.DateTime, nullable=True, index=True)
    affiliate_url = db.Column(db.String(500), nullable=True)
    data = db.Column(db.Text, nullable=False)  # full normalized tool dict (JSON)
    sort_order = db.Column(db.Integer, nullable=True, index=True)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    # Soft reference back to the Submission that created this row (set on
    # approval) — lets the submitter dashboard resolve "this submission's
    # live listing" without matching by slug/name. No FK constraint, same
    # spirit as OutboundClick.slug not being one either.
    submission_id = db.Column(db.Integer, nullable=True, index=True)


class FeatureFlag(db.Model):
    """Simple key/value site toggles editable from the admin panel."""

    __tablename__ = "feature_flags"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False, index=True)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    value = db.Column(db.Text, nullable=True)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class OutboundClick(db.Model):
    """One row per /go/<slug> click — powers the admin analytics view
    (revenue signal: which tools people actually click through to)."""

    __tablename__ = "outbound_clicks"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(255), nullable=False, index=True)
    is_affiliate = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )


class ToolPageView(db.Model):
    """One row per tool-detail-page view — the 'views' half of the
    submitter-dashboard views-vs-clicks signal, mirrors OutboundClick.
    Best-effort/directional (client-side deduped, no server-side per-IP
    debounce) — not a fraud-proof counter."""

    __tablename__ = "tool_page_views"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(255), nullable=False, index=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )


class DigestState(db.Model):
    """Singleton (id=1) tracking which tool slugs have already been
    announced, so the 'new tools' email only ever sends genuinely new
    additions. Stored in the DB (not a file) so it survives Render's
    ephemeral filesystem across deploys."""

    __tablename__ = "digest_state"

    id = db.Column(db.Integer, primary_key=True)
    known_slugs = db.Column(db.Text, nullable=True)  # JSON list
    last_sent_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Favorite(db.Model):
    __tablename__ = "favorites"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    tool_id = db.Column(db.String(64), nullable=False, index=True)

    user = db.relationship("User", back_populates="favorites")

    __table_args__ = (
        db.UniqueConstraint("user_id", "tool_id", name="uq_user_tool_favorite"),
    )


class ToolView(db.Model):
    __tablename__ = "tool_view_events"

    id = db.Column(db.Integer, primary_key=True)
    tool_name = db.Column(db.String(255), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class Submission(db.Model):
    __tablename__ = "submissions"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    website = db.Column(db.String(500), nullable=False)
    category = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    pricing_model = db.Column(db.String(50), nullable=False)
    student_perks = db.Column(db.Text, nullable=True)
    tags = db.Column(db.String(500), nullable=True)
    submitter_email = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    submitted_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    # 'unpaid' | 'verified' (server confirmed real payment) | 'unverified_review' (claimed
    # payment, could not be confirmed server-side — never auto-treated as paid) | 'rejected'
    payment_status = db.Column(db.String(20), nullable=False, default="unpaid")
    payment_note = db.Column(db.String(255), nullable=True)
    is_priority = db.Column(db.Boolean, nullable=False, default=False)


class NewsletterSubscriber(db.Model):
    __tablename__ = "newsletter_subscribers"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class ToolRating(db.Model):
    __tablename__ = "tool_ratings"

    id = db.Column(db.Integer, primary_key=True)
    tool_name = db.Column(db.String(255), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        db.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_tool_rating_range"),
        db.UniqueConstraint("tool_name", "user_id", name="uq_tool_rating_user_tool"),
    )


class Rating(db.Model):
    __tablename__ = "ratings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    value = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", backref="ratings")

    __table_args__ = (
        db.CheckConstraint("value >= 1 AND value <= 5", name="ck_rating_value_range"),
        db.UniqueConstraint("user_id", "tool_slug", name="uq_user_tool_rating"),
    )


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    body = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_hidden = db.Column(db.Boolean, default=False)

    user = db.relationship("User", backref="reviews")

    __table_args__ = (
        db.UniqueConstraint("user_id", "tool_slug", name="uq_user_tool_review"),
    )


class ReviewVote(db.Model):
    __tablename__ = "review_votes"

    id = db.Column(db.Integer, primary_key=True)
    review_id = db.Column(db.Integer, db.ForeignKey("reviews.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    vote_type = db.Column(db.Integer, nullable=False)  # 1 for upvote, -1 for downvote
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    review = db.relationship("Review", backref=db.backref("votes", cascade="all, delete-orphan"))
    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("review_id", "user_id", name="uq_review_user_vote"),
        db.CheckConstraint("vote_type = 1 OR vote_type = -1", name="ck_review_vote_type"),
    )



class SavedStack(db.Model):
    __tablename__ = "saved_stacks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    tools_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class BugReport(db.Model):
    __tablename__ = "bug_reports"

    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.Text, nullable=False)
    page_url = db.Column(db.String(500), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    status = db.Column(db.String(20), nullable=False, default="open", index=True)


tool_tags = db.Table('tool_tags',
    db.Column('tool_id', db.Integer, db.ForeignKey('tools.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tags.id'), primary_key=True)
)


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(100), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    
    tools = db.relationship("Tool", back_populates="category")


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(100), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)


class Tool(db.Model):
    __tablename__ = "tools"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    link = db.Column(db.String(500), nullable=True)
    icon = db.Column(db.String(500), nullable=True)
    price = db.Column(db.String(50), nullable=True)
    student_perk = db.Column(db.Boolean, default=False)
    rating = db.Column(db.Float, default=0.0)
    weekly_users = db.Column(db.Integer, default=0)
    launch_year = db.Column(db.Integer, nullable=True)
    is_active = db.Column(db.Boolean, default=True, index=True)
    academic_integrity_rating = db.Column(db.String(50), nullable=True)
    academic_warning = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True, index=True)
    category = db.relationship("Category", back_populates="tools")
    
    tags = db.relationship('Tag', secondary=tool_tags, lazy='subquery', backref=db.backref('tools', lazy=True))


class Feedback(db.Model):
    """User-submitted feedback from the floating widget on every page.

    Email is optional (the form allows fire-and-forget bug reports), page
    URL and user agent are auto-captured client-side so reproduction
    context is recorded with the message. `is_read` powers the unread
    badge in /admin -> Feedback tab.
    """

    __tablename__ = "feedback"

    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.Text, nullable=False)
    email = db.Column(db.String(255), nullable=True)
    page_url = db.Column(db.String(500), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", lazy="joined")


class SyllabusStack(db.Model):
    __tablename__ = "syllabus_stacks"

    id = db.Column(db.Integer, primary_key=True)
    share_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    course_name = db.Column(db.String(255), nullable=True)
    subject_area = db.Column(db.String(255), nullable=True)
    tools_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)





class LinkedAccount(db.Model):
    __tablename__ = "linked_accounts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    provider = db.Column(db.String(50), nullable=False)
    oauth_picture_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="linked_accounts")

    __table_args__ = (
        db.UniqueConstraint("user_id", "provider", name="uq_user_provider_linked"),
    )


class UserSession(db.Model):
    __tablename__ = "user_sessions"

    id = db.Column(db.Integer, primary_key=True)
    session_uuid = db.Column(db.String(100), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    ip_address = db.Column(db.String(100), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    location = db.Column(db.String(255), nullable=True)
    last_active_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="sessions")


class TrendingVote(db.Model):
    __tablename__ = "trending_votes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    vote_type = db.Column(db.Integer, nullable=False)  # 1 for upvote, -1 for downvote
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", backref=db.backref("trending_votes", cascade="all, delete-orphan"))

    __table_args__ = (
        db.UniqueConstraint("user_id", "tool_slug", name="uq_trending_user_vote"),
        db.CheckConstraint("vote_type = 1 OR vote_type = -1", name="ck_trending_vote_type"),
    )


class CommunityPost(db.Model):
    __tablename__ = "community_posts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    post_type = db.Column(db.String(20), nullable=False, default="discussion")  # news | question | showcase | discussion
    tool_slug = db.Column(db.String(120), nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)

    user = db.relationship("User", backref=db.backref("community_posts", cascade="all, delete-orphan"))


class PostVote(db.Model):
    __tablename__ = "post_votes"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("community_posts.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    vote_type = db.Column(db.Integer, nullable=False)  # 1 for upvote, -1 for downvote
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    post = db.relationship("CommunityPost", backref=db.backref("votes", cascade="all, delete-orphan"))
    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_post_user_vote"),
        db.CheckConstraint("vote_type = 1 OR vote_type = -1", name="ck_post_vote_type"),
    )


class CommunityComment(db.Model):
    __tablename__ = "community_comments"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("community_posts.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    body = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)

    post = db.relationship("CommunityPost", backref=db.backref("comments", cascade="all, delete-orphan"))
    user = db.relationship("User", backref=db.backref("community_comments", cascade="all, delete-orphan"))


class CommentVote(db.Model):
    __tablename__ = "comment_votes"

    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey("community_comments.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    vote_type = db.Column(db.Integer, nullable=False)  # 1 for upvote, -1 for downvote
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    comment = db.relationship("CommunityComment", backref=db.backref("votes", cascade="all, delete-orphan"))
    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("comment_id", "user_id", name="uq_comment_user_vote"),
        db.CheckConstraint("vote_type = 1 OR vote_type = -1", name="ck_comment_vote_type"),
    )


class StackVote(db.Model):
    __tablename__ = "stack_votes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    stack_id = db.Column(db.Integer, db.ForeignKey("saved_stacks.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", backref=db.backref("stack_votes", cascade="all, delete-orphan"))
    stack = db.relationship("SavedStack", backref=db.backref("votes", cascade="all, delete-orphan"))

    __table_args__ = (
        db.UniqueConstraint("user_id", "stack_id", name="uq_stack_user_vote"),
    )


class OutreachCandidate(db.Model):
    __tablename__ = "outreach_candidates"

    id = db.Column(db.Integer, primary_key=True)
    product_name = db.Column(db.String(255), nullable=False)
    tagline = db.Column(db.String(500), nullable=True)
    website_url = db.Column(db.String(500), nullable=True)
    founder_name = db.Column(db.String(255), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(50), nullable=False, default="draft_ready", index=True)
    # Statuses: 'draft_ready', 'sent', 'followed_up', 'followed_up_2', 'replied',
    # 'no_email_found', 'bounced', 'rejected', 'unsubscribed'
    draft_subject = db.Column(db.Text, nullable=True)
    draft_body = db.Column(db.Text, nullable=True)
    email_source = db.Column(db.String(100), nullable=True)  # 'scraper', 'hunter', 'manual'
    confidence_score = db.Column(db.Integer, nullable=True)  # Hunter.io confidence %
    tone = db.Column(db.String(20), nullable=False, default="peer")  # 'peer' or 'formal'
    ph_launch_id = db.Column(db.String(100), nullable=True, unique=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_status_change_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    verification_result = db.Column(db.String(20), nullable=True)  # 'valid', 'invalid', 'disposable', 'catchall', 'unknown', or None if never checked
    verified_at = db.Column(db.DateTime, nullable=True)
    fit_score = db.Column(db.Integer, nullable=True)  # likelihood-to-convert ranking signal, see compute_fit_score()


class OutreachEmailLog(db.Model):
    __tablename__ = "outreach_email_logs"

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("outreach_candidates.id", ondelete="CASCADE"), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    subject = db.Column(db.String(500), nullable=False)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), nullable=False)  # 'success', 'failure'
    error_message = db.Column(db.Text, nullable=True)
    sent_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))







class SponsorSlot(db.Model):
    """A paid, time-boxed placement on the community surfaces.

    Deliberately separate from Submission: a Submission is a one-time
    "get me into the catalog" purchase, whereas a slot is rented inventory
    with a start/end date, a placement position, and its own delivery
    numbers. Keeping them apart means a sponsor can renew a slot without
    re-submitting a tool, and the community pages can show honest
    "3 slots left this week" scarcity by counting rows here.

    placement:
        'hero'      — the single large unit at the top of /community
        'board'     — the labelled row pinned above the leaderboard
        'rail'      — the sidebar card stack
    """

    __tablename__ = "sponsor_slots"

    id = db.Column(db.Integer, primary_key=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    placement = db.Column(db.String(20), nullable=False, default="rail", index=True)
    tier = db.Column(db.String(20), nullable=False, default="sponsored")
    headline = db.Column(db.String(140), nullable=True)
    blurb = db.Column(db.String(280), nullable=True)
    cta_label = db.Column(db.String(40), nullable=True)
    starts_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    ends_at = db.Column(db.DateTime, nullable=False, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    # Soft link back to the purchase that paid for this slot, so an admin can
    # audit "who paid for this" the same way submission_id works on
    # catalog_tools. No FK constraint, matching the existing convention.
    submission_id = db.Column(db.Integer, nullable=True, index=True)
    amount_paid = db.Column(db.Float, nullable=False, default=0.0)
    # The verified PayPal order this slot was bought with. Unique because it
    # is the replay guard: without it, re-POSTing one captured order id mints
    # unlimited slots from a single payment.
    payment_ref = db.Column(db.String(64), unique=True, nullable=True, index=True)
    contact_email = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class SponsorImpression(db.Model):
    """One row per rendered sponsored unit.

    This is the half of the sponsorship product that actually closes deals:
    clicks were already countable via OutboundClick, but without impressions
    there is no denominator, so no CTR, so nothing a sponsor can evaluate.
    Recorded server-side from a beacon the placement fires once per view.
    """

    __tablename__ = "sponsor_impressions"

    id = db.Column(db.Integer, primary_key=True)
    slot_id = db.Column(db.Integer, nullable=True, index=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    placement = db.Column(db.String(20), nullable=False, default="rail")
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )
