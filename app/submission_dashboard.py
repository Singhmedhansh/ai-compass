"""Token mint/verify for the submitter dashboard.

Submission has no user_id FK (see models.py) — submitter_email is
free-text, unverified, not unique. So dashboard access can't be a login
session; it's a signed, submission-scoped magic link instead, following the
same itsdangerous pattern app/auth.py already uses for email verification
and password reset.
"""

import os

from flask import current_app
from itsdangerous import URLSafeTimedSerializer

# Submitters should be able to revisit their dashboard for months after
# purchase, not just during a short verification window.
DASHBOARD_TOKEN_MAX_AGE = 180 * 24 * 3600


def get_dashboard_serializer():
    secret = current_app.config.get("SECRET_KEY") or os.environ.get(
        "SECRET_KEY", "ai-compass-fixed-key-2024"
    )
    return URLSafeTimedSerializer(secret, salt="submission-dashboard-salt")


def mint_dashboard_token(submission_id: int, email: str) -> str:
    return get_dashboard_serializer().dumps(
        {"submission_id": submission_id, "email": email or ""}
    )


def verify_dashboard_token(token: str):
    """Returns (submission_id, email). Raises BadSignature/SignatureExpired
    on an invalid or expired token — callers handle those explicitly."""
    data = get_dashboard_serializer().loads(token, max_age=DASHBOARD_TOKEN_MAX_AGE)
    return data.get("submission_id"), data.get("email")


def dashboard_url(submission_id: int, email: str) -> str:
    from app.oauth import _frontend_base_url

    token = mint_dashboard_token(submission_id, email)
    return f"{_frontend_base_url()}/dashboard/submission?token={token}"
