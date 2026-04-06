import os
import sys
from dotenv import load_dotenv

load_dotenv()

from collections import Counter
from flask import Flask, session, request, jsonify, current_app
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, current_user
from flask_session import Session
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from sqlalchemy import inspect, text

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
    normalized_path = local_db_path.replace('\\', '/')
    return f"sqlite:///{normalized_path}"


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
    app.config["FRONTEND_URL"] = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "")
    app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET", "")
    app.config["GOOGLE_REDIRECT_URI"] = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/auth/google/callback")
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['REMEMBER_COOKIE_SECURE'] = True
    app.config['SESSION_TYPE'] = 'filesystem'

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
        engine_options["connect_args"] = {"sslmode": "require"}
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options

    Session(app)

    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    csrf.init_app(app)

    from app.api_routes import api_bp
    from app.auth import auth_bp
    from app.routes import main_bp
    from app.oauth import oauth_bp, init_oauth

    app.register_blueprint(api_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(main_bp)
    init_oauth(app)

    from flask import request

    @app.after_request
    def add_cors(response):
        allowed_origins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'https://ai-compass-1.onrender.com',
            os.getenv('FRONTEND_URL', ''),
        ]
        origin = request.headers.get('Origin', '')
        if any(origin == o for o in allowed_origins if o):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-CSRFToken'
        return response

    if not app.config.get("TESTING"):
        with app.app_context():
            db.create_all()

    try:
        prime_tools_cache(data_path)
    except Exception:
        pass

    try:
        model_path = os.path.join(project_root, 'data', 'recommendation_model.pkl')
        if not os.path.exists(model_path):
            print("Training ML model on first startup...")
            train_script = os.path.join(project_root, 'scripts', 'train_model.py')
            if os.path.exists(train_script):
                import subprocess
                result = subprocess.run(
                    [sys.executable, train_script],
                    capture_output=True, text=True, cwd=project_root, timeout=120
                )
                if result.returncode == 0:
                    print("ML model trained successfully")
                else:
                    print("ML model training failed:", result.stderr[:500])
    except Exception as e:
        print(f"ML model auto-train skipped: {e}")

    @app.context_processor
    def inject_global_template_vars():
        return {
            "category_counts": {}
        }

    return app