import os
from collections import Counter
from flask import Flask, session
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


def _ensure_user_schema_compatibility() -> None:
    """Add nullable user columns that may be missing in older local databases."""
    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    ddl_statements = []

    if "display_name" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN display_name VARCHAR(255)")
    if "oauth_provider" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50)")
    if "is_admin" not in existing_columns:
        ddl_statements.append("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")

    if not ddl_statements:
        return

    for ddl in ddl_statements:
        db.session.execute(text(ddl))
    db.session.commit()


def _ensure_tool_view_schema_compatibility() -> None:
    """Ensure the tool view events table has expected analytics columns."""
    inspector = inspect(db.engine)
    if "tool_view_events" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("tool_view_events")}
    ddl_statements = []

    if "tool_name" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_views ADD COLUMN tool_name VARCHAR(255)")
    if "user_id" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_views ADD COLUMN user_id INTEGER")
    if "timestamp" not in existing_columns:
        ddl_statements.append("ALTER TABLE tool_views ADD COLUMN timestamp DATETIME")

    if not ddl_statements:
        return

    for ddl in ddl_statements:
        db.session.execute(text(ddl))

    if "timestamp" not in existing_columns:
        db.session.execute(text("UPDATE tool_view_events SET timestamp = CURRENT_TIMESTAMP WHERE timestamp IS NULL"))

    db.session.commit()


def create_app() -> Flask:
    project_root = os.path.dirname(os.path.dirname(__file__))
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

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
    app.config["MYSQL_USER"] = os.getenv("MYSQL_USER", "")
    app.config["MYSQL_PASSWORD"] = os.getenv("MYSQL_PASSWORD", "")
    app.config["MYSQL_HOST"] = os.getenv("MYSQL_HOST", "localhost")
    app.config["MYSQL_DB"] = os.getenv("MYSQL_DB", "ai_compass")
    app.config["ADMIN_EMAIL"] = os.getenv("ADMIN_EMAIL", "").strip().lower()
    app.config["ADMIN_PASSWORD"] = os.getenv("ADMIN_PASSWORD", "")
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
    app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "")
    app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET", "")
    app.config["GITHUB_CLIENT_ID"] = os.getenv("GITHUB_CLIENT_ID", "")
    app.config["GITHUB_CLIENT_SECRET"] = os.getenv("GITHUB_CLIENT_SECRET", "")

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

    # Prime tools cache once at startup to avoid repeated disk reads.
    try:
        prime_tools_cache(data_path)
    except Exception:
        # Keep app startup resilient if tools.json is temporarily invalid.
        pass

    @app.context_processor
    def inject_global_template_context():
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

        return {
            "GA_ID": app.config.get("GOOGLE_ANALYTICS_ID", ""),
            "category_counts": category_counts,
            "total_tools": total_tools,
            "current_user": current_user,
            "is_authenticated": current_user.is_authenticated,
            "student_mode": session.get("student_mode", False),
        }

    return app
