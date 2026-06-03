from flask import Blueprint, current_app, flash, redirect, request, session, url_for, jsonify
from flask_login import current_user, login_required, login_user, logout_user
import json
import os
from itsdangerous import URLSafeTimedSerializer

# Safe optional import for Sentry
try:
    import sentry_sdk
except Exception:
    sentry_sdk = None

from app import bcrypt, db, csrf
from app.models import User
from app.rate_limit import is_rate_limited
from app.oauth import _frontend_base_url
from app.email_utils import send_email

auth_bp = Blueprint("auth", __name__)


def get_verify_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="email-verification-salt")


def get_reset_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="password-reset-salt")


def _verify_password_hash(password_hash, password):
    """Return False instead of raising when stored hash/config hash is malformed."""
    if not password_hash:
        return False
    try:
        return bool(bcrypt.check_password_hash(password_hash, password))
    except (TypeError, ValueError):
        current_app.logger.warning("Password hash verification failed due to malformed hash value.")
        return False


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
        return redirect("/dashboard")

    if request.method == "POST":
        if is_rate_limited(f"register:{_client_ip()}", limit=10, window_seconds=60):
            flash("Too many attempts. Please wait a minute and try again.", "error")
            return redirect('/')

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not name or not email or not password:
            flash("Full name, email and password are required.", "error")
            return redirect('/')

        if confirm_password != password:
            flash("Passwords do not match.", "error")
            return redirect('/')

        existing = User.query.filter_by(email=email).first()
        if existing:
            flash("An account already exists for this email.", "error")
            return redirect('/')

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=password_hash, display_name=name, is_admin=False, is_verified=False)
        db.session.add(user)
        db.session.commit()

        # Send verification email
        try:
            token = get_verify_serializer().dumps(email)
            verification_link = f"{request.url_root}api/auth/verify-email/{token}"
            subject = "AI Compass - Verify Email"
            html = f"""
            <p>Hello {name},</p>
            <p>Thank you for registering. Please click the link below to verify your email address:</p>
            <p><a href="{verification_link}">Verify Email</a></p>
            """
            send_email(email, subject, html)
        except Exception:
            current_app.logger.exception("Failed to send verification email")

        _clear_stale_login_flash_errors()
        flash("Registration successful! Please check your email to verify your account.", "success")
        return redirect('/')

    return redirect('/')


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        _clear_stale_login_flash_errors()
        return redirect("/dashboard")

    if request.method == "POST":
        try:
            if is_rate_limited(f"login:{_client_ip()}", limit=20, window_seconds=60):
                flash("Too many attempts. Please wait a minute and try again.", "error")
                return redirect('/')

            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            user = User.query.filter_by(email=email).first()
            admin_email = current_app.config.get("ADMIN_EMAIL", "")
            admin_password_hash = current_app.config.get("ADMIN_PASSWORD_HASH", "")

            if admin_email and admin_password_hash and email == admin_email:
                if not _verify_password_hash(admin_password_hash, password):
                    flash("Invalid email or password.", "error")
                    return redirect('/')

                if user is None:
                    user = User(email=email, password_hash=admin_password_hash, is_admin=True, is_verified=True)
                    db.session.add(user)
                else:
                    user.is_admin = True
                    user.is_verified = True
                    if not user.password_hash:
                        user.password_hash = admin_password_hash

                db.session.commit()
                _clear_stale_login_flash_errors()
                login_user(user, remember=True)
                try:
                    if sentry_sdk is not None:
                        sentry_sdk.set_user({"id": str(user.id), "email": user.email, "username": user.display_name})
                except Exception:
                    pass
                flash("Admin login detected. Use the Admin Panel button from the dashboard.", "success")
                next_url = request.args.get("next")
                if _requires_onboarding(user):
                    return redirect("/profile")
                return redirect(next_url or "/dashboard")

            if user and _verify_password_hash(user.password_hash, password):
                if not user.is_verified:
                    flash("Please verify your email address before logging in.", "error")
                    return redirect('/')
                _sync_admin_flag(user)
                _clear_stale_login_flash_errors()
                login_user(user, remember=True)
                try:
                    if sentry_sdk is not None:
                        sentry_sdk.set_user({"id": str(user.id), "email": user.email, "username": user.display_name})
                except Exception:
                    pass
                flash("You are now logged in.", "success")
                next_url = request.args.get("next")
                if _requires_onboarding(user):
                    return redirect("/profile")
                return redirect(next_url or "/dashboard")

            flash("Invalid email or password.", "error")
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Login error")
            flash("An internal error occurred. Please try again.", "error")

    return redirect('/')


@auth_bp.route("/logout")
@login_required
def logout():
    # Clear Sentry user context on logout (best-effort)
    try:
        if sentry_sdk is not None:
            sentry_sdk.set_user(None)
    except Exception:
        pass

    logout_user()
    flash("Logged out successfully.", "info")
    return redirect(url_for("main.index"))


@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
@csrf.exempt
def forgot_password():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    user = User.query.filter_by(email=email).first()
    if user:
        try:
            hash_part = user.password_hash[-10:] if user.password_hash else ""
            token = get_reset_serializer().dumps({"email": email, "hash_part": hash_part})
            reset_link = f"{_frontend_base_url()}/reset-password?token={token}"
            subject = "AI Compass - Password Recovery"
            html = f"""
            <p>Hello,</p>
            <p>We received a request to reset your password. Click the link below to choose a new password (valid for 2 hours):</p>
            <p><a href="{reset_link}">Reset Password</a></p>
            <p>If you did not request this, please ignore this email.</p>
            """
            send_email(email, subject, html)
        except Exception:
            current_app.logger.exception("Failed to send recovery email")

    # Always return success to prevent email enumeration attacks
    return jsonify({"message": "If the account exists, a recovery email has been sent."}), 200


@auth_bp.route("/api/auth/reset-password", methods=["POST"])
@csrf.exempt
def reset_password():
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    new_password = str(payload.get("new_password") or "")

    if not token or not new_password:
        return jsonify({"error": "Token and new password are required."}), 400

    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    try:
        data = get_reset_serializer().loads(token, max_age=7200) # 2 hours
    except Exception:
        return jsonify({"error": "The password reset link is invalid or has expired."}), 400

    email = data.get("email")
    hash_part = data.get("hash_part")

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    current_hash_part = user.password_hash[-10:] if user.password_hash else ""
    if current_hash_part != hash_part:
        return jsonify({"error": "This link has already been used or is invalid."}), 400

    try:
        user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Password updated successfully."}), 200


@auth_bp.route("/api/auth/verify-email/<token>", methods=["GET"])
def verify_email(token):
    try:
        email = get_verify_serializer().loads(token, max_age=86400) # 24 hours
    except Exception:
        return redirect(f"{_frontend_base_url()}/login?error=invalid-or-expired-verification-token")

    user = User.query.filter_by(email=email).first()
    if not user:
        return redirect(f"{_frontend_base_url()}/login?error=user-not-found")

    try:
        user.is_verified = True
        db.session.commit()
    except Exception:
        db.session.rollback()
        return redirect(f"{_frontend_base_url()}/login?error=database-error")

    return redirect(f"{_frontend_base_url()}/login?verified=true")
