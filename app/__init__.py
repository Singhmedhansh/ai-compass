import json
import os
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse
from dotenv import load_dotenv

from datetime import timedelta

from flask import Flask, redirect, request, session
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from flask_caching import Cache

from app.tool_cache import DEFAULT_TOOLS_PATH, get_cached_tools, prime_tools_cache

load_dotenv()

# --- Safe flask_session import (Fix 3a) ---
try:
    from flask_session import Session
    from cachelib.file import FileSystemCache
    USE_SERVER_SESSION = True
except ImportError:
    Session = None
    FileSystemCache = None
    USE_SERVER_SESSION = False

# --- Sentry initialization (safe import) ---
try:
    import sentry_sdk
    # Prefer the Flask integration when available so Sentry attaches
    # request and transaction context automatically.
    try:
        from sentry_sdk.integrations.flask import FlaskIntegration
        integrations = [FlaskIntegration()]
    except Exception:
        integrations = []

    def _sentry_before_send(event, hint):
        str_event = str(event)
        if any(noise in str_event for noise in ("extension://", "BraveWallet", "EIP-1193", "MetaMask", "ethereum", "solana")):
            return None
        return event

    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=integrations,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.01")),
        environment=os.getenv("APP_ENV", "development"),
        send_default_pii=os.getenv("SENTRY_SEND_PII", "false").lower() in ("1", "true", "yes"),
        release=os.getenv("SENTRY_RELEASE"),
        before_send=_sentry_before_send,
    )
except ImportError:
    sentry_sdk = None

# --- Security headers (Talisman) + response compression (Flask-Compress).
# Both are best-effort: missing libraries shouldn't prevent the app from
# booting in a stripped-down environment (CI, contributor laptop). The
# external UX audit flagged every security header missing AND /api/tools
# at ~730KB uncompressed — these two libs solve both.
try:
    from flask_talisman import Talisman
except ImportError:
    Talisman = None
try:
    from flask_compress import Compress
except ImportError:
    Compress = None


db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()
csrf = CSRFProtect()
cache = Cache()


