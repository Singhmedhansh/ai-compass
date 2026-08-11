"""Catalog traffic-report campaign (app/outreach.py section 8).

Focus is the selection logic — which listed tools get turned into candidates
and which are correctly skipped. Draft generation is exercised only through
the offline template fallback so these never touch the Gemini API.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.models import CatalogTool, OutboundClick, OutreachCandidate
from app.outreach import (
    CATALOG_CANDIDATE_ID_PREFIX,
    _catalog_tool_info,
    _existing_candidate_for,
    get_catalog_click_counts,
    get_generic_traffic_report_draft,
    run_catalog_traffic_campaign,
)


@pytest.fixture(autouse=True)
def _clean(app):
    with app.app_context():
        OutboundClick.query.delete()
        OutreachCandidate.query.delete()
        CatalogTool.query.delete()
        db.session.commit()
        yield
        OutboundClick.query.delete()
        OutreachCandidate.query.delete()
        CatalogTool.query.delete()
        db.session.commit()


def _tool(slug, name, link="https://example.com", hidden=False):
    db.session.add(CatalogTool(
        slug=slug, name=name, hidden=hidden,
        data=json.dumps({"name": name, "link": link, "tagline": f"{name} tagline"}),
    ))


def _clicks(slug, n, days_ago=1):
    when = datetime.now(timezone.utc) - timedelta(days=days_ago)
    for _ in range(n):
        db.session.add(OutboundClick(slug=slug, is_affiliate=False, created_at=when))


class TestClickCounts:
    def test_counts_and_threshold(self, app):
        with app.app_context():
            _clicks("busy", 7)
            _clicks("quiet", 2)
            db.session.commit()

            assert get_catalog_click_counts(days=30, min_clicks=1) == {"busy": 7, "quiet": 2}
            assert get_catalog_click_counts(days=30, min_clicks=5) == {"busy": 7}

    def test_ignores_clicks_outside_window(self, app):
        with app.app_context():
            _clicks("stale", 9, days_ago=60)
            db.session.commit()

            assert get_catalog_click_counts(days=30, min_clicks=1) == {}


class TestToolInfo:
    def test_returns_name_tagline_url(self, app):
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            db.session.commit()

            assert _catalog_tool_info("acme") == ("Acme", "Acme tagline", "https://acme.dev")

    def test_skips_hidden_missing_and_unusable_url(self, app):
        with app.app_context():
            _tool("hidden", "Hidden", hidden=True)
            _tool("nourl", "NoUrl", link="")
            _tool("relative", "Relative", link="/internal/page")
            db.session.commit()

            assert _catalog_tool_info("hidden") is None
            assert _catalog_tool_info("nourl") is None
            assert _catalog_tool_info("relative") is None
            assert _catalog_tool_info("does-not-exist") is None


class TestExistingCandidateCheck:
    """The catalog-aware dedup. is_duplicate_candidate() treats "matches a
    catalog tool" as duplicate, which would match every candidate in this
    campaign against itself and silently create nothing.
    """

    def test_listed_tool_is_not_itself_a_duplicate(self, app):
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            db.session.commit()

            assert _existing_candidate_for("Acme", "https://acme.dev") is None

    def test_detects_candidate_from_cold_discovery(self, app):
        with app.app_context():
            db.session.add(OutreachCandidate(
                product_name="Acme", website_url="https://acme.dev",
                ph_launch_id="ph-999", status="draft_ready",
            ))
            db.session.commit()

            assert _existing_candidate_for("Acme", "https://acme.dev") is not None
            assert _existing_candidate_for("Acme", "https://other.dev") is not None  # name match
            assert _existing_candidate_for("Unrelated", "https://acme.dev") is not None  # domain match
            assert _existing_candidate_for("Unrelated", "https://nowhere.dev") is None


class TestGenericDraft:
    def test_leads_with_the_real_number(self, app):
        with app.app_context():
            c = OutreachCandidate(product_name="Acme", founder_name="", email="a@acme.dev")
            subject, body = get_generic_traffic_report_draft(c, 143, 30)

            assert "143" in subject and "Acme" in subject
            assert len(subject) <= 50
            assert "143 click-throughs" in body
            assert "https://ai-compass.in/submit" in body
            assert "/unsubscribe?token=" in body

    def test_greets_by_first_name_only_when_real(self, app):
        with app.app_context():
            real = OutreachCandidate(product_name="Acme", founder_name="Jane Doe", email="j@acme.dev")
            assert "Hey Jane," in get_generic_traffic_report_draft(real, 10, 30)[1]

            handle = OutreachCandidate(product_name="Acme", founder_name="geekamongus", email="g@acme.dev")
            assert "Hey there," in get_generic_traffic_report_draft(handle, 10, 30)[1]


class TestCampaignRun:
    def test_creates_candidate_for_listed_tool_with_traffic(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": ("founder@acme.dev", "web_scraper", 95, "valid"),
        )
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            _clicks("acme", 12)
            db.session.commit()

            result = run_catalog_traffic_campaign(min_clicks=5, days=30)
            assert result["created"] == 1

            c = OutreachCandidate.query.one()
            assert c.ph_launch_id == f"{CATALOG_CANDIDATE_ID_PREFIX}acme"
            assert c.email == "founder@acme.dev"
            assert c.verification_result == "valid"
            assert c.status == "draft_ready"
            assert "12" in c.draft_subject

    def test_below_threshold_is_not_contacted(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": ("founder@acme.dev", "web_scraper", 95, "valid"),
        )
        with app.app_context():
            _tool("quiet", "Quiet", link="https://quiet.dev")
            _clicks("quiet", 2)
            db.session.commit()

            assert run_catalog_traffic_campaign(min_clicks=5, days=30)["created"] == 0
            assert OutreachCandidate.query.count() == 0

    def test_is_idempotent(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": ("founder@acme.dev", "web_scraper", 95, "valid"),
        )
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            _clicks("acme", 12)
            db.session.commit()

            assert run_catalog_traffic_campaign(min_clicks=5, days=30)["created"] == 1
            second = run_catalog_traffic_campaign(min_clicks=5, days=30)
            assert second["created"] == 0
            assert second["skipped_existing"] == 1
            assert OutreachCandidate.query.count() == 1

    def test_no_email_found_is_saved_for_manual_followup(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": (None, "none", 0, None),
        )
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            _clicks("acme", 12)
            db.session.commit()

            assert run_catalog_traffic_campaign(min_clicks=5, days=30)["created"] == 1
            assert OutreachCandidate.query.one().status == "no_email_found"

    def test_respects_per_run_limit(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": ("founder@acme.dev", "web_scraper", 95, "valid"),
        )
        with app.app_context():
            for i in range(5):
                _tool(f"tool{i}", f"Tool {i}", link=f"https://tool{i}.dev")
                _clicks(f"tool{i}", 10 + i)
            db.session.commit()

            assert run_catalog_traffic_campaign(min_clicks=5, days=30, limit=2)["created"] == 2
            assert OutreachCandidate.query.count() == 2

    def test_skips_tool_already_in_cold_pipeline(self, app, monkeypatch):
        monkeypatch.setattr(
            "app.outreach.enrich_candidate_email",
            lambda url, name="": ("founder@acme.dev", "web_scraper", 95, "valid"),
        )
        with app.app_context():
            _tool("acme", "Acme", link="https://acme.dev")
            _clicks("acme", 12)
            db.session.add(OutreachCandidate(
                product_name="Acme", website_url="https://acme.dev",
                ph_launch_id="ph-123", status="sent",
            ))
            db.session.commit()

            result = run_catalog_traffic_campaign(min_clicks=5, days=30)
            assert result["created"] == 0
            assert result["skipped_existing"] == 1
