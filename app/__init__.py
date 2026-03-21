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


def _ensure_user_schema_compatibility() -> None:
    """Add nullable user columns that may be missing in older local databases."""
    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    ddl_statements = []

    if "display_name" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN display_name VARCHAR(255)")
    if "oauth_picture_url" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN oauth_picture_url VARCHAR(500)")
    if "oauth_provider" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50)")
    if "is_admin" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")
    if "student_status" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN student_status BOOLEAN NOT NULL DEFAULT 0")
    if "first_login" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN first_login BOOLEAN NOT NULL DEFAULT 1")
    if "onboarding_completed" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT 0")
    if "preferences" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN preferences TEXT")
    if "interests" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN interests TEXT")
    if "skill_level" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN skill_level VARCHAR(32)")
    if "pricing_pref" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN pricing_pref VARCHAR(32)")
    if "goals" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN goals TEXT")
    if "theme_preference" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN theme_preference VARCHAR(20)")
    if "notifications_enabled" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT 1")

    if not ddl_statements:
        return

    for ddl in ddl_statements:
        db.session.execute(text(ddl))

    # Preserve UX for existing users: skip first-login onboarding when preferences are already present.
    if "first_login" not in existing_columns:
        db.session.execute(
            text(
                """
                UPDATE users
                SET first_login = CASE
                    WHEN preferences IS NOT NULL AND TRIM(preferences) != '' THEN 0
                    ELSE 1
                END
                """
            )
        )
    else:
        db.session.execute(
            text(
                """
                UPDATE users
                SET first_login = CASE
                    WHEN first_login IS NULL THEN
                        CASE
                            WHEN preferences IS NOT NULL AND TRIM(preferences) != '' THEN 0
                            ELSE 1
                        END
                    ELSE first_login
                END
                """
            )
        )

    if "onboarding_completed" not in existing_columns:
        db.session.execute(
            text(
                """
                UPDATE users
                SET onboarding_completed = CASE
                    WHEN (
                        (skill_level IS NOT NULL AND TRIM(skill_level) != '')
                        OR (pricing_pref IS NOT NULL AND TRIM(pricing_pref) != '')
                        OR (preferences IS NOT NULL AND TRIM(preferences) != '')
                    ) THEN 1
                    WHEN first_login = 0 THEN 1
                    ELSE 0
                END
                """
            )
        )
    else:
        db.session.execute(
            text(
                """
                UPDATE users
                SET onboarding_completed = CASE
                    WHEN onboarding_completed IS NULL THEN
                        CASE
                            WHEN (
                                (skill_level IS NOT NULL AND TRIM(skill_level) != '')
                                OR (pricing_pref IS NOT NULL AND TRIM(pricing_pref) != '')
                                OR (preferences IS NOT NULL AND TRIM(preferences) != '')
                                OR first_login = 0
                            ) THEN 1
                            ELSE 0
                        END
                    ELSE onboarding_completed
                END
                """
            )
        )
    db.session.commit()


def _ensure_tool_view_schema_compatibility() -> None:
    """Ensure the tool view events table has expected analytics columns."""
    inspector = inspect(db.engine)
    if "tool_view_events" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("tool_view_events")}
    ddl_statements = []

    if "tool_name" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_view_events ADD COLUMN tool_name VARCHAR(255)")
    if "user_id" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_view_events ADD COLUMN user_id INTEGER")
    if "timestamp" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_view_events ADD COLUMN timestamp DATETIME")

    if not ddl_statements:
        return

    for ddl in ddl_statements:
        db.session.execute(text(ddl))

    if "timestamp" not in existing_columns:
        db.session.execute(text("UPDATE tool_view_events SET timestamp = CURRENT_TIMESTAMP WHERE timestamp IS NULL"))

    db.session.commit()


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

    _validate_runtime_config(app, is_production)

    app.config["SQLALCHEMY_DATABASE_URI"] = _build_database_uri(app)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message_category = "info"
    bcrypt.init_app(app)
    csrf.init_app(app)

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

    with app.app_context():
        db.create_all()
        _ensure_user_schema_compatibility()
        _ensure_tool_view_schema_compatibility()

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
