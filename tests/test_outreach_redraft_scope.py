"""An approved candidate holding a stale draft must not be stranded.

The deadlock this guards against, exactly as it happened in production:

  1. A candidate is approved in the console while its draft is on template v4.
  2. CURRENT_DRAFT_TEMPLATE_VERSION is bumped to v5 because the v4 copy was
     wrong (it told founders whose listing was already live that it was "in
     the queue for a free listing").
  3. can_send_candidate() refuses to send anything below v5.
  4. Both redraft paths scoped to draft_ready, so neither the Regenerate All
     Drafts button nor the nightly cron would touch an approved row.

Steps 3 and 4 together are a trap with no exit: the row can never be sent and
can never be repaired. Approving before the bump landed was enough to lose a
candidate permanently, and nothing in the console showed why.
"""
import json
import os
import tempfile
from datetime import datetime, timezone

import pytest

import app.outreach as outreach_mod
from app import create_app, db
from app.models import OutreachCandidate
from app.outreach import (
    CURRENT_DRAFT_TEMPLATE_VERSION,
    REDRAFTABLE_STATUSES,
    STATUS_APPROVED,
    apply_regenerated_draft,
    get_stale_draft_candidates,
    refresh_stale_drafts,
    regenerate_all_drafts,
)


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


def _stale(**over):
    """A candidate whose stored draft predates the current template."""
    base = dict(
        product_name="Execlave",
        website_url="https://execlave.example.com",
        email="founder@execlave.example.com",
        status=STATUS_APPROVED,
        campaign="q3_qualified_b2b",
        lead_pool="inbound",
        draft_subject="About Execlave",
        draft_body="<p>It is in the queue for a free listing either way.</p>",
        draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION - 1,
        confidence_score=60,
        verification_result="catchall",
    )
    base.update(over)
    c = OutreachCandidate(**base)
    db.session.add(c)
    db.session.commit()
    return c


# ── The scope itself ────────────────────────────────────────────────────────

def test_approved_is_redraftable(app):
    assert STATUS_APPROVED in REDRAFTABLE_STATUSES


def test_terminal_statuses_stay_out_of_scope(app):
    """Rewriting a sent email edits history, not a pending send."""
    for status in ("sent", "replied", "bounced", "rejected", "unsubscribed"):
        assert status not in REDRAFTABLE_STATUSES


def test_stale_query_finds_an_approved_row(app):
    """The query behind the nightly cron. This is the half that stranded it."""
    c = _stale()
    assert [x.id for x in get_stale_draft_candidates()] == [c.id]


def test_stale_query_ignores_a_current_draft(app):
    _stale(draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION)
    assert get_stale_draft_candidates() == []


def test_stale_query_counts_an_unstamped_draft(app):
    """NULL is not '< current' in SQL, so it needs its own check."""
    c = _stale(draft_template_version=None)
    assert [x.id for x in get_stale_draft_candidates()] == [c.id]


# ── Consent does not transfer to copy nobody read ───────────────────────────

def test_rewriting_an_approved_draft_returns_it_to_review(app):
    c = _stale()
    changed = apply_regenerated_draft(c, "New subject", "<p>Your listing is live.</p>")

    assert changed is True
    assert c.status == "draft_ready", (
        "an approval given to the old copy must not silently become an "
        "approval of its replacement"
    )
    assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION
    assert c.last_status_change_at is not None


def test_identical_copy_keeps_its_approval(app):
    """A no-op regeneration must not quietly empty the send queue."""
    c = _stale()
    changed = apply_regenerated_draft(c, c.draft_subject, c.draft_body)

    assert changed is False
    assert c.status == STATUS_APPROVED
    assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION


def test_a_draft_ready_row_is_not_promoted(app):
    """The status rule only ever demotes; it never grants an approval."""
    c = _stale(status="draft_ready")
    apply_regenerated_draft(c, "New subject", "<p>New body.</p>")
    assert c.status == "draft_ready"


# ── Both bulk paths actually reach it ───────────────────────────────────────

def _fake_gemini(monkeypatch):
    monkeypatch.setattr(
        outreach_mod,
        "generate_draft_via_gemini",
        lambda c: ("Rewritten subject", "<p>Your listing has been live since.</p>"),
    )


def test_regenerate_all_drafts_reaches_an_approved_row(app, monkeypatch):
    """The Regenerate All Drafts button. Returned 0 here before the fix."""
    _fake_gemini(monkeypatch)
    c = _stale()

    assert regenerate_all_drafts() == 1
    assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION
    assert "in the queue" not in c.draft_body
    assert c.status == "draft_ready"


