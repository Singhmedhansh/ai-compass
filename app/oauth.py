"""OAuth login via Google and GitHub using Authlib."""
import json
import os
from urllib.parse import urlencode

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, flash, jsonify, redirect, request, session, url_for
from flask_login import login_user

from app import db
from app.models import User

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()


def _clear_stale_login_flash_errors():
    flashes = list(session.get("_flashes") or [])
    if not flashes:
        return
    filtered = [
        item for item in flashes
        if len(item) < 2 or str(item[1]) not in {"Login failed. Please try again.", "Invalid email or password."}
    ]
    if filtered:
        session["_flashes"] = filtered
    else:
        session.pop("_flashes", None)


def _google_redirect_uri():
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI_LOCAL") if os.getenv("APP_ENV") != "production" else os.getenv("GOOGLE_REDIRECT_URI_PROD")
    return str(redirect_uri or "http://localhost:5000/auth/google/callback").strip()


def init_oauth(app):
    oauth.init_app(app)

    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
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
@oauth_bp.route("/auth/google")
def login_google():
    print("CLIENT_ID:", os.getenv("GOOGLE_CLIENT_ID", "MISSING")[:15])
    print("CLIENT_SECRET:", os.getenv("GOOGLE_CLIENT_SECRET", "MISSING")[:5])
    print("REDIRECT_URI:", _google_redirect_uri())
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')

    if not os.getenv("GOOGLE_CLIENT_ID"):
        return jsonify({"error": "GOOGLE_CLIENT_ID not set"}), 500

    print("Google Client ID:", os.getenv("GOOGLE_CLIENT_ID")[:10])

    if not os.getenv("GOOGLE_CLIENT_SECRET"):
        return redirect(f"{frontend_url}/login?error=google_not_configured")
    try:
        redirect_uri = _google_redirect_uri()
        return oauth.google.authorize_redirect(
            redirect_uri,
            nonce=False,
        )
    except Exception as exc:
        err = str(exc or "").lower()
        return redirect(f"{frontend_url}/login?error=google_failed")


@oauth_bp.route("/auth/google/callback")
def google_callback():
    try:
        try:
            token = oauth.google.authorize_access_token()
        except Exception as e:
            if "mismatching_state" in str(e).lower():
                return redirect(url_for("oauth.login_google"))
            raise

        userinfo = token.get("userinfo") or oauth.google.userinfo()
        name = str(userinfo.get("name") or "").strip()
        email = str(userinfo.get("email") or "").strip().lower()
        picture = str(userinfo.get("picture") or "").strip()

        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')

        if not email:
            return redirect(f"{frontend_url}/login?error=google_failed")

        user = _get_or_create_oauth_user(email, name, "google")
        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()

        _clear_stale_login_flash_errors()
        login_user(user)
        user.first_login = False
        user.onboarding_completed = True
        db.session.commit()

        callback_picture = user.oauth_picture_url or picture or ""
        params = urlencode({
            "name": user.display_name or name,
            "email": user.email,
            "id": user.id,
            "picture": callback_picture,
        })
        callback_url = f"{frontend_url}/auth/callback?{params}"
        return redirect(callback_url)
    except Exception as exc:
        import traceback

        print("GOOGLE CALLBACK ERROR:", str(exc))
        print(traceback.format_exc())
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        return redirect(f"{frontend_url}/login?error=google_failed")


# ── GitHub ───────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/github")
def login_github():
    if not (current_app.config.get("GITHUB_CLIENT_ID") and current_app.config.get("GITHUB_CLIENT_SECRET")):
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
        _clear_stale_login_flash_errors()
        login_user(user)
        if _requires_onboarding(user):
            return redirect(url_for("main.onboarding"))
        return redirect(url_for("main.dashboard"))
    except Exception:
        flash("Login failed. Please try again.", "error")
        return redirect(url_for("auth.login"))


@oauth_bp.route("/login/linkedin")
def login_linkedin():
    if not current_app.config.get("LINKEDIN_CLIENT_ID"):
        flash("LinkedIn login is not configured yet.", "info")
        return redirect(url_for("auth.login"))

    flash("LinkedIn OAuth setup is currently a stub. Configure provider metadata to enable sign-in.", "info")
    return redirect(url_for("auth.login"))
