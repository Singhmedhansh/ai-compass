import os
from collections import Counter
from flask import Flask, render_template, session, request, jsonify, current_app
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, current_user
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from sqlalchemy import inspect, text
from whitenoise import WhiteNoise

from app.tool_cache import get_cached_tools, prime_tools_cache


db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()
csrf = CSRFProtect()


def _load_local_dotenv(project_root: str) -> None:
    """Load key-value pairs from .env when present (development convenience)."""
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
                if not key:
                    continue

                existing = os.environ.get(key)
                if existing is None or str(existing).strip() == "":
                    os.environ[key] = value
    except OSError:
        # Keep startup resilient even if the local env file can't be read.
        return


@login_manager.user_loader
def load_user(user_id):
    from app.models import User

    return User.query.get(int(user_id))


def _build_database_uri(app: Flask) -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        # Render/Railway may expose postgres:// URLs; SQLAlchemy expects postgresql://
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

    mysql_user = app.config["MYSQL_USER"]
    mysql_password = app.config["MYSQL_PASSWORD"]
    mysql_host = app.config["MYSQL_HOST"]
    mysql_db = app.config["MYSQL_DB"]

    if mysql_user and mysql_password and mysql_host and mysql_db:
        return f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}/{mysql_db}"

    # Local fallback keeps development unblocked when MySQL is not available.
    return "sqlite:///ai_compass.db"


def _is_strong_password(value: str) -> bool:
    text = str(value or "")
    if len(text) < 12:
        return False

    has_upper = any(ch.isupper() for ch in text)
    has_lower = any(ch.islower() for ch in text)
    has_digit = any(ch.isdigit() for ch in text)
    has_symbol = any(not ch.isalnum() for ch in text)
    return has_upper and has_lower and has_digit and has_symbol


def _validate_runtime_config(app: Flask, is_production: bool) -> None:
    """Fail fast for missing critical production configuration."""
    secret = str(app.config.get("SECRET_KEY") or "").strip()
    if not secret:
        raise RuntimeError("Missing required SECRET_KEY.")

    if not is_production:
        return

    if bool(app.config.get("DEBUG")):
        raise RuntimeError("DEBUG must be disabled in production.")

    has_database_url = bool(str(os.getenv("DATABASE_URL", "")).strip())
    has_mysql_config = all(
        bool(str(app.config.get(key) or "").strip())
        for key in ("MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_HOST", "MYSQL_DB")
    )
    if not (has_database_url or has_mysql_config):
        raise RuntimeError(
            "Missing database configuration for production. Set DATABASE_URL or all MYSQL_* settings."
        )

    admin_email = str(app.config.get("ADMIN_EMAIL") or "").strip().lower()
    admin_password_hash = str(app.config.get("ADMIN_PASSWORD_HASH") or "").strip()
    admin_password = str(os.getenv("ADMIN_PASSWORD", "") or "").strip()

    if admin_password and not _is_strong_password(admin_password):
        raise RuntimeError(
            "Weak ADMIN_PASSWORD detected for production. Use at least 12 chars with upper/lower/digit/symbol."
        )

    if admin_email:
        if not admin_password_hash:
            raise RuntimeError(
                "Missing ADMIN_PASSWORD_HASH for production admin login configuration."
            )
        if not admin_password_hash.startswith(("$2a$", "$2b$", "$2y$")):
            raise RuntimeError("Invalid ADMIN_PASSWORD_HASH format. Expected bcrypt hash.")



