import os
from flask import Flask
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect


db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()
csrf = CSRFProtect()


@login_manager.user_loader
def load_user(user_id):
    from app.models import User

    return User.query.get(int(user_id))


def _build_database_uri(app: Flask) -> str:
    mysql_user = app.config["MYSQL_USER"]
    mysql_password = app.config["MYSQL_PASSWORD"]
    mysql_host = app.config["MYSQL_HOST"]
    mysql_db = app.config["MYSQL_DB"]

    if mysql_user and mysql_password and mysql_host and mysql_db:
        return f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}/{mysql_db}"

    # Local fallback keeps development unblocked when MySQL is not available.
    return "sqlite:///ai_compass.db"


def create_app() -> Flask:
    project_root = os.path.dirname(os.path.dirname(__file__))
    app = Flask(
        __name__,
        instance_relative_config=True,
        template_folder=os.path.join(project_root, "templates"),
        static_folder=os.path.join(project_root, "static"),
    )

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
    app.config["MYSQL_USER"] = os.getenv("MYSQL_USER", "")
    app.config["MYSQL_PASSWORD"] = os.getenv("MYSQL_PASSWORD", "")
    app.config["MYSQL_HOST"] = os.getenv("MYSQL_HOST", "localhost")
    app.config["MYSQL_DB"] = os.getenv("MYSQL_DB", "ai_compass")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    secure_cookies = os.getenv("APP_SECURE_COOKIES", "false").lower() == "true"
    app.config["REMEMBER_COOKIE_SECURE"] = secure_cookies
    app.config["SESSION_COOKIE_SECURE"] = secure_cookies
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

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)

    with app.app_context():
        db.create_all()

    return app
