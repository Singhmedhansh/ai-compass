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
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    favorites = db.relationship("Favorite", back_populates="user", cascade="all, delete-orphan")


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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True, index=True)
    category = db.relationship("Category", back_populates="tools")
    
    tags = db.relationship('Tag', secondary=tool_tags, lazy='subquery', backref=db.backref('tools', lazy=True))