def test_refresh_stale_drafts_reaches_an_approved_row(app, monkeypatch):
    """The nightly cron's discovery phase."""
    _fake_gemini(monkeypatch)
    c = _stale()

    assert refresh_stale_drafts() == 1
    assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION
    assert "in the queue" not in c.draft_body


def test_terminal_rows_are_left_alone_by_both_paths(app, monkeypatch):
    _fake_gemini(monkeypatch)
    sent = _stale(status="sent", email="sent@execlave.example.com")

    assert regenerate_all_drafts() == 0
    assert refresh_stale_drafts() == 0
    assert "in the queue" in sent.draft_body
    assert sent.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION - 1


# ── The trap closes ─────────────────────────────────────────────────────────

def test_an_approved_stale_row_always_has_a_way_out(app, monkeypatch):
    """The deadlock end to end: stuck, then repaired, then sendable again.

    Asserted as a property rather than a single call - what made this bug
    expensive was not that one function skipped a row, it was that EVERY
    route out of the state was closed at once.
    """
    from app.outreach import can_send_candidate

    _fake_gemini(monkeypatch)
    c = _stale()

    ok, reason = can_send_candidate(c)
    assert ok is False and "template" in reason.lower()

    assert refresh_stale_drafts() == 1          # the cron frees it
    db.session.refresh(c)

    # It now needs a human again, and that human is looking at the new copy.
    ok, reason = can_send_candidate(c)
    assert ok is False and "approve" in reason.lower()

    c.status = STATUS_APPROVED
    db.session.commit()
    ok, _ = can_send_candidate(c)
    assert ok is True


# ── The listing lookup must not depend on a back-reference nobody wrote ─────

def test_slugify_matches_api_routes():
    """The duplicated slug rule must stay identical to the original.

    outreach._slugify is a copy (app.api_routes imports app.outreach, so
    importing back is a cycle). A copy that drifts silently stops matching
    the slugs the catalogue actually stores.
    """
    from app.api_routes import _slugify as canonical
    from app.outreach import _slugify as copy

    for value in ("Execlave", "SimplAI", "Doc Translator", "AI  Compass!!",
                  "  Spaced  Out  ", "", None, "Ünïcode-ish", "a--b"):
        assert copy(value) == canonical(value), value


def test_listing_resolves_when_submission_id_was_never_written(app):
    """The production shape: a live listing with a NULL back-reference.

    catalog_tools.submission_id post-dates the first approvals, and the job
    that repairs it only runs behind a button that renders when some OTHER
    listing is stuck. On a healthy catalogue it never runs — so outreach must
    resolve the listing without it.
    """
    from app.models import CatalogTool, Submission
    from app.outreach import _candidate_listing, _inbound_listing_url

    sub = Submission(
        name="Execlave",
        submitter_email="rrm@execlave.com",
        website="https://execlave.example.com",
        category="Coding",
        description="AI agent governance.",
        pricing_model="freemium",
        status="approved",
        approved_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    )
    db.session.add(sub)
    db.session.commit()

    db.session.add(CatalogTool(
        slug="execlave",
        name="Execlave",
        data=json.dumps({"name": "Execlave"}),
        hidden=False,
        submission_id=None,          # the whole point
        visible_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    ))
    db.session.commit()

    c = _stale(ph_launch_id=f"inbound:{sub.id}")

    found_sub, found_tool = _candidate_listing(c)
    assert found_sub is not None and found_sub.id == sub.id
    assert found_tool is not None, "a live listing must resolve without submission_id"
    assert found_tool.slug == "execlave"

    url = _inbound_listing_url(c)
    assert url == "https://ai-compass.in/tools/execlave", (
        "without this the draft takes the 'not listed yet' branch and tells a "
        "founder their live page is 'in the queue for a free listing'"
    )


def test_slug_fallback_does_not_invent_a_listing(app):
    """No catalog row at all must still resolve to nothing."""
    from app.models import Submission
    from app.outreach import _candidate_listing, _inbound_listing_url

    sub = Submission(
        name="Never Listed",
        submitter_email="x@never.example.com",
        website="https://never.example.com",
        category="Coding",
        description="Not in the catalogue.",
        pricing_model="free",
        status="approved",
        approved_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    )
    db.session.add(sub)
    db.session.commit()

    c = _stale(ph_launch_id=f"inbound:{sub.id}", email="x@never.example.com")

    found_sub, found_tool = _candidate_listing(c)
    assert found_sub is not None
    assert found_tool is None
    assert _inbound_listing_url(c) is None
