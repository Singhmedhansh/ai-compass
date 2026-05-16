"""OAuth login via Google, GitHub and LinkedIn using Authlib."""
import os
from urllib.parse import urlencode, urlparse

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, jsonify, redirect, request, session, url_for
from flask_login import login_user

from app import db
from app.models import User

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()


def _is_production_env() -> bool:
    return str(os.getenv("APP_ENV", "development")).strip().lower() == "production"


def _canonical_host() -> str:
    configured_host = str(os.getenv("CANONICAL_HOST", "")).strip().lower()
    if configured_host:
        return configured_host

    frontend_url = str(
        current_app.config.get("FRONTEND_URL")
        or os.getenv("FRONTEND_URL")
        or ""
    ).strip()
    if frontend_url:
        parsed = urlparse(frontend_url if "://" in frontend_url else f"https://{frontend_url}")
        if parsed.hostname:
            return parsed.hostname.strip().lower()

    return request.host.split(":", 1)[0].strip().lower()


def _frontend_base_url() -> str:
    if _is_production_env():
        host = _canonical_host()
        if host and host not in {"localhost", "127.0.0.1"}:
            return f"https://{host}"

    configured = str(
        current_app.config.get("FRONTEND_URL")
        or os.getenv("FRONTEND_URL")
        or ""
    ).strip().rstrip("/")
    return configured or "http://localhost:5173"


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
    if _is_production_env():
        host = _canonical_host()
        if host and host not in {"localhost", "127.0.0.1"}:
            return f"https://{host}/auth/google/callback"
        return url_for("oauth.google_callback", _external=True, _scheme="https")

    redirect_uri = str(os.getenv("GOOGLE_REDIRECT_URI_LOCAL", "")).strip()
    if redirect_uri:
        return redirect_uri
    return url_for("oauth.google_callback", _external=True, _scheme="http")


def _provider_redirect_uri(callback_endpoint: str, prod_path: str) -> str:
    """Build the OAuth callback URL for any provider, honouring the
    canonical host in production and a normal external URL locally.
    `callback_endpoint` is the Flask endpoint (e.g. 'oauth.github_callback');
    `prod_path` is the absolute path to use behind the canonical host."""
    if _is_production_env():
        host = _canonical_host()
        if host and host not in {"localhost", "127.0.0.1"}:
            return f"https://{host}{prod_path}"
        return url_for(callback_endpoint, _external=True, _scheme="https")
    return url_for(callback_endpoint, _external=True)


