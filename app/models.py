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
    # Set on accounts auto-created for a paid submission's founder (see
    # app/founder_accounts.py) so their first login is forced through a
    # password-change step before they can use the temp credential further.
    must_change_password = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
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
    # Admin-authored replacement for the submitter's own description, shown
    # only while the tool is currently Sponsored (see _sponsored_active() in
    # app/tool_cache.py — checked at render time, not just "is this set", so
    # a lapsed/downgraded tool automatically reverts to its own description).
    # Never founder-editable — admin-only, via the /admin/tools editor.
    editorial_blurb = db.Column(db.Text, nullable=True)


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
    # 'unpaid'      — free listing, or a paid claim with no reference at all.
    # 'verified'    — server independently confirmed a real payment.
    # 'unverified_review' — PayPal answered and REFUSED the claim (no such
    #                 order, voided, underpaid). Safe to treat as free.
    # 'needs_manual_review' — verification was INDETERMINATE: PayPal was
    #                 unreachable, our credentials failed, or the reference
    #                 is a shape we cannot resolve (e.g. a legacy NCP ref).
    #                 The payment may be entirely genuine, so this must
    #                 reach a human — never silently treated as free.
    # 'rejected'    — admin decision.
    # Only 'verified' ever unlocks paid perks; see pricing_tiers.effective_tier.
    payment_status = db.Column(db.String(20), nullable=False, default="unpaid")
    payment_note = db.Column(db.String(255), nullable=True)
    is_priority = db.Column(db.Boolean, nullable=False, default=False)
    # Links this submission to the founder's User account (see
    # app/founder_accounts.py). Set on paid-tier approval only — free
    # submissions never get one. CatalogTool resolves back to this row via
    # its own submission_id, so a founder's tools are reachable by joining
    # Submission.founder_user_id -> Submission.id -> CatalogTool.submission_id,
    # no separate FK needed on CatalogTool.
    founder_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    # Send-once guard for the founder welcome email (credentials/account-link
    # note) — separate from get_or_create_founder_account()'s own account-level
    # idempotency, since a retried submission request must not re-send the
    # email even though the account lookup would just no-op safely on its own.
    welcome_email_sent_at = db.Column(db.DateTime, nullable=True)
    # When an admin approved this submission and the listing went live.
    #
    # This is the start of the clock for time-boxed paid perks (see
    # sponsorship.complimentary_window). It used to be measured from
    # submitted_at, which quietly charged the founder for our own review
    # queue: a Fast-Track buyer whose row sat unreviewed for a week got 23
    # days of the 30 they paid for, with nothing in the UI explaining where
    # the other seven went.
    #
    # Nullable, and consumers fall back to submitted_at: rows approved before
    # this column existed have no honest value to backfill, and inventing one
    # would be worse than the documented fallback.
    approved_at = db.Column(db.DateTime, nullable=True)
    # The founder's chosen Launch Day (see app/launch_day.py). When set, it —
    # not approved_at — is when the time-boxed perks fire: the listing goes
    # live, the rail card starts, the digest announces it, and a showcase post
    # is written. A date is something a founder can plan around and tell their
    # own audience about; a permanent flag that switches on whenever an admin
    # happens to click approve is neither. It also concentrates a small
    # audience into one spike instead of spreading it into invisibility.
    launch_at = db.Column(db.DateTime, nullable=True, index=True)
    # Set the first time the launch actually fires, so the announcement side
    # effects (the showcase post) happen exactly once even if the tick runs
    # twice or the date is edited afterwards.
    launched_at = db.Column(db.DateTime, nullable=True)
    # Owner test data, not a real founder. Excluded from every count in
    # /admin/tier-breakdown — attempts, failure reasons and revenue.
    #
    # This exists because the Manila row is pricing_model
    # 'sponsored_paypal:INTERNAL-QA' with payment_status 'verified', set by
    # hand while testing the paid-tier UX. It is a legitimate catalog
    # listing, so deleting it is wrong, but leaving it 'verified' made the
    # new revenue counter report $49.99 that nobody ever paid — a reporting
    # fix that immediately lies is worse than no reporting.
    #
    # A flag rather than an email filter: test rows have been submitted from
    # a personal Gmail as well as test@company.com, and hardcoding addresses
    # in reporting queries fails the moment a real founder uses Gmail.
    is_test = db.Column(db.Boolean, nullable=False, default=False, server_default="0")

    # The tool's logo, stored as bytes in the row rather than as a file.
    #
    # Render's filesystem is ephemeral — anything written to static/ is gone
    # on the next deploy — so a logo saved to disk would silently vanish and
    # take every card that referenced it back to a letter tile. The DB is the
    # only durable store this app has, and a favicon-sized PNG is small
    # enough (capped at LOGO_MAX_BYTES) that a BYTEA column is the honest
    # answer rather than a premature object-store dependency.
    #
    # logo_source distinguishes the two ways a row gets one: 'upload' is the
    # founder's own file from the submit form, 'auto' is the favicon we
    # fetched from their domain at approval. Upload always wins — an
    # auto-fetch never overwrites a logo a human chose.
    logo_data = db.Column(db.LargeBinary, nullable=True)
    logo_mime = db.Column(db.String(32), nullable=True)
    logo_source = db.Column(db.String(16), nullable=True)


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
    # A public reply from the tool's claimed maker (see app/claims.py). One
    # per review, on the review rather than in its own table: a reply is not
    # a conversation, it is the maker's single answer of record, and a thread
    # here would turn every critical review into an argument on our page.
    maker_reply = db.Column(db.String(1000), nullable=True)
    maker_reply_at = db.Column(db.DateTime, nullable=True)

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
    draft_template_version = db.Column(db.Integer, nullable=True)  # copy/pricing template version stamped at draft generation, see CURRENT_DRAFT_TEMPLATE_VERSION


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


