"""OAuth login via Google, GitHub and LinkedIn using Authlib."""
import os
from urllib.parse import urlencode, urlparse

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, jsonify, redirect, request, session, url_for
from flask_login import current_user, login_user

from app import db
from app.models import User

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()

# TEMP: last LinkedIn callback outcome for diagnosis (no secrets — only
# which branch ran + field presence + exception class). Persisted to the
# DB (AppSetting) so it's readable across Render's multiple workers and
# survives dyno restarts. Read via GET /debug/linkedin-last. Removed once
# LinkedIn login is confirmed working.
_LINKEDIN_DBG_KEY = "linkedin_debug_last"


def _save_linkedin_debug(dbg: dict) -> None:
    try:
        import json as _json

        from app import db
        from app.models import AppSetting
        row = db.session.query(AppSetting).filter_by(key=_LINKEDIN_DBG_KEY).one_or_none()
        if row is None:
            db.session.add(AppSetting(key=_LINKEDIN_DBG_KEY, value=_json.dumps(dbg)))
        else:
            row.value = _json.dumps(dbg)
        db.session.commit()
    except Exception:
        try:
            from app import db
            db.session.rollback()
        except Exception:
            pass


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


def _spa_success_redirect(user, provider_name: str, name: str | None = None, picture: str | None = None):
    """Centralized success handler for OAuth providers.

    Performs the app login, marks onboarding, commits DB changes,
    attaches Sentry telemetry (best-effort) and returns the SPA
    redirect. All Sentry calls are defensive and non-blocking.
    """
    _clear_stale_login_flash_errors()
    login_user(user, remember=True)
    user.first_login = False
    user.onboarding_completed = True
    db.session.commit()

    # Best-effort Sentry telemetry: non-blocking and defensive
    try:
        # import inside the try to avoid hard dependency and keep this
        # function robust even if sentry-sdk isn't installed.
        import sentry_sdk

        try:
            sentry_sdk.set_user({"id": str(user.id), "email": user.email})
            sentry_sdk.set_tag("auth_method", "oauth")
            sentry_sdk.set_tag("oauth_provider", provider_name)
        except Exception:
            # keep telemetry best-effort — do not interfere with auth flow
            pass
    except Exception:
        pass

    params = urlencode({
        "name": user.display_name or (name or "") or "",
        "email": user.email,
        "id": user.id,
        "picture": user.oauth_picture_url or (picture or "") or "",
    })
    return redirect(f"{_frontend_base_url()}/auth/callback?{params}")


