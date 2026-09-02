from flask import Blueprint, current_app, flash, redirect, request, session, url_for, jsonify
from flask_login import current_user, login_required, logout_user
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
from app.oauth import _frontend_base_url
from app.email_utils import send_email

auth_bp = Blueprint("auth", __name__)


def get_verify_serializer():
    try:
        secret = current_app.config.get("SECRET_KEY")
    except Exception:
        secret = None
    if not secret:
        secret = os.environ.get("SECRET_KEY", "ai-compass-fixed-key-2024")
    return URLSafeTimedSerializer(secret, salt="email-verification-salt")

def get_verification_email_html(name, verification_link):
    """The account-verification email, rendered from the shared shell.

    This used to be a 170-line f-string with its own copy of the stylesheet.
    It was the ONLY email on the site that looked the way the brand is
    supposed to look — and because it was a private copy, every improvement
    to it stopped there while the six templated emails kept the older grey
    styling. The shell now carries this design (emails/base.html) and this
    function only supplies the words, so the next change lands everywhere at
    once instead of in one file.

    The footer credit line is gone with it: the site is presented as a
    business, and a personal "Designed and Developed by" byline under a
    payment receipt undercuts that everywhere it appears.
    """
    from flask import render_template

    return render_template(
        "emails/simple_notice.html",
        subject_title="Welcome to AI Compass",
        heading="Verify your email address",
        paragraphs=[
            f"Hi {name},",
            "Welcome to AI Compass. We are glad to have you. To finish setting up "
            "your account and secure it, confirm your email address using the "
            "button below.",
        ],
        cta_url=verification_link,
        cta_label="Verify Email",
        fine_print="If you didn't create an account, you can safely ignore this email.",
    )


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


@auth_bp.route("/logout")
@login_required
def logout():
    # Clear Sentry user context on logout (best-effort)
    try:
        if sentry_sdk is not None:
            sentry_sdk.set_user(None)
    except Exception:
        pass

    session_uuid = session.get('user_uuid')
    if session_uuid:
        try:
            from app.models import UserSession
            sess = UserSession.query.filter_by(session_uuid=session_uuid).first()
            if sess:
                db.session.delete(sess)
                db.session.commit()
        except Exception:
            db.session.rollback()

    logout_user()
    session.pop('user_uuid', None)
    flash("Logged out successfully.", "info")
    return redirect(url_for("main.index"))



@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
@csrf.exempt
def forgot_password():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    try:
        user = User.query.filter_by(email=email).first()
    except Exception as db_err:
        current_app.logger.exception("Failed to query database in forgot_password: %s", db_err)
        user = None

    if user:
        try:
            hash_part = user.password_hash[-10:] if user.password_hash else ""
            token = get_reset_serializer().dumps({"email": email, "hash_part": hash_part})
            reset_link = f"{_frontend_base_url()}/reset-password?token={token}"
            subject = "AI Compass - Password Recovery"
            # Same shell as every other message. A reset link is the one email
            # a user is most right to be suspicious of, and four unstyled <p>
            # tags arriving from an address they have never seen styled is
            # indistinguishable from a phishing attempt.
            from flask import render_template

            html = render_template(
                "emails/simple_notice.html",
                subject_title="Reset your password",
                heading="Reset your password",
                paragraphs=[
                    "We received a request to reset the password on your AI Compass "
                    "account. Choose a new one using the button below — the link is "
                    "valid for 2 hours.",
                ],
                cta_url=reset_link,
                cta_label="Reset Password",
                fine_print=(
                    "If you did not request this, you can ignore this email and "
                    "your password will stay as it is."
                ),
            )
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

    try:
        user = User.query.filter_by(email=email).first()
    except Exception as db_err:
        current_app.logger.exception("Failed to query database in reset_password: %s", db_err)
        return jsonify({"error": "Database error. Please try again later."}), 500

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

    return redirect(f"{_frontend_base_url()}/verify-success")


@auth_bp.route("/api/auth/resend-verification", methods=["POST"])
@csrf.exempt
def resend_verification():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()

    if not email and current_user.is_authenticated:
        email = current_user.email

    if not email:
        return jsonify({"error": "Email is required."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.is_verified:
        return jsonify({"message": "Account is already verified."}), 200

    try:
        token = get_verify_serializer().dumps(email)
        verification_link = f"{request.url_root}api/auth/verify-email/{token}"
        subject = "AI Compass - Verify Email"
        name = user.display_name or "User"
        html = get_verification_email_html(name, verification_link)
        send_email(email, subject, html)
    except Exception:
        current_app.logger.exception("Failed to resend verification email")
        return jsonify({"error": "Failed to send email. Please try again later."}), 500

    return jsonify({"message": "Verification link has been resent."}), 200