class SendBudget(db.Model):
    """One row per UTC calendar day tracking how many transactional/outreach
    emails have been committed against Resend's shared 100/day account limit.

    Both independent senders — cold outreach and the new-tools digest — draw
    from this single counter via app.send_budget.reserve_send_slots(), instead
    of each assuming a private fixed allowance and colliding on a day they both
    run near capacity.

    `cap` defaults to 90 (SEND_BUDGET_DAILY_CAP), deliberately under Resend's
    real 100/day so there's headroom for manual/ad-hoc sends (replies, tests,
    password resets). It is snapshotted onto the row at creation time — changing
    the env var only affects days that haven't started yet.

    Keyed on the UTC date to match Resend's own midnight-UTC reset. Note this is
    intentionally NOT the same boundary as outreach's internal 30/day ramp
    window (which resets 03:30 UTC / 09:00 IST); that ramp is a separate,
    stricter guard layered on top of this one.
    """

    __tablename__ = "send_budget"

    date = db.Column(db.Date, primary_key=True)
    sent_count = db.Column(db.Integer, nullable=False, default=0)
    cap = db.Column(db.Integer, nullable=False, default=90)
    # Subset of sent_count that came from the new-tools digest, so the digest
    # can hold itself to DIGEST_DAILY_SEND_CAP (default 50/day) and never eat
    # the whole shared allowance in one announcement.
    digest_sent_count = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class DigestRecipientLog(db.Model):
    """Per-recipient record of who has already received the current, not-yet-
    snapshotted digest batch.

    Only used on a day the digest can't email everyone in one run because the
    shared SendBudget was exhausted: the served recipients are recorded here so
    the next run (self-scheduled maybe_run_digest is daily) picks up only the
    un-served remainder instead of re-blasting the whole list. Every row is
    deleted the moment a run finally reaches everyone and advances the
    known-slugs snapshot, so a present row always means "already got the batch
    that's still pending".
    """

    __tablename__ = "digest_recipient_log"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    # Informational only — dedupe keys on row existence, not on this date
    # (a deferred batch can straddle a midnight-UTC boundary).
    sent_on = db.Column(db.Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class EditorialReview(db.Model):
    """A commissioned, hands-on review of one tool, published on /tools/<slug>.

    The full-size sibling of CatalogTool.editorial_blurb: the blurb is a
    sentence that replaces a submitted description, this is a 300–500 word
    piece with screenshots, pros, cons and a verdict, written and bylined by
    a human.

    What the founder buys is the *artifact*, not a position — a third-party
    review URL they can cite from their own site, their launch post and their
    investor update. Which is why nothing here touches ranking, and why
    `verdict`/`rating` are ours to write: the money buys the work of testing
    the tool and publishing the result honestly, and `outcome` records that
    the piece can land negative without a refund being owed for it.

    Deliberately its own table rather than more columns on catalog_tools:
    a review has a purchase, a lifecycle (ordered -> drafting -> published)
    and an author, none of which belong on a catalog row, and a tool can be
    reviewed without ever having been submitted through the paid ladder.
    """

    __tablename__ = "editorial_reviews"

    STATUSES = ("ordered", "drafting", "published", "declined", "refunded")

    id = db.Column(db.Integer, primary_key=True)
    # One live review per tool. Not unique at the DB level: a declined or
    # refunded order for a slug must not block a later, honest re-order.
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="ordered", index=True)

    # --- the review itself ------------------------------------------------
    headline = db.Column(db.String(180), nullable=True)
    # Markdown-ish plain text; rendered as paragraphs, never as HTML.
    body = db.Column(db.Text, nullable=True)
    verdict = db.Column(db.Text, nullable=True)
    # JSON arrays of strings / {url, caption} objects. Stored as text so this
    # works identically on SQLite (tests) and Postgres (production).
    pros = db.Column(db.Text, nullable=True)
    cons = db.Column(db.Text, nullable=True)
    screenshots = db.Column(db.Text, nullable=True)
    # Our score out of 5 — separate from the crowd rating on the tool, and
    # never written by the buyer.
    score = db.Column(db.Float, nullable=True)
    author_name = db.Column(db.String(120), nullable=True)
    published_at = db.Column(db.DateTime, nullable=True, index=True)
    # Set on every substantive edit so the page can say "updated on", which
    # is the difference between a review worth citing and a stale one.
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- the purchase -----------------------------------------------------
    amount_paid = db.Column(db.Float, nullable=False, default=0.0)
    # Verified PayPal order id. Unique for the same reason as
    # SponsorSlot.payment_ref: it is the replay guard that stops one captured
    # order minting an unlimited number of commissions.
    payment_ref = db.Column(db.String(64), unique=True, nullable=True, index=True)
    contact_email = db.Column(db.String(255), nullable=True)
    # Anything the founder wants us to look at: docs, a demo login, the
    # feature they think we will miss. Context for the reviewer, never copy
    # we publish verbatim.
    brief = db.Column(db.Text, nullable=True)
    # Free-text admin trail: why it was declined, when a refund was sent.
    admin_note = db.Column(db.String(500), nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )


