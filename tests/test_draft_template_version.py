import pytest

from app import db
from app.models import OutreachCandidate
from app.outreach import (
    CURRENT_DRAFT_TEMPLATE_VERSION,
    get_stale_draft_candidates,
    regenerate_all_drafts,
)


@pytest.fixture(autouse=True)
def _clean(app):
    # Matches tests/test_catalog_campaign.py's pattern — the app fixture is
    # session-scoped, so rows persist across test files unless each one
    # cleans up its own OutreachCandidate rows.
    with app.app_context():
        OutreachCandidate.query.delete()
        db.session.commit()
        yield
        OutreachCandidate.query.delete()
        db.session.commit()


def _make_candidate(app, **overrides):
    defaults = dict(
        product_name="Test Product",
        website_url="https://example.com",
        email="founder@example.com",
        status="draft_ready",
        confidence_score=80,
        draft_subject="old subject",
        draft_body="old body",
        draft_template_version=None,
    )
    defaults.update(overrides)
    with app.app_context():
        c = OutreachCandidate(**defaults)
        db.session.add(c)
        db.session.commit()
        return c.id


def test_null_version_counts_as_stale(app):
    cid = _make_candidate(app, draft_template_version=None)
    with app.app_context():
        stale_ids = {c.id for c in get_stale_draft_candidates()}
        assert cid in stale_ids


def test_older_version_counts_as_stale(app):
    cid = _make_candidate(app, draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION - 1)
    with app.app_context():
        stale_ids = {c.id for c in get_stale_draft_candidates()}
        assert cid in stale_ids


def test_current_version_is_not_stale(app):
    cid = _make_candidate(app, draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION)
    with app.app_context():
        stale_ids = {c.id for c in get_stale_draft_candidates()}
        assert cid not in stale_ids


def test_non_draft_ready_status_excluded_even_if_stale(app):
    # A 'sent' row with an old version already went out with that content —
    # regenerating it now would rewrite history, not fix a pending send, so
    # it must never show up as "stale" regardless of version.
    cid = _make_candidate(app, draft_template_version=None, status="sent")
    with app.app_context():
        stale_ids = {c.id for c in get_stale_draft_candidates()}
        assert cid not in stale_ids


def test_no_email_found_status_is_eligible_for_staleness(app):
    cid = _make_candidate(app, draft_template_version=None, status="no_email_found", email=None)
    with app.app_context():
        stale_ids = {c.id for c in get_stale_draft_candidates()}
        assert cid in stale_ids


def test_regenerate_all_drafts_bumps_version(app):
    # No GEMINI_API_KEY is configured in the test environment, so
    # generate_draft_via_gemini() deterministically falls back to
    # get_generic_draft() — no network call, no mocking needed.
    cid = _make_candidate(app, draft_template_version=None, status="draft_ready")
    with app.app_context():
        regenerated = regenerate_all_drafts()
        assert regenerated >= 1
        c = OutreachCandidate.query.get(cid)
        assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION
        assert c.draft_subject != "old subject"
        assert c.draft_body != "old body"
