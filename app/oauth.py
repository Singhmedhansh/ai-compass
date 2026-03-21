"""OAuth login via Google and GitHub using Authlib."""
import json

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, flash, redirect, url_for
from flask_login import login_user

from app import db
from app.models import User

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()


def init_oauth(app):
    oauth.init_app(app)

    if app.config.get("GOOGLE_CLIENT_ID") and app.config.get("GOOGLE_CLIENT_SECRET"):
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    if app.config.get("GITHUB_CLIENT_ID") and app.config.get("GITHUB_CLIENT_SECRET"):
        oauth.register(
            name="github",
            client_id=app.config["GITHUB_CLIENT_ID"],
            client_secret=app.config["GITHUB_CLIENT_SECRET"],
            access_token_url="https://github.com/login/oauth/access_token",
            authorize_url="https://github.com/login/oauth/authorize",
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "user:email"},
        )


def _get_or_create_oauth_user(email, display_name, provider):
    """Look up existing user by email or create a new OAuth account."""
    email = email.strip().lower()
    is_admin = email in current_app.config.get("ADMIN_EMAILS", [])
    user = User.query.filter_by(email=email).first()
    if user:
        # Update OAuth provider if it was a local account
        if not user.oauth_provider:
            user.oauth_provider = provider
        if bool(user.is_admin) != is_admin:
            user.is_admin = is_admin
            db.session.commit()
        return user

    user = User(email=email, display_name=display_name, oauth_provider=provider, is_admin=is_admin)
    db.session.add(user)
    db.session.commit()
    return user


def _requires_onboarding(user):
    if bool(getattr(user, "onboarding_completed", False)):
        return False

    if getattr(user, "first_login", False):
        return True

    if str(getattr(user, "skill_level", "") or "").strip() and str(getattr(user, "pricing_pref", "") or "").strip():
        return False

    raw = str(getattr(user, "preferences", "") or "").strip()
    if not raw:
        return True
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return True
    if isinstance(parsed, dict):
        return not bool(parsed.get("skill_level") and parsed.get("preferred_pricing"))
    if isinstance(parsed, list):
        return not bool(parsed)
    return True


# ── Google ──────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/google")
def login_google():
    if not current_app.config.get("GOOGLE_CLIENT_ID"):
        flash("Google login is not configured.", "error")
        return redirect(url_for("auth.login"))
    redirect_uri = url_for("oauth.google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@oauth_bp.route("/auth/google/callback")
def google_callback():
    try:
        token = oauth.google.authorize_access_token()
        userinfo = token.get("userinfo") or oauth.google.userinfo()
        email = userinfo.get("email")
        if not email:
            flash("Google did not return an email address.", "error")
            return redirect(url_for("auth.login"))
        display_name = userinfo.get("name", "")
        user = _get_or_create_oauth_user(email, display_name, "google")
        picture = str(userinfo.get("picture") or "").strip()
        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()
        login_user(user)
        if _requires_onboarding(user):
            return redirect(url_for("main.onboarding"))
        return redirect(url_for("main.dashboard"))
    except Exception:
        flash("Google login failed. Please try again.", "error")
        return redirect(url_for("auth.login"))


# ── GitHub ───────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/github")
def login_github():
    if not current_app.config.get("GITHUB_CLIENT_ID"):
        flash("GitHub login is not configured.", "error")
        return redirect(url_for("auth.login"))
    redirect_uri = url_for("oauth.github_callback", _external=True)
    return oauth.github.authorize_redirect(redirect_uri)


@oauth_bp.route("/login/github/callback")
def github_callback():
    try:
        oauth.github.authorize_access_token()
        resp = oauth.github.get("user")
        profile = resp.json()

        # GitHub may not expose email directly; fetch from /user/emails
        email = profile.get("email")
        if not email:
            emails_resp = oauth.github.get("user/emails")
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            email = primary["email"] if primary else None

        if not email:
            flash("GitHub did not return a verified email address.", "error")
            return redirect(url_for("auth.login"))

        display_name = profile.get("name") or profile.get("login", "")
        user = _get_or_create_oauth_user(email, display_name, "github")
        avatar_url = str(profile.get("avatar_url") or "").strip()
        if avatar_url and avatar_url != (user.oauth_picture_url or ""):
            user.oauth_picture_url = avatar_url
            db.session.commit()
        login_user(user)
        if _requires_onboarding(user):
            return redirect(url_for("main.onboarding"))
        return redirect(url_for("main.dashboard"))
    except Exception:
        flash("GitHub login failed. Please try again.", "error")
        return redirect(url_for("auth.login"))


@oauth_bp.route("/login/linkedin")
def login_linkedin():
    if not current_app.config.get("LINKEDIN_CLIENT_ID"):
        flash("LinkedIn login is not configured yet.", "info")
        return redirect(url_for("auth.login"))

    flash("LinkedIn OAuth setup is currently a stub. Configure provider metadata to enable sign-in.", "info")
    return redirect(url_for("auth.login"))
