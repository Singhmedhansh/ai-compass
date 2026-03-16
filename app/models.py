from datetime import datetime, timezone

from flask_login import UserMixin

from app import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
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
    __tablename__ = "tool_views"

    id = db.Column(db.Integer, primary_key=True)
    tool_id = db.Column(db.String(64), nullable=False, unique=True, index=True)
    views = db.Column(db.Integer, nullable=False, default=0)