def init_oauth(app):
    oauth.init_app(app)

    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        access_token_url="https://oauth2.googleapis.com/token",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
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

    # LinkedIn — registered as PLAIN OAUTH2 (no server_metadata_url), not
    # OIDC. Reason: with OIDC metadata, Authlib auto-injects a nonce into
    # the authorize request and then requires that nonce echoed back
    # inside the id_token. LinkedIn does NOT echo nonce in its id_token,
    # so authorize_access_token() throws "MissingClaimError: Missing
    # 'nonce' claim" and login fails. (nonce=False does not suppress this
    # in our Authlib version.) Treating LinkedIn as plain OAuth2 means
    # Authlib never parses/validates the id_token — we read identity from
    # the OIDC /v2/userinfo endpoint with the access token instead, which
    # still works with the openid/profile/email scopes.
    if app.config.get("LINKEDIN_CLIENT_ID") and app.config.get("LINKEDIN_CLIENT_SECRET"):
        oauth.register(
            name="linkedin",
            client_id=app.config["LINKEDIN_CLIENT_ID"],
            client_secret=app.config["LINKEDIN_CLIENT_SECRET"],
            access_token_url="https://www.linkedin.com/oauth/v2/accessToken",
            authorize_url="https://www.linkedin.com/oauth/v2/authorization",
            api_base_url="https://api.linkedin.com/",
            client_kwargs={
                "scope": "openid profile email",
                # LinkedIn's token endpoint requires the client creds in
                # the POST body, not HTTP Basic.
                "token_endpoint_auth_method": "client_secret_post",
                "claims_options": {
                    "id_token": {
                        "nonce": {
                            "essential": False
                        }
                    }
                }
            },
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


def _handle_link_oauth_user(email, provider, picture_url=None):
    from app.models import LinkedAccount
    from datetime import datetime, timezone
    email = email.strip().lower()
    frontend_url = _frontend_base_url()
    
    link_user_id = session.pop('oauth_link_user_id', None)
    if not current_user.is_authenticated or link_user_id != current_user.id:
        return redirect(f"{frontend_url}/profile?error=link_failed&detail=unauthorized")
        
    # Check if this email is already linked to another user
    existing_user = User.query.filter_by(email=email).first()
    if existing_user and existing_user.id != current_user.id:
        return redirect(f"{frontend_url}/profile?error=link_failed&detail=email_already_linked")
        
    # Create or update link for current_user
    link = LinkedAccount.query.filter_by(user_id=current_user.id, provider=provider).first()
    if not link:
        link = LinkedAccount(
            user_id=current_user.id,
            provider=provider,
            created_at=datetime.now(timezone.utc)
        )
        db.session.add(link)
    
    if picture_url:
        link.oauth_picture_url = picture_url
        if not current_user.oauth_picture_url:
            current_user.oauth_picture_url = picture_url
            
    if not current_user.oauth_provider:
        current_user.oauth_provider = provider
        
    db.session.commit()
    return redirect(f"{frontend_url}/profile?linked={provider}")


# ── Google ──────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/google")
@oauth_bp.route("/auth/google")
def login_google():
    frontend_url = _frontend_base_url()
    if current_user.is_authenticated:
        session['oauth_link_user_id'] = current_user.id

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

        if session.get('oauth_link_user_id'):
            return _handle_link_oauth_user(email, "google", picture)

        user = _get_or_create_oauth_user(email, name, "google")

        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()

        return _spa_success_redirect(user, "google", name, picture)
    except Exception:

        frontend_url = _frontend_base_url()
        return redirect(f"{frontend_url}/login?error=google_failed")


# ── GitHub ───────────────────────────────────────────────────────────────────

@oauth_bp.route("/login/github")
@oauth_bp.route("/auth/github")
def login_github():
    frontend_url = _frontend_base_url()
    if current_user.is_authenticated:
        session['oauth_link_user_id'] = current_user.id

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

        avatar_url = str(profile.get("avatar_url") or "").strip()

        if session.get('oauth_link_user_id'):
            return _handle_link_oauth_user(email, "github", avatar_url)

        display_name = profile.get("name") or profile.get("login", "")
        user = _get_or_create_oauth_user(email, display_name, "github")
        if avatar_url and avatar_url != (user.oauth_picture_url or ""):
            user.oauth_picture_url = avatar_url
            db.session.commit()

        return _spa_success_redirect(user, "github", display_name, avatar_url)
    except Exception:
        current_app.logger.exception("GitHub OAuth callback failed")
        return redirect(f"{frontend_url}/login?error=github_failed")



# ── LinkedIn (OpenID Connect) ────────────────────────────────────────────────

@oauth_bp.route("/login/linkedin")
@oauth_bp.route("/auth/linkedin")
def login_linkedin():
    frontend_url = _frontend_base_url()
    if current_user.is_authenticated:
        session['oauth_link_user_id'] = current_user.id

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
    dbg: dict = {"stage": "start"}
    try:
        # Remove nonce from session state data so Authlib doesn't validate it in OIDC flow
        state = request.args.get('state')
        if state:
            state_key = f"_state_linkedin_{state}"
            state_data = session.get(state_key)
            if isinstance(state_data, dict) and "nonce" in state_data:
                state_data.pop("nonce", None)
                session[state_key] = state_data

        # Plain OAuth2 (see init_oauth): Authlib does NOT parse the
        # id_token, so no nonce validation. Identity comes from LinkedIn's
        # OIDC userinfo endpoint, called with the access token.
        token = oauth.linkedin.authorize_access_token()
        dbg["stage"] = "token_ok"
        dbg["token_keys"] = sorted(list(token.keys())) if hasattr(token, "keys") else str(type(token))

        ui_resp = oauth.linkedin.get("v2/userinfo")
        dbg["stage"] = "userinfo_called"
        dbg["userinfo_status"] = ui_resp.status_code
        try:
            userinfo = ui_resp.json()
        except Exception:
            userinfo = {}
            dbg["userinfo_body_head"] = ui_resp.text[:200]
        dbg["userinfo_keys"] = sorted(list(userinfo.keys())) if isinstance(userinfo, dict) else str(type(userinfo))

        email = str(userinfo.get("email") or "").strip().lower()
        name = str(userinfo.get("name") or "").strip()
        picture = str(userinfo.get("picture") or "").strip()
        dbg["has_email"] = bool(email)
        dbg["has_name"] = bool(name)

        if not email:
            dbg["stage"] = "no_email"
            _save_linkedin_debug(dbg)
            return redirect(f"{frontend_url}/login?error=linkedin_no_email")

        if session.get('oauth_link_user_id'):
            return _handle_link_oauth_user(email, "linkedin", picture)

        user = _get_or_create_oauth_user(email, name, "linkedin")
        if picture and picture != (user.oauth_picture_url or ""):
            user.oauth_picture_url = picture
            db.session.commit()

        dbg["stage"] = "success_redirect"
        dbg["user_id"] = user.id
        _save_linkedin_debug(dbg)
        return _spa_success_redirect(user, "linkedin", name, picture)

    except Exception as exc:
        current_app.logger.exception("LinkedIn OAuth callback failed")
        dbg["stage"] = dbg.get("stage", "?") + ":exception"
        dbg["exc"] = f"{type(exc).__name__}: {str(exc)}"[:300]
        _save_linkedin_debug(dbg)
        # TEMP DIAGNOSTIC: surface the precise reason in the redirect.
        from urllib.parse import quote
        detail = quote(f"{type(exc).__name__}: {str(exc)}"[:200], safe="")
        return redirect(f"{frontend_url}/login?error=linkedin_failed&detail={detail}")


@oauth_bp.route("/debug/linkedin-last")
def debug_linkedin_last():
    """TEMP: last LinkedIn callback outcome (no secrets — branch +
    field presence + exception class only). Removed once login works."""
    try:
        import json as _json

        from app import db
        from app.models import AppSetting
        row = db.session.query(AppSetting).filter_by(key=_LINKEDIN_DBG_KEY).one_or_none()
        if row and row.value:
            return jsonify(_json.loads(row.value))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"stage": "debug read failed", "exc": str(exc)})
    return jsonify({"stage": "no attempt recorded yet"})