class ToolClaim(db.Model):
    """A maker's claim on their own catalog listing.

    Turns a one-time transaction into an account someone logs back into: the
    founder claims the listing, gets a "Claimed by the maker" badge on it,
    and can edit their own copy without going through an admin.

    Deliberately NOT keyed off Submission.founder_user_id, which only exists
    for tools that came through the paid submission ladder. Most of the
    catalog was seeded editorially and has no Submission at all, and those
    listings are exactly the ones a maker is most likely to want to correct.
    A claim is its own record so any listing can be claimed.

    verified_domain_match is the load-bearing field: a claimant whose email
    domain matches the tool's own website is auto-approved, because that is a
    fact we can check rather than an assertion we have to trust. Everything
    else waits for a human, since the cost of a wrong approval is handing a
    stranger edit rights over somebody else's listing.
    """

    __tablename__ = "tool_claims"

    STATUSES = ("pending", "approved", "rejected", "revoked")

    id = db.Column(db.Integer, primary_key=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    # True when the claimant's email domain matched the tool's website domain
    # at the time of claiming. Stored rather than recomputed: the tool's URL
    # can change later, and an audit needs to know what was true when the
    # decision was made.
    verified_domain_match = db.Column(db.Boolean, nullable=False, default=False)
    # The claimant's own words: their role, a link to a team page, anything
    # that helps a human decide. Never published.
    evidence = db.Column(db.Text, nullable=True)
    admin_note = db.Column(db.String(500), nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )
    decided_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", backref=db.backref("tool_claims", cascade="all, delete-orphan"))


class ToolEdit(db.Model):
    """Audit trail for a founder editing their own claimed listing.

    Founder edits apply immediately — a maker correcting their own pricing
    should not wait on a queue, and a listing that is wrong for three days is
    worse for the reader than one edited without review. That tradeoff is only
    defensible with a record of who changed what, which is this table: it is
    what makes an immediate edit reversible instead of merely fast.
    """

    __tablename__ = "tool_edits"

    id = db.Column(db.Integer, primary_key=True)
    tool_slug = db.Column(db.String(120), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    field = db.Column(db.String(64), nullable=False)
    # Truncated on write — this is an audit trail, not a backup, and a long
    # description would make the table the biggest thing in the database.
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True,
        default=lambda: datetime.now(timezone.utc),
    )