def _spa_success_redirect(user, name: str, picture: str):
    """Single source of truth for a successful OAuth login: sign the
    user in, mark onboarding done, and hand back to the SPA's
    /auth/callback (the React app reads these query params into
    localStorage). Every provider funnels through here so they behave
    identically."""
    _clear_stale_login_flash_errors()
    login_user(user, remember=True)
    user.first_login = False
    user.onboarding_completed = True
    db.session.commit()

    params = urlencode({
        "name": user.display_name or name or "",
        "email": user.email,
        "id": user.id,
        "picture": user.oauth_picture_url or picture or "",
    })
    return redirect(f"{_frontend_base_url()}/auth/callback?{params}")


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
            client_kwargs={"scope": "read:user user:email"},
        )

    # LinkedIn via "Sign In with LinkedIn using OpenID Connect" (the
    # current product — the old r_liteprofile/r_emailaddress v2 API is
    # deprecated). Authlib reads endpoints from the discovery document.
    if app.config.get("LINKEDIN_CLIENT_ID") and app.config.get("LINKEDIN_CLIENT_SECRET"):
        oauth.register(
            name="linkedin",
            client_id=app.config["LINKEDIN_CLIENT_ID"],
            client_secret=app.config["LINKEDIN_CLIENT_SECRET"],
            server_metadata_url="https://www.linkedin.com/oauth/.well-known/openid-configuration",
            client_kwargs={"scope": "openid profile email"},
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


# ── Google ──────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/google")
@oauth_bp.route("/auth/google")
def login_google():
    frontend_url = _frontend_base_url()

    if not os.getenv("GOOGLE_CLIENT_ID"):
        return jsonify({"error": "GOOGLE_CLIENT_ID not set"}), 500

    if not os.getenv("GOOGLE_CLIENT_SECRET"):
        return redirect(f"{frontend_url}/login?error=google_not_configured")
    try:
        redirect_uri = _google_redirect_uri()
        return oauth.google.authorize_redirect(
            redirect_uri,
            nonce=False,
        )
    except Exception:
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

        frontend_url = _frontend_base_url()

        if not email:
            return redirect(f"{frontend_url}/login?error=google_failed")

        user = _get_or_create_oauth_user(email, name, "google")
        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()

        return _spa_success_redirect(user, name, picture)
    except Exception:

        frontend_url = _frontend_base_url()
        return redirect(f"{frontend_url}/login?error=google_failed")


# ── GitHub ───────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/github")
@oauth_bp.route("/auth/github")
def login_github():
    frontend_url = _frontend_base_url()
    if not (current_app.config.get("GITHUB_CLIENT_ID") and current_app.config.get("GITHUB_CLIENT_SECRET")):
        return redirect(f"{frontend_url}/login?error=github_not_configured")
    try:
        redirect_uri = _provider_redirect_uri("oauth.github_callback", "/login/github/callback")
        return oauth.github.authorize_redirect(redirect_uri)
    except Exception:
        return redirect(f"{frontend_url}/login?error=github_failed")


@oauth_bp.route("/login/github/callback")
def github_callback():
    frontend_url = _frontend_base_url()
    try:
        oauth.github.authorize_access_token()
        profile = oauth.github.get("user").json()

        # GitHub only returns email on /user if it's public; otherwise
        # pull the primary verified address from /user/emails.
        email = profile.get("email")
        if not email:
            emails = oauth.github.get("user/emails").json()
            primary = next(
                (e for e in emails if e.get("primary") and e.get("verified")),
                None,
            )
            email = primary["email"] if primary else None

        if not email:
            return redirect(f"{frontend_url}/login?error=github_no_email")

        display_name = profile.get("name") or profile.get("login", "")
        user = _get_or_create_oauth_user(email, display_name, "github")
        avatar_url = str(profile.get("avatar_url") or "").strip()
        if avatar_url and avatar_url != (user.oauth_picture_url or ""):
            user.oauth_picture_url = avatar_url
            db.session.commit()

        return _spa_success_redirect(user, display_name, avatar_url)
    except Exception:
        return redirect(f"{frontend_url}/login?error=github_failed")


# ── LinkedIn (OpenID Connect) ────────────────────────────────────────────────

@oauth_bp.route("/login/linkedin")
@oauth_bp.route("/auth/linkedin")
def login_linkedin():
    frontend_url = _frontend_base_url()
    if not (current_app.config.get("LINKEDIN_CLIENT_ID") and current_app.config.get("LINKEDIN_CLIENT_SECRET")):
        return redirect(f"{frontend_url}/login?error=linkedin_not_configured")
    try:
        redirect_uri = _provider_redirect_uri("oauth.linkedin_callback", "/login/linkedin/callback")
        return oauth.linkedin.authorize_redirect(redirect_uri)
    except Exception:
        return redirect(f"{frontend_url}/login?error=linkedin_failed")


@oauth_bp.route("/login/linkedin/callback")
def linkedin_callback():
    frontend_url = _frontend_base_url()
    try:
        token = oauth.linkedin.authorize_access_token()
        # OIDC: the id_token's claims (or the userinfo endpoint) carry
        # name / email / picture / sub.
        userinfo = token.get("userinfo")
        if not userinfo:
            userinfo = oauth.linkedin.userinfo()

        email = str(userinfo.get("email") or "").strip().lower()
        name = str(userinfo.get("name") or "").strip()
        picture = str(userinfo.get("picture") or "").strip()

        if not email:
            return redirect(f"{frontend_url}/login?error=linkedin_no_email")

        user = _get_or_create_oauth_user(email, name, "linkedin")
        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()

        return _spa_success_redirect(user, name, picture)
    except Exception:
        return redirect(f"{frontend_url}/login?error=linkedin_failed")
