from flask import Blueprint, current_app, flash, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user
import json

from app import bcrypt, db
from app.models import User
from app.rate_limit import is_rate_limited


auth_bp = Blueprint("auth", __name__)


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


def _client_ip():
    forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return str(request.remote_addr or "unknown")


def _requires_onboarding(user):
    if bool(getattr(user, "onboarding_completed", False)):
        return False

    if getattr(user, "first_login", False):
        return True

    if str(getattr(user, "skill_level", "") or "").strip() and str(getattr(user, "pricing_pref", "") or "").strip():
        return False

    raw = str(getattr(user, "preferences", "") or "").strip()
    if not raw:
        return True
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return True
    if isinstance(parsed, dict):
        return not bool(parsed.get("skill_level") and parsed.get("preferred_pricing"))
    if isinstance(parsed, list):
        return not bool(parsed)
    return True


def _is_configured_admin_email(email):
    admin_emails = current_app.config.get("ADMIN_EMAILS", [])
    return email in admin_emails


def _sync_admin_flag(user):
    should_be_admin = _is_configured_admin_email(user.email)
    if bool(user.is_admin) != should_be_admin:
        user.is_admin = should_be_admin
        db.session.commit()
    return user


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        _clear_stale_login_flash_errors()
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        if is_rate_limited(f"register:{_client_ip()}", limit=10, window_seconds=60):
            flash("Too many attempts. Please wait a minute and try again.", "error")
            return render_template(
                "register.html",
                google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
            )

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not name or not email or not password:
            flash("Full name, email and password are required.", "error")
            return render_template(
                "register.html",
                google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
            )

        if confirm_password != password:
            flash("Passwords do not match.", "error")
            return render_template(
                "register.html",
                google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
            )

        existing = User.query.filter_by(email=email).first()
        if existing:
            flash("An account already exists for this email.", "error")
            return render_template(
                "register.html",
                google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
            )

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=password_hash, display_name=name, is_admin=False)
        db.session.add(user)
        db.session.commit()

        _clear_stale_login_flash_errors()
        login_user(user)
        flash("Welcome to AI Compass.", "success")
        if _requires_onboarding(user):
            return redirect(url_for("main.onboarding"))
        return redirect(url_for("main.dashboard"))

    return render_template(
        "register.html",
        google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
        github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
    )


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        _clear_stale_login_flash_errors()
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        if is_rate_limited(f"login:{_client_ip()}", limit=20, window_seconds=60):
            flash("Too many attempts. Please wait a minute and try again.", "error")
            return render_template(
                "login.html",
                google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
            )

        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = User.query.filter_by(email=email).first()
        admin_email = current_app.config.get("ADMIN_EMAIL", "")
        admin_password_hash = current_app.config.get("ADMIN_PASSWORD_HASH", "")

        if admin_email and admin_password_hash and email == admin_email:
            if not bcrypt.check_password_hash(admin_password_hash, password):
                flash("Invalid email or password.", "error")
                return render_template(
                    "login.html",
                    google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
                    github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
                )

            if user is None:
                user = User(email=email, password_hash=admin_password_hash, is_admin=True)
                db.session.add(user)
            else:
                user.is_admin = True
                if not user.password_hash:
                    user.password_hash = admin_password_hash

            db.session.commit()
            _clear_stale_login_flash_errors()
            login_user(user)
            flash("Admin login detected. Use the Admin Panel button from the dashboard.", "success")
            next_url = request.args.get("next")
            if _requires_onboarding(user):
                return redirect(url_for("main.onboarding"))
            return redirect(next_url or url_for("main.dashboard"))

        if user and user.password_hash and bcrypt.check_password_hash(user.password_hash, password):
            _sync_admin_flag(user)
            _clear_stale_login_flash_errors()
            login_user(user)
            flash("You are now logged in.", "success")
            next_url = request.args.get("next")
            if _requires_onboarding(user):
                return redirect(url_for("main.onboarding"))
            return redirect(next_url or url_for("main.dashboard"))

        flash("Invalid email or password.", "error")

    return render_template(
        "login.html",
        google_oauth_enabled=bool(current_app.config.get("GOOGLE_CLIENT_ID")),
        github_oauth_enabled=bool(current_app.config.get("GITHUB_CLIENT_ID")),
    )


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.", "info")
    return redirect(url_for("main.index"))
