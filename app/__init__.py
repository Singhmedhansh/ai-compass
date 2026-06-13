import os
import sys
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

    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=integrations,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.01")),
        environment=os.getenv("APP_ENV", "development"),
        send_default_pii=os.getenv("SENTRY_SEND_PII", "false").lower() in ("1", "true", "yes"),
        release=os.getenv("SENTRY_RELEASE"),
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
        "FEEDBACK_EMAIL", "medhansh.builds@gmail.com"
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
    engine_options = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    if database_uri.startswith("postgres://") or database_uri.startswith("postgresql://"):
        # connect_timeout=10 — if Neon is cold and unreachable, fail
        # the connection attempt in 10s instead of letting psycopg's
        # default (which is unbounded for libpq) hang gunicorn and
        # cause Render's port scan to time out. 10s is enough for a
        # cold Neon free-tier dyno to wake (~5s typical).
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
    csp = {
        "default-src": "'self'",
        "script-src": "'self' https://us-assets.i.posthog.com https://us.i.posthog.com https://static.cloudflareinsights.com",
        "style-src": "'self' https://fonts.googleapis.com",
        "font-src": "'self' https://fonts.gstatic.com data:",
        "img-src": "'self' data: https:",
        "connect-src": "'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://cloudflareinsights.com",
        "worker-src": "'self' blob:",
        "frame-ancestors": "'self'",
        "base-uri": "'self'",
        "form-action": "'self'",
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
            content_security_policy_nonce_in=['script-src', 'style-src'],
            permissions_policy={
                "geolocation": "()",
                "microphone": "()",
                "camera": "()",
                "payment": "()",
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
        if current_user and current_user.is_authenticated:
            session_uuid = session.get('user_uuid')



            # Determine client IP
            forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
            ip = forwarded.split(",")[0].strip() if forwarded else str(request.remote_addr or "unknown")

            if not session_uuid:
                # generate new session
                session_uuid = str(uuid.uuid4())
                session['user_uuid'] = session_uuid

                user_agent = request.headers.get("User-Agent", "Unknown Browser")[:500]

                # location geolocator helper
                location = "Unknown"
                if app.config.get("TESTING") or ip in ("127.0.0.1", "localhost", "::1", "unknown"):
                    location = "Local Network"
                else:
                    try:
                        import requests
                        resp = requests.get(f"http://ip-api.com/json/{ip}", timeout=0.8)
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

                new_sess = UserSession(
                    session_uuid=session_uuid,
                    user_id=current_user.id,
                    ip_address=ip,
                    user_agent=user_agent,
                    location=location,
                    last_active_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc)
                )
                db.session.add(new_sess)
                db.session.commit()
            else:
                db_session = UserSession.query.filter_by(session_uuid=session_uuid, user_id=current_user.id).first()
                if not db_session:
                    # Session has been revoked! Log out the user.
                    logout_user()
                    session.pop('user_uuid', None)
                    if request.path.startswith('/api/'):
                        return jsonify({"error": "Session revoked"}), 401
                    return redirect('/')
                else:
                    now = datetime.now(timezone.utc)
                    # Update at most once per 60 seconds
                    last_active = db_session.last_active_at
                    if last_active.tzinfo is None:
                        last_active = last_active.replace(tzinfo=timezone.utc)
                    if (now - last_active).total_seconds() > 60:
                        db_session.last_active_at = now
                        if db_session.ip_address != ip:
                            db_session.ip_address = ip
                            # location geolocator helper
                            location = "Unknown"
                            if app.config.get("TESTING") or ip in ("127.0.0.1", "localhost", "::1", "unknown"):
                                location = "Local Network"
                            else:
                                try:
                                    import requests
                                    resp = requests.get(f"http://ip-api.com/json/{ip}", timeout=0.8)
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
                            db_session.location = location
                        db_session.user_agent = request.headers.get("User-Agent", "Unknown Browser")[:500]
                        db.session.commit()
        return None

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
    # On Neon's free tier the DB sometimes wakes from sleep on first
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
        def _warm_up():
            with app.app_context():
                # Phase 1 — DB schema bootstrap. Used to run inline in
                # create_app() but a cold Neon connection could take 30+s
                # to wake, which pushed total startup past Render's
                # port-scan timeout. Running here lets gunicorn bind the
                # port immediately and serve /health (which has its own
                # try/except around SELECT 1) while we work.
                try:
                    from flask_migrate import upgrade as db_upgrade
                    db_upgrade()
                    print("[WARMUP] flask db upgrade done", flush=True)
                except Exception as e:
                    print(f"[WARMUP] migrate skipped: {e}", flush=True)

                try:
                    from app.models import ReviewVote  # noqa: F401
                    db.create_all()
                    print("[WARMUP] db.create_all() done", flush=True)
                except Exception as e:
                    print(f"[WARMUP] db.create_all() error: {e}", flush=True)

                # Raw SQL Fallback: Guarantee that the is_verified column exists in the users table
                try:
                    from sqlalchemy import text
                    db.session.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;"))
                    db.session.commit()
                    print("[WARMUP] Successfully added is_verified column to users table via raw SQL fallback.", flush=True)
                except Exception as alter_err:
                    db.session.rollback()
                    print(f"[WARMUP] Alter table users check/addition completed: {alter_err}", flush=True)

                # Raw SQL Fallback: Guarantee that public profile columns exist
                for col_name, col_type in [
                    ("is_profile_public", "BOOLEAN NOT NULL DEFAULT FALSE"),
                    ("public_username", "VARCHAR(255)"),
                    ("bio", "TEXT"),
                    ("github_username", "VARCHAR(255)"),
                    ("linkedin_username", "VARCHAR(255)"),
                    ("twitter_username", "VARCHAR(255)")
                ]:
                    try:
                        from sqlalchemy import text
                        db.session.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};"))
                        db.session.commit()
                        print(f"[WARMUP] Successfully added {col_name} to users table.", flush=True)
                    except Exception as err:
                        db.session.rollback()
                        print(f"[WARMUP] Column {col_name} already exists or failed to add: {err}", flush=True)

                # One-time import of tools.json into the durable DB
                # catalog. Idempotent — no-ops once seeded. If this
                # fails, the cache will fall back to tools.json.
                try:
                    from app.catalog_store import seed_from_json_if_empty
                    seeded = seed_from_json_if_empty()
                    print(f"[WARMUP] catalog seed: {seeded} rows inserted", flush=True)
                except Exception as e:
                    print(f"[WARMUP] catalog seed skipped: {e}", flush=True)

                # SECRET_KEY rotation when no env var is set. Only runs
                # in the rare config where SECRET_KEY isn't provided by
                # Render — otherwise the env value set up top wins and
                # this whole block is a no-op. If the DB query fails
                # here, the env fallback set during config still works,
                # so requests don't break.
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

                # Phase 2 — cache priming. Reads from DB so has to wait
                # for the DB to be reachable.
                try:
                    print("[WARMUP] Loading tools...", flush=True)
                    prime_tools_cache(DEFAULT_TOOLS_PATH)
                    print(f"[WARMUP] Loaded {len(get_cached_tools())} tools", flush=True)
                except Exception as exc:  # noqa: BLE001
                    print(f"[WARMUP] Tools prime skipped: {exc}", flush=True)

                try:
                    from app.ml_recommender import load_model as _load_recommender_model
                    _load_recommender_model()
                    print("[WARMUP] Recommender model loaded", flush=True)
                except Exception as exc:  # noqa: BLE001
                    print(f"[WARMUP] Recommender preload skipped: {exc}", flush=True)

                # Train the recommender on first boot if the .pkl is
                # missing. Subprocess can take up to 120s, so it
                # ABSOLUTELY can't be on the request-serving path.
                try:
                    model_path = os.path.join(project_root, 'data', 'recommendation_model.pkl')
                    if not os.path.exists(model_path):
                        print("[WARMUP] Training ML model on first startup...", flush=True)
                        train_script = os.path.join(project_root, 'scripts', 'train_model.py')
                        if os.path.exists(train_script):
                            import subprocess
                            result = subprocess.run(
                                [sys.executable, train_script],
                                capture_output=True, text=True, cwd=project_root, timeout=120
                            )
                            if result.returncode == 0:
                                print("[WARMUP] ML model trained successfully", flush=True)
                            else:
                                print("[WARMUP] ML model training failed:", result.stderr[:500], flush=True)
                except Exception as exc:  # noqa: BLE001
                    print(f"[WARMUP] ML model auto-train skipped: {exc}", flush=True)

        threading.Thread(target=_warm_up, name="warmup", daemon=True).start()

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

    return app