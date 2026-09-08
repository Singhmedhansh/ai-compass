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


def link_existing_founder_account(submission_id: int, email: str = None, user: User = None) -> Optional[User]:
    """Link `submission_id` to an account that already exists — never create one.

    The paid path above may mint an account (and a temp password) because the
    founder has paid and is owed a login. Every other submission must not:
    a free listing silently creating a User with a password nobody was told
    about is not a signup. So this links only when there is already a real
    account to link to — the logged-in submitter, or a User whose email
    matches what they typed into the form.

    Without this, `founder_user_id` stayed NULL for every free submission,
    which is the flag `is_founder` is computed from — so free founders never
    saw the Growth Hub entry that /founder/tools was already built to serve.

    Returns the linked User, or None when there was no account to link.
    Idempotent, and never steals a submission that is already linked.
    """
    submission = Submission.query.get(submission_id)
    if submission is None or submission.founder_user_id is not None:
        return None

    # Email first, session second. The submitter_email on the form is the
    # address the paid path keys everything off (welcome mail, magic-link
    # dashboard, monthly report), so when a logged-in user types someone
    # else's address they are submitting on that founder's behalf and the
    # dashboard belongs to them, not to whoever happened to be signed in.
    # The session is only the fallback for an address with no account yet.
    normalized_email = str(email or "").strip().lower()
    if normalized_email:
        matched = User.query.filter_by(email=normalized_email).first()
        if matched is not None:
            user = matched
    if user is None:
        return None

    submission.founder_user_id = user.id
    db.session.commit()
    return user