def _load_local_dotenv(project_root: str) -> None:
    dotenv_path = os.path.join(project_root, ".env")
    if not os.path.exists(dotenv_path):
        return

    try:
        with open(dotenv_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")

                if key and not os.environ.get(key):
                    os.environ[key] = value
    except OSError:
        return


@login_manager.user_loader
def load_user(user_id):
    from app.models import User
    user = User.query.get(int(user_id))
    print(f"[DEBUG USER LOADER] user_id: {user_id}, loaded user: {user}")
    return user



@login_manager.unauthorized_handler
def handle_unauthorized():
    """Return JSON for API calls and redirect browser routes to login."""
    path = (request.path or "").lower()
    if path.startswith("/api/"):
        return {"error": "Authentication required"}, 401
    return redirect("/login")


def _build_database_uri(project_root: str) -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

    local_db_path = os.path.join(project_root, "instance", "ai_compass.db")
    normalized_path = local_db_path.replace('\\', '/')
    return f"sqlite:///{normalized_path}"


def _validate_runtime_config(app: Flask, is_production: bool) -> None:
    if not str(app.config.get("SECRET_KEY") or "").strip():
        raise RuntimeError("Missing required SECRET_KEY.")


def create_app(config: dict | None = None) -> Flask:
    project_root = os.path.dirname(os.path.dirname(__file__))
    _load_local_dotenv(project_root)

    app = Flask(
        __name__,
        instance_relative_config=True,
        static_folder=os.path.join(project_root, "static"),
        static_url_path="/static",
    )
    app.config["JSON_AS_ASCII"] = False

    # Without this, app.logger (and every module logger under it, e.g.
    # app.outreach's `log = logging.getLogger(__name__)`) has no explicit
    # level set anywhere, so it falls back to the Python default root level
    # of WARNING — silently dropping every log.info() call. That's most of
    # this codebase's diagnostic output (background-job progress, discovery
    # pipeline counts, etc.), which made background jobs look silent in
    # Render's logs even when they ran and completed successfully.
    from app.logging import setup_logging
    setup_logging(app)

    # Apply test config first
    if config:
        app.config.update(config)

    app_env = os.getenv("APP_ENV", "development").strip().lower()
    is_production = app_env == "production"

    # FIXED SECRET KEY (no setdefault)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "ai-compass-fixed-key-2024")
    # Stay logged in across browser restarts and server deploys until the
    # user explicitly logs out. The Flask-Login "remember" cookie is signed
    # with SECRET_KEY (stable), so it survives Render's ephemeral session
    # store being wiped on every deploy.
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    app.config["SESSION_REFRESH_EACH_REQUEST"] = True
    app.config["REMEMBER_COOKIE_DURATION"] = timedelta(days=30)
    app.config["REMEMBER_COOKIE_SAMESITE"] = "Lax"
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = timedelta(days=365)
    app.config["REMEMBER_COOKIE_HTTPONLY"] = True
    configured_frontend_url = (app.config.get("FRONTEND_URL") or os.getenv("FRONTEND_URL") or "").strip()
    default_frontend_url = "https://ai-compass.in" if is_production else "http://localhost:5173"
    frontend_url = (configured_frontend_url or default_frontend_url).rstrip("/")
    app.config["FRONTEND_URL"] = frontend_url
    app.config["ADMIN_EMAILS"] = [
        e.strip().lower()
        for e in os.environ.get("ADMIN_EMAILS", "singhmedhansh07@gmail.com").split(",")
        if e.strip()
    ]
    # Address that receives the floating-widget feedback notifications.
    # Separate from ADMIN_EMAILS so support/feedback can go to a different
    # inbox than admin alerts. Override with FEEDBACK_EMAIL env var.
    app.config["FEEDBACK_EMAIL"] = os.environ.get(
        "FEEDBACK_EMAIL", "admin@ai-compass.in"
    ).strip()
    app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "")
    app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET", "")
    app.config["GOOGLE_REDIRECT_URI"] = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/auth/google/callback")
    app.config["GITHUB_CLIENT_ID"] = os.getenv("GITHUB_CLIENT_ID", "")
    app.config["GITHUB_CLIENT_SECRET"] = os.getenv("GITHUB_CLIENT_SECRET", "")
    app.config["LINKEDIN_CLIENT_ID"] = os.getenv("LINKEDIN_CLIENT_ID", "")
    app.config["LINKEDIN_CLIENT_SECRET"] = os.getenv("LINKEDIN_CLIENT_SECRET", "")
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = is_production
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["REMEMBER_COOKIE_SECURE"] = True
    app.config["SESSION_COOKIE_DOMAIN"] = None
    app.config["SESSION_COOKIE_NAME"] = "ai_compass_session"

    if USE_SERVER_SESSION and FileSystemCache is not None:
        session_dir = os.path.join(project_root, 'instance', 'flask_session')
        os.makedirs(session_dir, exist_ok=True)
        app.config['SESSION_TYPE'] = 'cachelib'
        app.config['SESSION_CACHELIB'] = FileSystemCache(
            cache_dir=session_dir,
            threshold=500,
            mode=0o600,
        )

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    _validate_runtime_config(app, is_production)

    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = _build_database_uri(project_root)

    database_uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")
    is_sqlite = database_uri.startswith("sqlite://")
    engine_options = {
        "pool_pre_ping": True,
        # Recycle every 30 minutes instead of 5 — 6× fewer round-trips to Postgres
        # per idle connection, which helps the database auto-suspend.
        "pool_recycle": 1800,
    }
    if not is_sqlite:
        # Small pool: Postgres bills for compute while ANY connection is open and
        # active. 2 persistent + 2 overflow is plenty for a single-worker app
        # and lets auto-suspend kick in during quiet periods.
        engine_options["pool_size"] = 3
        engine_options["max_overflow"] = 5
        engine_options["pool_timeout"] = 30

    if database_uri.startswith("postgres://") or database_uri.startswith("postgresql://"):
        # connect_timeout=10 — if Postgres is cold and unreachable, fail
        # the connection attempt in 10s instead of letting psycopg's
        # default (which is unbounded for libpq) hang gunicorn and
        # cause Render's port scan to time out. 10s is enough for a
        # cold Postgres free-tier dyno to wake (~5s typical).
        engine_options["connect_args"] = {"sslmode": "require", "connect_timeout": 10}
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options

    if USE_SERVER_SESSION:
        Session(app)

    db.init_app(app)
    from flask_migrate import Migrate
    Migrate(app, db)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    csrf.init_app(app)
    
    app.config.setdefault("CACHE_TYPE", "SimpleCache")
    app.config.setdefault("CACHE_DEFAULT_TIMEOUT", 300)
    cache.init_app(app)

    # Security headers via Talisman. HSTS, X-Frame-Options, X-Content-Type-
    # Options, Referrer-Policy, Permissions-Policy all get set automatically.
    #
    # CSP: the static SPA shell carries inline <script>/<style> (theme
    # detector, PostHog init, boot CSS) and React emits inline style
    # attributes; those inline scripts live in a static file we can't nonce
    # at request time, so script-src/style-src use 'unsafe-inline'. Everything
    # else is locked to 'self' plus the specific third parties we actually load
    # — PostHog (analytics) and Google Fonts — with images allowed from any
    # https host because tool logos come from many favicon/logo CDNs.
    # cloudflareinsights is listed defensively in case CF Web Analytics is on.
    # PayPal's JS SDK is loaded by /submit and /sponsor. It needs script, frame,
    # connect and form-action allowances, and the checkout runs inside a PayPal
    # iframe — so a policy that omits any of these fails with an opaque
    # script.onerror and no console detail beyond the CSP violation.
    #
    # This omission silently broke every PayPal *button* on the site; only the
    # plain hosted-button link kept working, because a link navigation isn't a
    # script load. Keep these in sync if the checkout ever moves hosts.
    PAYPAL_HOSTS = "https://*.paypal.com https://*.paypalobjects.com"

    csp = {
        "default-src": "'self'",
        # 'unsafe-inline' needed for PostHog/theme-detector inline scripts in
        # index.html. GA4 loads from googletagmanager.com. PostHog JS from its CDN.
        #
        # 'strict-dynamic' is what makes the PayPal checkout work under a nonce
        # policy. PayPal's HostedButtons component injects a large inline
        # <script> at runtime (window.__pp_form_fields_<BUTTON_ID>, carrying
        # onInit/onClick/getUserInputs/onError). Because a nonce is present,
        # 'unsafe-inline' is IGNORED per CSP3, so that script was blocked
        # (script-src-elem, blockedURI "inline", sourceFile
        # https://www.paypal.com/sdk/js) and the hosted button's click handler
        # and input collection never existed at all. Reproduced in Chrome:
        # without this the global is undefined; with it, all five handlers are
        # present. This affected both the sponsor and Quick Review tiers.
        #
        # PayPal's own documented nonce fix (data-csp-nonce on the SDK script
        # tag, set in SubmitPage.jsx) is necessary but NOT sufficient — it does
        # not propagate to the HostedButtons form-fields script. Verified.
        #
        # 'strict-dynamic' trusts scripts created BY an already-trusted
        # (nonced) script, which covers PayPal's injection without loosening
        # anything for our own markup: a parser-inserted inline script with no
        # nonce is still blocked (verified in-browser). It does make the host
        # allowlist below be ignored in CSP3 browsers — GTM/PostHog/GA still
        # load because our own nonced inline snippets load them — and the
        # allowlist is retained for CSP2-only browsers, which ignore
        # 'strict-dynamic' and fall back to it plus 'unsafe-inline'.
        "script-src": f"'self' 'unsafe-inline' 'strict-dynamic' https://www.googletagmanager.com https://us-assets.i.posthog.com https://us.i.posthog.com https://static.cloudflareinsights.com {PAYPAL_HOSTS}",
        # 'unsafe-inline' is REQUIRED here. Framer Motion (and React itself) inject
        # inline style attributes at runtime for animations. Nonces do NOT apply to
        # style attributes — only to <style> elements — so a nonce-only policy
        # generates ~990 CSP violations per page. unsafe-inline is the correct fix.
        "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src": "'self' https://fonts.gstatic.com data:",
        "img-src": "'self' data: https:",
        # Include ai-compass.in itself so the /ingest PostHog proxy is explicitly
        # allowed as a connect target (some browsers enforce this strictly).
        "connect-src": f"'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://cloudflareinsights.com https://www.google-analytics.com {PAYPAL_HOSTS}",
        "worker-src": "'self' blob:",
        # PayPal renders its checkout and 3-D Secure steps in an iframe. With
        # no frame-src this fell through to default-src 'self' and the payment
        # window could never open.
        "frame-src": f"'self' {PAYPAL_HOSTS}",
        "frame-ancestors": "'self'",
        "base-uri": "'self'",
        "form-action": f"'self' {PAYPAL_HOSTS}",
        "object-src": "'none'",
    }
    if Talisman is not None and not app.config.get("TESTING"):
        Talisman(
            app,
            # force_https=False: Cloudflare already redirects HTTP->HTTPS at
            # the edge (Always Use HTTPS rule), and the HSTS header below
            # tells browsers to keep using HTTPS going forward. Letting
            # Talisman ALSO redirect at the origin breaks Render's internal
            # port-scan probe: the probe hits the service without the
            # `X-Forwarded-Proto: https` header that real Cloudflare traffic
            # carries, Talisman sees the request as insecure and returns a
            # 302, Render's scanner can't follow redirects so reports "No
            # open HTTP ports", and SIGTERMs the worker after ~60s. The same
            # class of problem the canonical-host redirect below already
            # handles by exempting /health and /healthz.
            force_https=False,
            strict_transport_security=True,
            strict_transport_security_max_age=31536000,  # 1 year
            strict_transport_security_include_subdomains=True,
            frame_options="SAMEORIGIN",
            referrer_policy="strict-origin-when-cross-origin",
            content_security_policy=csp,
            # Only apply nonce to script-src. Nonces do NOT work for style
            # attributes (only <style> elements), so including style-src here
            # was what made the CSP strict enough to block Framer Motion's
            # runtime inline styles — causing 990+ violations per page.
            content_security_policy_nonce_in=['script-src'],
            permissions_policy={
                "geolocation": "()",
                "microphone": "()",
                "camera": "()",
                # Was "()", which disables the Payment Request API outright —
                # PayPal's checkout needs it. Scoped to us plus PayPal rather
                # than opened to "*".
                "payment": '(self "https://www.paypal.com")',
                "interest-cohort": "()",  # opt out of FLoC
            },
            session_cookie_secure=is_production,
            session_cookie_http_only=True,
        )

    # Response compression. /api/tools serves ~730KB of JSON every page
    # load; gzip cuts that to ~80KB. Compress also handles HTML, CSS, JS,
    # SVG by default. ~3x overall payload reduction on the directory page.
    if Compress is not None:
        Compress(app)

    # --- Safe blueprint registration (Fix 3b) ---
    def _register_blueprints(app):
        try:
            from app import routes
            app.register_blueprint(routes.main_bp)
        except Exception as e:
            app.logger.error(f"Failed to register routes: {e}")
            raise

        try:
            from app import auth
            app.register_blueprint(auth.auth_bp)
        except Exception as e:
            app.logger.error(f"Failed to register auth: {e}")
            raise

        try:
            from app import api_routes
            app.register_blueprint(api_routes.api_bp, url_prefix="/api/v1")
            app.register_blueprint(api_routes.compat_bp, url_prefix="/api")
        except Exception as e:
            app.logger.error(f"Failed to register api_routes: {e}")
            raise

        try:
            from app.admin_email_routes import admin_email_bp
            app.register_blueprint(admin_email_bp)
        except Exception as e:
            app.logger.error(f"Failed to register admin_email_routes: {e}")
            raise

        try:
            from app.outreach_routes import outreach_bp
            app.register_blueprint(outreach_bp)
        except Exception as e:
            app.logger.error(f"Failed to register outreach_routes: {e}")
            raise

        try:
            from app.community_routes import community_bp
            app.register_blueprint(community_bp, url_prefix="/api/v1/community")
        except Exception as e:
            app.logger.error(f"Failed to register community_routes: {e}")
            raise

        try:
            from app.claims_routes import claims_bp
            app.register_blueprint(claims_bp, url_prefix="/api/v1/claims")
        except Exception as e:
            app.logger.error(f"Failed to register claims_routes: {e}")
            raise

        try:
            from app.editorial_routes import editorial_bp
            app.register_blueprint(editorial_bp, url_prefix="/api/v1/reviews")
        except Exception as e:
            app.logger.error(f"Failed to register editorial_routes: {e}")
            raise

        try:
            from app import oauth
            app.register_blueprint(oauth.oauth_bp)
            oauth.init_oauth(app)
        except Exception as e:
            app.logger.warning(f"OAuth not available: {e}")
            # OAuth is optional — do not raise

    _register_blueprints(app)

    canonical_host = os.getenv("CANONICAL_HOST", "").strip().lower()
    if not canonical_host and frontend_url:
        parsed_frontend_url = urlparse(frontend_url if "://" in frontend_url else f"https://{frontend_url}")
        canonical_host = (parsed_frontend_url.hostname or "").strip().lower()

    @app.before_request
    def clear_g_for_testing():
        if app.config.get("TESTING"):
            from flask import g
            for key in list(g.__dict__.keys()):
                g.__dict__.pop(key, None)

    @app.before_request
    def make_session_permanent():
        # Without this the session cookie is a browser-session cookie that
        # dies when the tab/browser closes. Permanent => it lasts
        # PERMANENT_SESSION_LIFETIME (30 days) instead.
        #
        # But: touching `session.permanent` on an empty session marks it
        # modified, and Flask-Session then writes a Set-Cookie header on
        # every response — even for anonymous visitors who never log in.
        # Production was sending `Set-Cookie: ai_compass_session=;
        # Max-Age=0` on every request as a result. Only flip the flag
        # once the session has real content (logged in, flash messages,
        # OAuth state, etc.).
        if session and not session.permanent:
            session.permanent = True

    # Self-scheduled new-tools digest. Render free tier has no cron, so we
    # piggyback on request traffic (the keep-alive ping alone is enough to
    # keep this ticking). Per-request cost is a single monotonic compare;
    # at most every 30 min per process it spawns a daemon thread that does
    # the DB-claimed, once-per-day actual run. State is per-process — the
    # atomic DB claim in maybe_run_digest() serialises across workers.
    _digest_tick_state = {"last": 0.0}
    _DIGEST_TICK_MIN_GAP = 1800  # seconds between considering a run

    @app.before_request
    def digest_tick():
        # Never spawn the background scheduler under tests — it would race
        # the shared test DB session and make unrelated tests flaky.
        if app.config.get("TESTING"):
            return None
        now = time.monotonic()
        if now - _digest_tick_state["last"] < _DIGEST_TICK_MIN_GAP:
            return None
        _digest_tick_state["last"] = now

        def _run():
            with app.app_context():
                try:
                    from app.digest import maybe_run_digest
                    maybe_run_digest()
                except Exception:  # noqa: BLE001
                    app.logger.exception("digest_tick background run failed")
                # Separate try: a failing digest must not stop the recap,
                # and vice versa. Each owns its own DB-claimed interval, so
                # sharing this thread only shares the wake-up, not the
                # schedule (daily vs weekly).
                try:
                    from app.community_recap import maybe_run_recap
                    maybe_run_recap()
                except Exception:  # noqa: BLE001
                    app.logger.exception("community recap tick background run failed")
                # Monthly, and its own DB-claimed interval again — this
                # thread shares only the wake-up, never the schedule.
                try:
                    from app.founder_report import maybe_run_reports
                    maybe_run_reports()
                except Exception:  # noqa: BLE001
                    app.logger.exception("founder report tick background run failed")
                # Launch Days fire on the date the founder picked. No claim
                # key needed: launched_at is the idempotency guard, so a
                # second worker running this simultaneously fires nothing
                # twice.
                try:
                    from app.launch_day import fire_due_launches
                    fired = fire_due_launches()
                    if fired:
                        app.logger.info("Launch Day fired for: %s", ", ".join(fired))
                except Exception:  # noqa: BLE001
                    app.logger.exception("launch day tick background run failed")

        threading.Thread(target=_run, name="digest-tick", daemon=True).start()
        return None

    @app.before_request
    def enforce_canonical_host():
        # WHY: health endpoints must return 200 directly, never a 308 redirect.
        # Render's internal port-scan probe hits the service via its .onrender.com
        # hostname; the canonical-host redirect below would otherwise mark every
        # probe response as 3XX and cause Render to SIGTERM the worker within
        # seconds of startup.
        if request.path in ('/healthz', '/health'):
            return None
        if app.config.get("TESTING") or not is_production or not canonical_host:
            return None

        request_host = request.host.split(":", 1)[0].strip().lower()
        if not request_host or request_host == canonical_host:
            return None

        if request_host in {"localhost", "127.0.0.1"}:
            return None

        # Allow Render probe hostnames, www subdomain, and container IP addresses to pass
        # through without a canonical redirect.
        import re
        is_ip = bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}$", request_host))
        if is_ip or request_host == f"www.{canonical_host}" or request_host.endswith(".onrender.com"):
            return None

        query = f"?{request.query_string.decode('utf-8')}" if request.query_string else ""
        return redirect(f"https://{canonical_host}{request.path}{query}", code=308)

    @app.before_request
    def enforce_user_sessions():
        from flask import session, jsonify, redirect, request
        from flask_login import current_user, logout_user
        import uuid
        from datetime import datetime, timezone
        from app.models import UserSession

        if request.path.startswith('/static') or request.path.startswith('/assets') or request.path in ('/healthz', '/health'):
            return None
        if not (current_user and current_user.is_authenticated):
            return None

        # Determine client IP
        forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
        ip = forwarded.split(",")[0].strip() if forwarded else str(request.remote_addr or "unknown")

        session_uuid = session.get('user_uuid')

        if not session_uuid:
            # ── New session ─────────────────────────────────────────────────
            # CRITICAL: resolve geolocation BEFORE opening any DB connection.
            # ip-api.com blocks up to 0.8 s. If called inside a DB transaction
            # the connection stays open the whole time. With pool_size=2 +
            # overflow=2 (4 slots) and 4 gthreads this deadlocks the pool and
            # makes every request stall ("keeps loading" symptom).
            location = "Unknown"
            if app.config.get("TESTING") or ip in ("127.0.0.1", "localhost", "::1", "unknown"):
                location = "Local Network"
            else:
                try:
                    import requests as _geo_req
                    resp = _geo_req.get(f"http://ip-api.com/json/{ip}", timeout=0.8)
                    if resp.status_code == 200:
                        data = resp.json()
                        city = data.get("city")
                        country = data.get("country")
                        if city and country:
                            location = f"{city}, {country}"
                        elif country:
                            location = country
                except Exception:
                    pass

            # Geolocation resolved — now open DB, write, and release quickly.
            session_uuid = str(uuid.uuid4())
            session['user_uuid'] = session_uuid
            user_agent = request.headers.get("User-Agent", "Unknown Browser")[:500]
            try:
                new_sess = UserSession(
                    session_uuid=session_uuid,
                    user_id=current_user.id,
                    ip_address=ip,
                    user_agent=user_agent,
                    location=location,
                    last_active_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc),
                )
                db.session.add(new_sess)
                db.session.commit()
            except Exception:
                db.session.rollback()
        else:
            # ── Existing session: verify still valid ─────────────────────────
            try:
                db_session = UserSession.query.filter_by(
                    session_uuid=session_uuid, user_id=current_user.id
                ).first()
            except Exception:
                db.session.rollback()
                return None

            if not db_session:
                # Session revoked — log out.
                logout_user()
                session.pop('user_uuid', None)
                if request.path.startswith('/api/'):
                    return jsonify({"error": "Session revoked"}), 401
                return redirect('/')

            now = datetime.now(timezone.utc)
            last_active = db_session.last_active_at
            if last_active.tzinfo is None:
                last_active = last_active.replace(tzinfo=timezone.utc)

            if (now - last_active).total_seconds() > 60:
                ip_changed = db_session.ip_address != ip

                # Resolve geolocation BEFORE touching the DB (same reason above).
                new_location = None
                if ip_changed:
                    if app.config.get("TESTING") or ip in ("127.0.0.1", "localhost", "::1", "unknown"):
                        new_location = "Local Network"
                    else:
                        try:
                            import requests as _geo_req
                            resp = _geo_req.get(f"http://ip-api.com/json/{ip}", timeout=0.8)
                            if resp.status_code == 200:
                                data = resp.json()
                                city = data.get("city")
                                country = data.get("country")
                                if city and country:
                                    new_location = f"{city}, {country}"
                                elif country:
                                    new_location = country
                        except Exception:
                            pass

                # Short DB update — connection acquired and released in <5 ms.
                try:
                    db_session.last_active_at = now
                    if ip_changed:
                        db_session.ip_address = ip
                        if new_location:
                            db_session.location = new_location
                    db_session.user_agent = request.headers.get("User-Agent", "Unknown Browser")[:500]
                    db.session.commit()
                except Exception:
                    db.session.rollback()

        return None

    # Paths an authenticated must_change_password=True user may still hit.
    # Everything else under /api/ is "authenticated functionality" and gets
    # rejected server-side — a client-side-only redirect would be trivially
    # bypassable by calling the API directly (Constraint 3).
    _PASSWORD_GATE_ALLOWED_API_PATHS = {
        "/api/v1/auth/me",
        "/api/v1/auth/logout",
        "/api/v1/auth/change-password",
        # A must_change_password user who still carries a valid remember-me
        # session (e.g. a second login attempt without logging out first)
        # would otherwise have this gate reject the login POST itself before
        # it's ever processed — surfacing "password_change_required" as a
        # login error instead of either logging them in or bouncing them to
        # the change-password page.
        "/api/v1/auth/login",
    }

    @app.before_request
    def enforce_password_change_gate():
        from flask import jsonify
        from flask_login import current_user

        if not request.path.startswith('/api/'):
            # Non-API routes serve the SPA shell/static assets — the SPA's
            # own must_change_password check redirects the user client-side.
            # Blocking the shell itself would just break the page before it
            # can render that redirect.
            return None
        if not (current_user and current_user.is_authenticated):
            return None
        if not bool(getattr(current_user, "must_change_password", False)):
            return None
        if request.path in _PASSWORD_GATE_ALLOWED_API_PATHS:
            return None

        return jsonify({"error": "password_change_required"}), 403

    @app.before_request
    def setup_nonce():
        import secrets
        from flask import g, request
        # Populate g.csp_nonce using request's talisman csp_nonce or a secure fallback.
        g.csp_nonce = getattr(request, 'csp_nonce', None) or secrets.token_hex(16)

    @app.before_request
    def gate_options():
        from flask import request
        if request.method == 'OPTIONS':
            origin = request.headers.get('Origin')
            acrm = request.headers.get('Access-Control-Request-Method')
            if not origin or not acrm:
                return 'Method Not Allowed', 405

    @app.after_request
    def add_cors(response):
        origin = request.headers.get('Origin', '')

        allowed_production_origins = [
            'https://ai-compass.in',
            'https://www.ai-compass.in',
            'https://ai-compass.onrender.com',
            'https://ai-compass-1.onrender.com',
            os.getenv('FRONTEND_URL', ''),
        ]

        is_allowed = (
            any(origin == o for o in allowed_production_origins if o)
            or (not is_production and origin.startswith('http://localhost:'))
        )

        if is_allowed:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-CSRFToken'

        # Disable information fingerprinting by stripping platform headers
        response.headers.pop('X-Powered-By', None)
        response.headers.pop('X-Runtime', None)
        response.headers.pop('X-Version', None)
        response.headers['Server'] = 'SecureServer'  # Completely overwrite verbose Server signatures
        return response

    # ── Defer ALL DB-touching startup to a background thread ─────────────
    # On Postgres' free tier the DB sometimes wakes from sleep on first
    # connection (5-10s), and unpickling the recommender model adds
    # another second or two. Doing both inline at create_app() time used
    # to push total import-to-port-bind past Render's port-scan timeout
    # (~30s), so Render SIGTERM'd the worker before it ever served a
    # request — restart loop, deploys failing.
    #
    # Both ops are designed to be lazy: get_cached_tools() and
    # load_model() both populate on first call if not yet primed. The
    # background thread just warms the cache in parallel with gunicorn
    # binding to the port, so the first user request hits a warm cache
    # without blocking startup.
    if not app.config.get("TESTING"):
        # Guard: only run the heavy warmup phases once per deployment.
        #
        # gunicorn.conf.py runs with preload_app=False, so create_app() is
        # called independently in every worker — an os.environ sentinel set
        # in one worker is invisible to the next. That was harmless while
        # workers=1 with no recycling (warmup ran once at boot, process
        # lived forever), but gunicorn now recycles the worker every
        # ~400 requests (max_requests) to cap RAM growth on Render's
        # 512 MB free tier. Without a cross-process guard, each recycled
        # worker would replay the full migrate + catalog seed/sync + prime
        # — a memory spike and DB churn on a schedule.
        #
        # A marker file in the container's tmp dir survives worker recycles
        # but not a redeploy (fresh container = empty /tmp), so the heavy
        # phases run exactly once per deployment, which is the intent.
        #
        # The marker is written only once the SCHEMA phase has actually
        # finished, never up-front. Writing it before the work was the bug
        # that took /api/v1/community/sponsors and every submissions read to
        # a 500: this worker claimed the warmup, died partway through the
        # ALTER TABLE guarantees (recycled at max_requests, or OOM-killed on
        # the 512 MB tier), and the marker it had already written told every
        # later worker the schema was done. flask_migrate.upgrade() has never
        # progressed on this database, so those raw-SQL ALTERs are the only
        # thing that adds a new column — half of them running leaves the app
        # querying columns that do not exist, with no way to retry.
        _WARMUP_SENTINEL = "AI_COMPASS_WARMUP_DONE"
        _warmup_marker = os.path.join(tempfile.gettempdir(), "ai_compass_warmup.done")
        _warmup_status_file = os.path.join(tempfile.gettempdir(), "ai_compass_warmup.json")
        _first_warmup = (
            os.environ.get(_WARMUP_SENTINEL) != "1"
            and not os.path.exists(_warmup_marker)
        )
        if _first_warmup:
            # Process-local only. Stops this worker double-starting the
            # thread; deliberately does NOT stop a *later* worker retrying,
            # which is what makes a half-finished schema phase recoverable.
            os.environ[_WARMUP_SENTINEL] = "1"

        app.warmup_status = {
            "migrate": "pending",
            "db_create": "pending",
            "users_alter": "pending",
            "schema": "pending",
            "seed": "pending",
            "sync": "pending",
            "error": None
        }

        def _publish_warmup_status():
            """Persist status so /healthz-detailed can answer from any worker.

            Without this, every recycled worker reported {"...": "skipped"},
            which is why a half-applied schema stayed invisible.
            """
            try:
                with open(_warmup_status_file, "w") as _sf:
                    json.dump(app.warmup_status, _sf)
            except OSError:
                pass

        def _warm_up():
            try:
                with app.app_context():
                    try:
                        from flask_migrate import upgrade as db_upgrade
                        db_upgrade()
                        print("[WARMUP] flask db upgrade done", flush=True)
                        app.warmup_status["migrate"] = "success"
                    except Exception as e:
                        print(f"[WARMUP] migrate skipped: {e}", flush=True)
                        app.warmup_status["migrate"] = f"skipped: {e}"

                    try:
                        from app.models import ReviewVote  # noqa: F401
                        db.create_all()
                        print("[WARMUP] db.create_all() done", flush=True)
                        app.warmup_status["db_create"] = "success"
                    except Exception as e:
                        print(f"[WARMUP] db.create_all() error: {e}", flush=True)
                        app.warmup_status["db_create"] = f"error: {e}"

                    # Raw SQL Fallback: Guarantee that user profile columns exist
                    is_postgres = db.engine.name in ("postgresql", "postgres")
                    if_not_exists = "IF NOT EXISTS " if is_postgres else ""

                    # Every ADD COLUMN below is individually try/excepted so
                    # one unrelated failure can't abort the rest. That made
                    # partial application silent, so record it: the phase is
                    # only "complete" if nothing was left undone, and only a
                    # complete phase claims the once-per-deploy marker.
                    _schema_failures = []

                    def _add_column(table, col_name, col_type):
                        """Idempotent ADD COLUMN. Returns True if the column
                        is present afterwards (added, or already there)."""
                        from sqlalchemy import text
                        try:
                            db.session.execute(text(
                                f"ALTER TABLE {table} ADD COLUMN {if_not_exists}{col_name} {col_type};"
                            ))
                            db.session.commit()
                            return True
                        except Exception as exc:
                            db.session.rollback()
                            # On SQLite (no IF NOT EXISTS) "duplicate column"
                            # is the success case, not a failure.
                            if "duplicate column" in str(exc).lower():
                                return True
                            _schema_failures.append(f"{table}.{col_name}: {exc}")
                            print(f"[WARMUP] ADD COLUMN {table}.{col_name} failed: {exc}", flush=True)
                            return False

                    try:
                        from sqlalchemy import text
                        db.session.execute(text(f"ALTER TABLE users ADD COLUMN {if_not_exists}is_verified BOOLEAN NOT NULL DEFAULT FALSE;"))
                        db.session.commit()
                        print("[WARMUP] is_verified column check completed.", flush=True)
                        app.warmup_status["users_alter"] = "success"
                    except Exception as alter_err:
                        db.session.rollback()
                        print(f"[WARMUP] Alter table users check completed: {alter_err}", flush=True)
                        app.warmup_status["users_alter"] = f"check_complete: {alter_err}"

                    for col_name, col_type in [
                        ("is_profile_public", "BOOLEAN NOT NULL DEFAULT FALSE"),
                        ("public_username", "VARCHAR(255)"),
                        ("bio", "TEXT"),
                        ("github_username", "VARCHAR(255)"),
                        ("linkedin_username", "VARCHAR(255)"),
                        ("twitter_username", "VARCHAR(255)"),
                        # Forces a password change on first login for accounts
                        # auto-created for a paid submission's founder — see
                        # app/founder_accounts.py.
                        ("must_change_password", "BOOLEAN NOT NULL DEFAULT FALSE"),
                    ]:
                        _add_column("users", col_name, col_type)

                    # Same fallback for outreach_candidates: flask_migrate.upgrade()
                    # above has never actually progressed past the very first
                    # migration on this DB (alembic_version isn't stamped, so it
                    # keeps retrying "-> 79c4860332f8" and fails on tables that
                    # already exist) — db.create_all() only creates missing
                    # tables, it can't add columns to ones that already exist,
                    # so new columns on existing tables need this same raw-SQL
                    # guarantee the users table columns above already rely on.
                    for col_name, col_type in [
                        ("verification_result", "VARCHAR(20)"),
                        ("verified_at", "TIMESTAMP"),
                        ("fit_score", "INTEGER"),
                        ("draft_template_version", "INTEGER"),
                    ]:
                        _add_column("outreach_candidates", col_name, col_type)

                    # Same fallback for submissions: the payment-verification
                    # migration (a4e91c2b7d3f) never applied here either, for
                    # the same reason as above — without these columns, every
                    # Submission insert in api_routes.py raises UndefinedColumn
                    # and gets silently swallowed (rollback + log only), so
                    # paid submissions were never actually being persisted.
                    for col_name, col_type in [
                        ("payment_status", "VARCHAR(20) NOT NULL DEFAULT 'unpaid'"),
                        ("payment_note", "VARCHAR(255)"),
                        ("is_priority", "BOOLEAN NOT NULL DEFAULT FALSE"),
                        # Links a paid-tier submission to its founder's User
                        # account (see app/founder_accounts.py). No inline
                        # REFERENCES here — Postgres allows it, but keeping
                        # this fallback symmetric with the other ADD COLUMN
                        # calls above (which never define constraints either)
                        # means one thing to reason about if it ever needs to
                        # retry against a partially-applied table.
                        ("founder_user_id", "INTEGER"),
                        ("welcome_email_sent_at", "TIMESTAMP"),
                        # Owner test rows, excluded from admin revenue and
                        # paid-attempt reporting. See Submission.is_test.
                        ("is_test", "BOOLEAN NOT NULL DEFAULT FALSE"),
                        # Start of the clock for time-boxed paid perks.
                        # See Submission.approved_at.
                        ("approved_at", "TIMESTAMP"),
                        # Launch Day: the founder-chosen date the perks fire
                        # on, and the stamp that keeps them firing once.
                        ("launch_at", "TIMESTAMP"),
                        ("launched_at", "TIMESTAMP"),
                    ]:
                        _add_column("submissions", col_name, col_type)

                    # Same fallback for catalog_tools: staggered-release gate
                    # (visible_at) added after this table already existed on
                    # Render, so it needs the same raw-SQL guarantee above.
                    _add_column("catalog_tools", "visible_at", "TIMESTAMP")

                    # Same fallback for catalog_tools.editorial_blurb (admin-
                    # authored Sponsored-tier description override).
                    _add_column("catalog_tools", "editorial_blurb", "TEXT")

                    # reviews.maker_reply: a claimed maker's public answer to
                    # one review (see app/claims.py). create_all() below adds
                    # missing TABLES but never missing COLUMNS, so an existing
                    # reviews table needs the same raw-SQL guarantee as the
                    # columns above — without it every review read raises
                    # UndefinedColumn and the tool page loses its reviews.
                    for col_name, col_type in [
                        ("maker_reply", "VARCHAR(1000)"),
                        ("maker_reply_at", "TIMESTAMP"),
                    ]:
                        _add_column("reviews", col_name, col_type)

                    # The schema phase is the part that must not be left half
                    # done. Claim the once-per-deploy marker only now, and
                    # only if every column landed — a failure here leaves the
                    # marker absent so the next worker (recycled at
                    # max_requests) retries instead of inheriting a database
                    # the code cannot query.
                    if _schema_failures:
                        app.warmup_status["schema"] = f"incomplete: {'; '.join(_schema_failures[:5])}"
                        print(
                            f"[WARMUP] schema INCOMPLETE ({len(_schema_failures)} column(s)); "
                            "marker not written, a later worker will retry.",
                            flush=True,
                        )
                    else:
                        app.warmup_status["schema"] = "success"
                        try:
                            with open(_warmup_marker, "w") as _mf:
                                _mf.write("1")
                        except OSError as exc:
                            print(f"[WARMUP] could not write marker {_warmup_marker}: {exc}", flush=True)
                    _publish_warmup_status()

                    try:
                        from app.catalog_store import seed_from_json_if_empty, sync_catalog_from_json, sync_ratings_and_verifications_from_json
                        seeded = seed_from_json_if_empty()
                        synced_count = sync_catalog_from_json()
                        print(f"[WARMUP] catalog seed: {seeded} inserted, synced: {synced_count} tools", flush=True)
                        app.warmup_status["seed"] = f"success ({seeded} inserted, {synced_count} synced)"
                        synced = sync_ratings_and_verifications_from_json()
                        print(f"[WARMUP] catalog ratings/verifications sync: {synced} rows updated", flush=True)
                        app.warmup_status["sync"] = f"success ({synced} synced)"
                    except Exception as e:
                        print(f"[WARMUP] catalog seed/sync skipped: {e}", flush=True)
                        app.warmup_status["error"] = str(e)

                    if not os.environ.get("SECRET_KEY"):
                        try:
                            import secrets as _secrets

                            from app.models import AppSetting
                            row = AppSetting.query.filter_by(key="secret_key").first()
                            if row is None:
                                row = AppSetting(key="secret_key", value=_secrets.token_hex(32))
                                db.session.add(row)
                                db.session.commit()
                                print("[WARMUP] generated & persisted a new SECRET_KEY", flush=True)
                            app.config["SECRET_KEY"] = row.value
                            app.secret_key = row.value
                        except Exception as e:
                            db.session.rollback()
                            print(f"[WARMUP] DB SECRET_KEY unavailable, using fallback: {e}", flush=True)

                    print(f"[WARMUP] cwd: {os.getcwd()}", flush=True)

                    try:
                        print("[WARMUP] Loading tools...", flush=True)
                        prime_tools_cache(DEFAULT_TOOLS_PATH)
                        print(f"[WARMUP] Loaded {len(get_cached_tools())} tools", flush=True)
                    except Exception as exc:  # noqa: BLE001
                        print(f"[WARMUP] Tools prime skipped: {exc}", flush=True)

                    print("[WARMUP] ML model loading skipped (memory budget: free-tier 512MB)", flush=True)
                    
                    _publish_warmup_status()

                    # Inside the with block, explicitly try to remove session
                    try:
                        db.session.remove()
                    except Exception as exc:
                        print(f"[WARMUP] Failed to remove session: {exc}", flush=True)

            except Exception as e:
                print(f"[WARMUP] Unhandled exception in warmup thread: {e}", flush=True)

    is_cli = sys.argv and any(x in sys.argv[0] or x in sys.argv for x in ['flask', 'db', 'migrate', 'manage.py'])

    if not app.config.get("TESTING") and _first_warmup and not is_cli:
        app._warmup_started = True
        threading.Thread(target=_warm_up, name="warmup", daemon=True).start()
    elif not app.config.get("TESTING"):
        print("[WARMUP] Skipped — already ran in this process (worker recycle).", flush=True)
        app.warmup_status = {k: "skipped" for k in app.warmup_status}


    @app.context_processor
    def inject_global_template_vars():
        return {
            "category_counts": {}
        }

    # WHY: minimal health endpoint for Render port-scan probes. Returns
    # immediately with no DB, no auth, no template render. Exempt from
    # canonical-host redirect via the before_request guard above.
    @app.route('/healthz')
    def healthz():
        return 'ok', 200, {'Content-Type': 'text/plain'}

    @app.route('/healthz-detailed')
    def healthz_detailed():
        from flask import jsonify
        status = getattr(app, "warmup_status", {"message": "Not initialized / testing mode"})
        # A recycled worker never ran warmup, so its own dict is all
        # "skipped" — which reported a healthy-looking nothing while the
        # schema was in fact half applied. Prefer the status the worker that
        # actually did the work left behind.
        if all(v == "skipped" for v in status.values()):
            try:
                marker = os.path.join(tempfile.gettempdir(), "ai_compass_warmup.json")
                with open(marker) as _sf:
                    status = {**json.load(_sf), "reported_by": "warmup worker"}
            except (OSError, ValueError):
                pass
        return jsonify(status), 200

    @app.route('/debug-threads')
    def debug_threads():
        import threading
        import traceback
        import sys
        from flask import jsonify

        # Stack traces name absolute server paths, installed packages and
        # in-flight frames. That is a fine debugging aid and a bad thing to
        # serve anonymously on the public internet, which is what it was
        # doing. Opt in explicitly per deploy.
        if os.environ.get("ENABLE_DEBUG_THREADS", "").lower() not in ("1", "true", "yes"):
            from flask import abort
            abort(404)

        id_to_thread = {t.ident: t for t in threading.enumerate()}
        res = []
        for thread_id, frame in sys._current_frames().items():
            t = id_to_thread.get(thread_id)
            t_name = t.name if t else "Unknown"
            res.append({
                "thread_id": thread_id,
                "name": t_name,
                "stack": traceback.format_stack(frame)
            })
        return jsonify(res), 200

    return app