def create_app() -> Flask:
    project_root = os.path.dirname(os.path.dirname(__file__))
    _load_local_dotenv(project_root)
    data_path = os.path.join(project_root, "data", "tools.json")
    app = Flask(
        __name__,
        instance_relative_config=True,
        template_folder=os.path.join(project_root, "templates"),
        static_folder=os.path.join(project_root, "static"),
        static_url_path="/static",
    )

    app_env = os.getenv("APP_ENV", os.getenv("FLASK_ENV", "development")).strip().lower()
    is_production = app_env == "production"

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "")
    app.config["MYSQL_USER"] = os.getenv("MYSQL_USER", "")
    app.config["MYSQL_PASSWORD"] = os.getenv("MYSQL_PASSWORD", "")
    app.config["MYSQL_HOST"] = os.getenv("MYSQL_HOST", "localhost")
    app.config["MYSQL_DB"] = os.getenv("MYSQL_DB", "ai_compass")
    app.config["ADMIN_EMAIL"] = os.getenv("ADMIN_EMAIL", "").strip().lower()
    app.config["ADMIN_PASSWORD_HASH"] = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
    app.config["GOOGLE_ANALYTICS_ID"] = os.getenv("GOOGLE_ANALYTICS_ID", "").strip()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["ENV"] = app_env
    app.config["DEBUG"] = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["PREFERRED_URL_SCHEME"] = "https" if is_production else "http"
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = int(os.getenv("STATIC_CACHE_MAX_AGE", "31536000")) if is_production else 0

    # Admin access: comma-separated email list in ADMIN_EMAILS env var
    raw_admins = os.getenv("ADMIN_EMAILS", "")
    configured_admins = [e.strip().lower() for e in raw_admins.split(",") if e.strip()]
    if app.config["ADMIN_EMAIL"] and app.config["ADMIN_EMAIL"] not in configured_admins:
        configured_admins.append(app.config["ADMIN_EMAIL"])
    app.config["ADMIN_EMAILS"] = configured_admins

    # OAuth credentials (optional – buttons hidden when not configured)
    app.config["GOOGLE_CLIENT_ID"] = os.environ.get("GOOGLE_CLIENT_ID")
    app.config["GOOGLE_CLIENT_SECRET"] = os.environ.get("GOOGLE_CLIENT_SECRET")
    app.config["GOOGLE_REDIRECT_URI"] = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    app.config["GOOGLE_REDIRECT_URI_LOCAL"] = os.getenv(
        "GOOGLE_REDIRECT_URI_LOCAL", "http://localhost:5000/auth/google/callback"
    ).strip()
    app.config["GOOGLE_REDIRECT_URI_PROD"] = os.getenv(
        "GOOGLE_REDIRECT_URI_PROD", "https://your-production-url/auth/google/callback"
    ).strip()
    app.config["GITHUB_CLIENT_ID"] = os.getenv("GITHUB_CLIENT_ID", "")
    app.config["GITHUB_CLIENT_SECRET"] = os.getenv("GITHUB_CLIENT_SECRET", "")
    app.config["LINKEDIN_CLIENT_ID"] = os.getenv("LINKEDIN_CLIENT_ID", "")
    app.config["LINKEDIN_CLIENT_SECRET"] = os.getenv("LINKEDIN_CLIENT_SECRET", "")

    secure_cookies = os.getenv("APP_SECURE_COOKIES", "").lower()
    if secure_cookies in {"true", "1", "yes", "on"}:
        secure_cookies_enabled = True
    elif secure_cookies in {"false", "0", "no", "off"}:
        secure_cookies_enabled = False
    else:
        secure_cookies_enabled = is_production
    app.config["REMEMBER_COOKIE_SECURE"] = secure_cookies_enabled
    app.config["SESSION_COOKIE_SECURE"] = secure_cookies_enabled
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    if is_production:
        app.config["REMEMBER_COOKIE_SECURE"] = True
        app.config["SESSION_COOKIE_SECURE"] = True

    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration
    sentry_dsn = os.environ.get("SENTRY_DSN")
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FlaskIntegration()],
            traces_sample_rate=1.0,
            profiles_sample_rate=1.0,
        )

    _validate_runtime_config(app, is_production)

    from flask_caching import Cache
    global cache
    cache = Cache()

    app.config["SQLALCHEMY_DATABASE_URI"] = _build_database_uri(app)

    db.init_app(app)
    
    cache_config = {
        'CACHE_TYPE': 'SimpleCache',
        'CACHE_DEFAULT_TIMEOUT': 300
    }
    if os.environ.get('REDIS_URL'):
        cache_config['CACHE_TYPE'] = 'RedisCache'
        cache_config['CACHE_REDIS_URL'] = os.environ.get('REDIS_URL')
    cache.init_app(app, config=cache_config)
    
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message_category = "info"
    bcrypt.init_app(app)
    csrf.init_app(app)

    from flask_migrate import Migrate
    Migrate(app, db)

    from app.auth import auth_bp
    from app.routes import main_bp
    from app.oauth import oauth_bp, init_oauth

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(oauth_bp)
    init_oauth(app)

    # Serve static files reliably behind gunicorn in containerized deployments.
    app.wsgi_app = WhiteNoise(
        app.wsgi_app,
        root=app.static_folder,
        prefix="static/",
        max_age=app.config["SEND_FILE_MAX_AGE_DEFAULT"],
    )

    from app.logging import setup_logging
    setup_logging(app)

    from flask_talisman import Talisman
    Talisman(app, content_security_policy=None, force_https=is_production)
    
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["500 per day", "100 per hour"],
        storage_uri="memory://"
    )

    with app.app_context():
        # Database schema is now managed externally via Alembic (Flask-Migrate)
        # We explicitly removed dangerous runtime schema mutations here.
        pass

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove()

    from flask import jsonify
    from sqlalchemy import text
    from datetime import datetime, timezone
    
    @app.route('/health')
    def health_check():
        try:
            db.session.execute(text('SELECT 1'))
            db_status = 'ok'
        except Exception as e:
            db_status = str(e)
            
        # Optional basic Redis connection check if URL exists
        redis_status = 'ok' if not os.environ.get('REDIS_URL') else 'untested'
        
        healthy = db_status == 'ok'
        return jsonify({
            'status': 'healthy' if healthy else 'degraded',
            'database': db_status,
            'redis': redis_status,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200 if healthy else 503

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "not_found"}), 404
        return render_template("404.html"), 404

    @app.errorhandler(500)
    def internal_error(_error):
        current_app.logger.exception("Unhandled server error")
        db.session.rollback()
        if request.path.startswith("/api/"):
            return jsonify({"error": "internal_server_error"}), 500
        return render_template("500.html"), 500

    @app.after_request
    def enforce_utf8_charset(response):
        content_type = str(response.headers.get("Content-Type") or "")
        content_type_lower = content_type.lower()
        if "charset=" in content_type_lower:
            return response
        if content_type_lower.startswith("text/"):
            response.headers["Content-Type"] = f"{content_type}; charset=utf-8" if content_type else "text/plain; charset=utf-8"
        return response

    # Prime tools cache once at startup to avoid repeated disk reads.
    try:
        prime_tools_cache(data_path)
    except Exception:
        # Keep app startup resilient if tools.json is temporarily invalid.
        pass

    @app.context_processor
    def inject_global_template_context():
        from app.models import Favorite

        category_aliases = {
            "writing & docs": "writing",
            "docs": "writing",
            "code": "coding",
            "developer": "coding",
            "developers": "coding",
            "image": "image generation",
            "image gen": "image generation",
            "image-generation": "image generation",
            "video": "video generation",
            "video gen": "video generation",
            "video-generation": "video generation",
            "analytics": "data analysis",
            "data-analysis": "data analysis",
            "study": "study tools",
            "education": "study tools",
        }

        tools = get_cached_tools(data_path)
        normalized_categories = []
        for tool in tools:
            category = str(tool.get("category", "")).strip().lower()
            category = category_aliases.get(category, category)
            normalized_categories.append(category if category else "other")

        category_counts = Counter(normalized_categories)
        total_tools = len(tools)
        favorite_tool_ids = []
        if current_user.is_authenticated:
            favorite_rows = Favorite.query.filter_by(user_id=current_user.id).all()
            favorite_tool_ids = [row.tool_id for row in favorite_rows]

        return {
            "GA_ID": app.config.get("GOOGLE_ANALYTICS_ID", ""),
            "category_counts": category_counts,
            "total_tools": total_tools,
            "current_user": current_user,
            "is_authenticated": current_user.is_authenticated,
            "student_mode": session.get("student_mode", False),
            "favorite_tool_ids": favorite_tool_ids,
        }

    return app
