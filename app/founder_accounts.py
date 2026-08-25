"""Account creation/linking for paid submission founders.

When a paid-tier (Quick Review or Sponsored) submission is approved, the
founder needs a real User account so they can log in to the stats dashboard
(app/submission_dashboard.py's magic-link token remains a fallback, this
isn't replacing it). This module owns that single piece of logic so it
isn't scattered across admin_approve_submission().

No email is sent here — the caller (a later prompt) is responsible for
handing any generated plaintext password to the email step. It is never
persisted or logged.
"""

import secrets
from dataclasses import dataclass
from typing import Optional

from app import bcrypt, db
from app.models import Submission, User

# secrets.token_urlsafe(N) yields ~1.3 chars per byte of entropy; 24 bytes
# is a comfortably long, high-entropy one-time credential.
_TEMP_PASSWORD_BYTES = 24


@dataclass
class FounderAccountResult:
    user: User
    # True only when this call created a brand-new User row. False both for
    # a pre-existing account found by email AND for a repeat call that
    # re-links an already-linked submission (idempotent no-op).
    created: bool
    # Plaintext temporary password, set only when created=True. The email
    # step (a later prompt) uses this once, synchronously, then discards it
    # — it is never written to the database or logs.
    temp_password: Optional[str]


def _generate_temp_password() -> str:
    return secrets.token_urlsafe(_TEMP_PASSWORD_BYTES)


def get_or_create_founder_account(email: str, submission_id: int) -> FounderAccountResult:
    """Ensure a User account exists for `email` and link it to `submission_id`.

    Case-insensitive email match (normalized the same way as the rest of the
    auth code: strip + lowercase). If a User already exists for that email —
    whether from a prior paid submission or ordinary site signup/login — it
    is reused, not duplicated, and its password is left untouched.

    Idempotent: calling this again for the same submission/email finds the
    same User and leaves founder_user_id as-is.
    """
    normalized_email = str(email or "").strip().lower()
    if not normalized_email:
        raise ValueError("email is required")

    submission = Submission.query.get(submission_id)
    if submission is None:
        raise ValueError(f"Submission {submission_id} not found")

    # Every write path in this codebase (auth_register, OAuth signup,
    # forgot/reset-password) normalizes email to strip().lower() before
    # storing, and looks it up with a plain equality filter rather than
    # func.lower() — matching that convention here keeps this lookup
    # consistent with the rest of auth instead of introducing a second one.
    user = User.query.filter_by(email=normalized_email).first()
    created = False
    temp_password = None

    if user is None:
        temp_password = _generate_temp_password()
        password_hash = bcrypt.generate_password_hash(temp_password).decode("utf-8")
        user = User(
            email=normalized_email,
            password_hash=password_hash,
            must_change_password=True,
        )
        db.session.add(user)
        db.session.flush()  # assign user.id for the FK link below
        created = True

    if submission.founder_user_id != user.id:
        submission.founder_user_id = user.id

    db.session.commit()

    return FounderAccountResult(user=user, created=created, temp_password=temp_password)
