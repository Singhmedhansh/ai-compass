import os
from dotenv import load_dotenv

load_dotenv()

from collections import Counter
from flask import Flask, render_template, session, request, jsonify, current_app
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, current_user
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from sqlalchemy import inspect, text
from whitenoise import WhiteNoise

from app.tool_cache import get_cached_tools, prime_tools_cache

# --- Sentry initialization (safe import) ---
try:
    import sentry_sdk
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.01")),
        environment=os.getenv("APP_ENV", "development"),
    )
except ImportError:
    sentry_sdk = None


db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()
csrf = CSRFProtect()


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
    return User.query.get(int(user_id))


def _build_database_uri(project_root: str) -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

    local_db_path = os.path.join(project_root, "instance", "ai_compass.db")
    return f"sqlite:///{local_db_path.replace('\\', '/')}"


def _validate_runtime_config(app: Flask, is_production: bool) -> None:
    if not str(app.config.get("SECRET_KEY") or "").strip():
        raise RuntimeError("Missing required SECRET_KEY.")


def create_app(config: dict | None = None) -> Flask:
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

    # Apply test config first
    if config:
        app.config.update(config)

    app_env = os.getenv("APP_ENV", "development").strip().lower()
    is_production = app_env == "production"

    # FIXED SECRET KEY (no setdefault)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    _validate_runtime_config(app, is_production)

    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = _build_database_uri(project_root)

    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    csrf.init_app(app)

    from app.api_routes import api_bp
    from app.auth import auth_bp
    from app.routes import main_bp
    from app.oauth import oauth_bp, init_oauth

    app.register_blueprint(api_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(oauth_bp)
    init_oauth(app)

    app.wsgi_app = WhiteNoise(app.wsgi_app, root=app.static_folder)

    if not app.config.get("TESTING"):
        with app.app_context():
            db.create_all()

    try:
        prime_tools_cache(data_path)
    except Exception:
        pass

    @app.context_processor
    def inject_global_template_vars():
        return {
            "category_counts": {}
        }

    return app