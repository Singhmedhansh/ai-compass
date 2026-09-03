import os
import time
import threading
from datetime import date, datetime, timezone
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

from app import db, csrf
from app.models import OutreachCandidate, OutreachEmailLog, Submission
from app.email_utils import send_email_with_details, read_prefill_token
from app.outreach_qualify import qualification_summary
from app.send_budget import reserve_send_slots, release_send_slots
from app.outreach import (
    run_discovery_pipeline,
    re_enrich_missing_candidate_emails,
    run_automated_followups,
    run_automated_initial_sends,
    apply_regenerated_draft,
    regenerate_all_drafts,
    trigger_github_verification_workflow,
    generate_draft_via_gemini,
    fetch_producthunt_launches,
    fetch_shownews_launches,
    fetch_betalist_launches,
    fetch_uneed_launches,
    is_duplicate_candidate,
    is_deployed_app_url,
    is_student_relevant,
    is_commercial_saas,
    sends_remaining_today,
    can_send_candidate,
    DAILY_SEND_CAP,
    VERIFICATION_RESULT_CONFIDENCE,
    _status_for_email_confidence,
    OUTREACH_REPLY_TO,
    OUTREACH_FROM,
    _outreach_send_headers,
    run_catalog_traffic_campaign,
    get_catalog_click_counts,
    CATALOG_CAMPAIGN_MIN_CLICKS,
    CATALOG_CAMPAIGN_MAX_PER_RUN,
    CATALOG_CANDIDATE_ID_PREFIX,
    CURRENT_DRAFT_TEMPLATE_VERSION,
    get_stale_draft_candidates,
    refresh_stale_drafts,
    archive_v1_candidates,
    import_inbound_submitters,
    run_archive_discovery,
    STATUS_APPROVED,
    CURRENT_CAMPAIGN,
    CAMPAIGN_SEND_BUDGET,
    CAMPAIGN_DAILY_SEND_MAX,
    campaign_sends_today,
    campaign_daily_remaining,
)

outreach_bp = Blueprint("outreach", __name__)

# Discovery and re-enrich are both CPU/network-heavy on a free-tier,
# single-shared-vCPU instance. Letting two of these run concurrently (e.g.
# an admin clicking both buttons in quick succession, or the daily cron
# firing mid-manual-run) is what starved the process enough to stop
# answering even /healthz. This lock makes that structurally impossible —
# a second trigger while one is already running is rejected outright rather
# than silently stacking more concurrent load.
_outreach_job_lock = threading.Lock()

def _outreach_job_running():
    return _outreach_job_lock.locked()

# Lets the admin UI poll for real completion instead of guessing with fixed
# timeouts — discovery/re-enrich chain per-candidate network calls and can
# run for several minutes, far longer than a page's initial refresh window.
_outreach_job_state = {
    "kind": None,
    "running": False,
    "started_at": None,
    "finished_at": None,
    "result": None,
    "error": None,
}

def _job_start(kind):
    _outreach_job_state.update({
        "kind": kind,
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "result": None,
        "error": None,
    })

def _job_finish(result=None, error=None):
    _outreach_job_state.update({
        "running": False,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "result": result,
        "error": error,
    })

def _is_admin() -> bool:
    if not getattr(current_user, "is_authenticated", False):
        return False
    if getattr(current_user, "is_admin", False):
        return True
    allow = current_app.config.get("ADMIN_EMAILS", [])
    email = str(getattr(current_user, "email", "") or "").strip().lower()
    return email and email in allow

# ─── ADMIN API ROUTES ────────────────────────────────────────────────────────

@outreach_bp.route("/api/v1/admin/outreach/candidates", methods=["GET"])
@login_required
def get_candidates():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    
    status_filter = request.args.get("status")
    query = OutreachCandidate.query
    if status_filter:
        query = query.filter_by(status=status_filter)

    # Campaign console filters. Absent, the endpoint behaves exactly as before
    # so the legacy list keeps working.
    campaign = request.args.get("campaign")
    if campaign:
        query = query.filter_by(campaign=campaign)
    pool = request.args.get("pool")
    if pool:
        query = query.filter_by(lead_pool=pool)

    # Best-evidenced candidates first. The console exists to spend a budget of
    # 45 carefully, so the ones most likely to convert have to be the ones an
    # operator reads first — created_at order buries them under whatever was
    # scraped most recently.
    candidates = query.order_by(
        OutreachCandidate.fit_score.desc().nullslast(),
        OutreachCandidate.created_at.desc(),
    ).all()

    # Return formatted list
    res = []
    for c in candidates:
        qualification = qualification_summary(c)
        res.append({
            "campaign": c.campaign,
            "lead_pool": c.lead_pool,
            "fit_score": c.fit_score,
            # Evidence behind the score, so approving a send is a judgement
            # made on facts rather than on a bare number.
            "qualification": qualification,
            "failed_gate": (qualification or {}).get("failed_gate"),
            "id": c.id,
            "product_name": c.product_name,
            "tagline": c.tagline,
            "website_url": c.website_url,
            "founder_name": c.founder_name,
            "email": c.email,
            "status": c.status,
            "draft_subject": c.draft_subject,
            "draft_body": c.draft_body,
            "email_source": c.email_source,
            "confidence_score": c.confidence_score,
            "tone": c.tone,
            "ph_launch_id": c.ph_launch_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "last_status_change_at": c.last_status_change_at.isoformat() if c.last_status_change_at else None,
            # Which copy template this stored draft was written against, and
            # what current is. Without both, "did Regenerate actually do
            # anything?" can only be answered by reading the prose and
            # guessing - which is exactly how a whole afternoon went.
            "draft_template_version": c.draft_template_version,
            "current_template_version": CURRENT_DRAFT_TEMPLATE_VERSION,
        })
    return jsonify(res)

@outreach_bp.route("/api/v1/admin/outreach/candidates", methods=["POST"])
@csrf.exempt
@login_required
def add_candidate():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    
    data = request.json or {}
    name = data.get("product_name")
    url = data.get("website_url")
    founder = data.get("founder_name")
    email = data.get("email")
    tone = data.get("tone", "peer")
    tagline = data.get("tagline", "")
    
    if not name or not url:
        return jsonify({"error": "Product name and Website URL are required"}), 400
        
    c = OutreachCandidate()
    c.product_name = name
    c.website_url = url
    c.founder_name = founder
    c.email = email
    c.tone = tone
    c.tagline = tagline
    c.email_source = "manual"
    c.status = "draft_ready" if email else "no_email_found"
    
    # Auto-generate draft proposal
    subject, body = generate_draft_via_gemini(c)
    c.draft_subject = subject
    c.draft_body = body
    c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION

    db.session.add(c)
    db.session.commit()
    
    return jsonify({"success": True, "id": c.id})

@outreach_bp.route("/api/v1/admin/outreach/candidates/<int:cid>", methods=["PUT"])
@csrf.exempt
@login_required
def update_candidate(cid):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    c = OutreachCandidate.query.get_or_404(cid)
    data = request.json or {}
    
    # Update candidate fields
    if "product_name" in data:
        c.product_name = data["product_name"]
    if "website_url" in data:
        c.website_url = data["website_url"]
    if "founder_name" in data:
        c.founder_name = data["founder_name"]
    if "email" in data:
        c.email = data["email"]
        if c.status == "no_email_found" and c.email:
            c.status = "draft_ready"
    if "confidence_score" in data:
        # Manual override for an admin who verified the address through some
        # other channel — the >=90 send gate trusts this field directly, so
        # this is the one way to clear it without going through NeverBounce.
        c.confidence_score = data["confidence_score"]
        c.verification_result = "manual_override"
        c.verified_at = datetime.now(timezone.utc)
    if "tone" in data:
        c.tone = data["tone"]
    if "tagline" in data:
        c.tagline = data["tagline"]
    if "draft_subject" in data:
        c.draft_subject = data["draft_subject"]
    if "draft_body" in data:
        c.draft_body = data["draft_body"]
    
    # Regenerate draft option
    if data.get("regenerate_draft"):
        subject, body = generate_draft_via_gemini(c)
        # Same rule as the bulk paths: rewriting an approved draft returns it
        # to review, because the approval was given to the old text.
        apply_regenerated_draft(c, subject, body)


    if "status" in data:
        old_status = c.status
        c.status = data["status"]
        if old_status != c.status:
            c.last_status_change_at = datetime.now(timezone.utc)
            
    db.session.commit()
    return jsonify({"success": True})

@outreach_bp.route("/api/v1/admin/outreach/candidates/<int:cid>/send", methods=["POST"])
@csrf.exempt
@login_required
def send_candidate_email(cid):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    c = OutreachCandidate.query.get_or_404(cid)

    ok, reason = can_send_candidate(c)
    if not ok:
        return jsonify({"error": reason}), 400

    if sends_remaining_today() <= 0:
        return jsonify({"error": f"Daily send cap ({DAILY_SEND_CAP}) reached. Try again after 9 AM IST, or raise OUTREACH_DAILY_SEND_CAP."}), 429

    # Manual sends draw on the same shared Resend 100/day budget as the
    # automated outreach cron and the new-tools digest.
    if reserve_send_slots(1, requester="outreach-manual")["granted"] == 0:
        return jsonify({"error": "Shared daily send budget is exhausted (outreach + digest + manual combined). Try again tomorrow."}), 429

    success = False
    err_msg = None
    try:
        # Send html email with fallback text description
        success, err_msg = send_email_with_details(
            to=c.email, subject=c.draft_subject, html=c.draft_body,
            reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
            sender=OUTREACH_FROM,
        )
    except Exception as exc:
        err_msg = str(exc)

    if not success:
        release_send_slots(1, requester="outreach-manual")

    log_entry = OutreachEmailLog(
        candidate_id=c.id,
        email=c.email,
        subject=c.draft_subject,
        body=c.draft_body,
        status="success" if success else "failure",
        error_message=err_msg
    )
    db.session.add(log_entry)

    if success:
        c.status = "sent"
        c.last_status_change_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({"success": True})
    else:
        db.session.commit()
        return jsonify({"success": False, "error": f"Failed to send via Resend: {err_msg or 'Check Resend configuration'}"}), 500

@outreach_bp.route("/api/v1/admin/outreach/candidates/bulk-send", methods=["POST"])
@csrf.exempt
@login_required
def bulk_send_candidates():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json or {}
    cids = data.get("ids", [])

    candidates = OutreachCandidate.query.filter(OutreachCandidate.id.in_(cids)).all()
    sent = 0
    failed = 0
    remaining = sends_remaining_today()
    capped = 0
    skipped_ineligible = 0

    for c in candidates:
        ok, _reason = can_send_candidate(c)
        if not ok:
            # Missing draft/email, opted-out status, or not mailbox-verified —
            # not a send failure, just not eligible.
            skipped_ineligible += 1
            continue
        if remaining <= 0:
            capped += 1
            continue

        # Shared Resend 100/day budget (outreach + digest + manual combined).
        if reserve_send_slots(1, requester="outreach-manual")["granted"] == 0:
            capped += 1
            continue

        success = False
        err_msg = None
        try:
            success, err_msg = send_email_with_details(
                to=c.email, subject=c.draft_subject, html=c.draft_body,
                reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
                sender=OUTREACH_FROM,
            )
        except Exception as exc:
            err_msg = str(exc)

        if not success:
            release_send_slots(1, requester="outreach-manual")

        log_entry = OutreachEmailLog(
            candidate_id=c.id,
            email=c.email,
            subject=c.draft_subject,
            body=c.draft_body,
            status="success" if success else "failure",
            error_message=err_msg
        )
        db.session.add(log_entry)

        if success:
            c.status = "sent"
            c.last_status_change_at = datetime.now(timezone.utc)
            sent += 1
            remaining -= 1
            time.sleep(1.5)  # spread sends out rather than bursting Resend
        else:
            failed += 1

    db.session.commit()
    resp = {"success": True, "sent": sent, "failed": failed}
    messages = []
    if capped:
        resp["capped"] = capped
        messages.append(f"Send cap reached — {capped} candidate(s) deferred to a later run (daily ramp {DAILY_SEND_CAP}/day or shared Resend budget).")
    if skipped_ineligible:
        resp["skipped_ineligible"] = skipped_ineligible
        messages.append(f"{skipped_ineligible} candidate(s) skipped — not eligible (no verified email, missing draft, or opted-out/already-contacted status).")
    if messages:
        resp["message"] = " ".join(messages)
    return jsonify(resp)

@outreach_bp.route("/api/v1/admin/outreach/candidates/bulk-reject", methods=["POST"])
@csrf.exempt
@login_required
def bulk_reject_candidates():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json or {}
    cids = data.get("ids", [])
    
    candidates = OutreachCandidate.query.filter(OutreachCandidate.id.in_(cids)).all()
    rejected_count = 0
    for c in candidates:
        if c.status != "sent" and c.status != "followed_up":
            c.status = "rejected"
            c.last_status_change_at = datetime.now(timezone.utc)
            rejected_count += 1
            
    db.session.commit()
    return jsonify({"success": True, "rejected": rejected_count})

@outreach_bp.route("/api/v1/admin/outreach/logs", methods=["GET"])
@login_required
def get_outreach_logs():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    try:
        limit = min(max(int(request.args.get("limit", 300)), 1), 1000)
    except (TypeError, ValueError):
        limit = 300

    logs = (
        OutreachEmailLog.query
        .order_by(OutreachEmailLog.sent_at.desc())
        .limit(limit)
        .all()
    )
    # One query for every candidate referenced, instead of one per log row.
    cand_ids = {lg.candidate_id for lg in logs}
    names = dict(
        db.session.query(OutreachCandidate.id, OutreachCandidate.product_name)
        .filter(OutreachCandidate.id.in_(cand_ids))
        .all()
    ) if cand_ids else {}

    res = [
        {
            "id": lg.id,
            "candidate_id": lg.candidate_id,
            "product_name": names.get(lg.candidate_id, "Deleted Candidate"),
            "email": lg.email,
            "subject": lg.subject,
            "body": lg.body,
            "status": lg.status,
            "error_message": lg.error_message,
            "sent_at": lg.sent_at.isoformat() if lg.sent_at else None,
        }
        for lg in logs
    ]
    return jsonify(res)

@outreach_bp.route("/api/v1/admin/outreach/trigger-discovery", methods=["POST"])
@csrf.exempt
@login_required
def trigger_discovery():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — wait for it to finish before starting another."}), 409

    try:
        # run_discovery_pipeline() calls enrich_candidate_email() sequentially
        # for every qualifying candidate it finds, and each of those can chain
        # through several network-bound strategies — worst case tens of
        # seconds per candidate. Running that synchronously in the request
        # thread held a gthread worker (and this free-tier instance's single
        # shared vCPU) hostage for minutes on a busy discovery run, degrading
        # every other request — including /healthz — for as long as it ran.
        # Backgrounded now, same pattern as /re-enrich.
        app_obj = current_app._get_current_object()
        app_ctx = app_obj.app_context()
        _job_start("discovery")

        def _bg():
            try:
                with app_ctx:
                    try:
                        new_count = run_discovery_pipeline()
                        app_obj.logger.info("Background discovery completed: %s new candidates.", new_count)
                        _job_finish(result={"new_candidates": new_count})
                    except Exception as ex:
                        app_obj.logger.exception("Background discovery failed: %s", ex)
                        _job_finish(error=str(ex))
            finally:
                _outreach_job_lock.release()

        threading.Thread(target=_bg, name="discovery-bg", daemon=True).start()

        return jsonify({"success": True, "message": "Discovery running in background"}), 202
    except Exception as e:
        _outreach_job_lock.release()
        current_app.logger.exception("Failed to start discovery pipeline")
        return jsonify({"error": str(e)}), 500

@outreach_bp.route("/api/v1/admin/outreach/re-enrich", methods=["POST"])
@csrf.exempt
@login_required
def trigger_re_enrich():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — wait for it to finish before starting another."}), 409

    try:
        app_obj = current_app._get_current_object()
        app_ctx = app_obj.app_context()
        _job_start("re-enrich")

        def _bg():
            try:
                with app_ctx:
                    try:
                        result = re_enrich_missing_candidate_emails()
                        app_obj.logger.info(
                            "Background re-verification completed: %s emails fixed, %s names fixed, %s drafts regenerated.",
                            result.get("emails_fixed", 0), result.get("names_fixed", 0), result.get("drafts_regenerated", 0)
                        )
                        _job_finish(result=result)
                    except Exception as ex:
                        app_obj.logger.exception("Background re-enrichment failed: %s", ex)
                        _job_finish(error=str(ex))
            finally:
                _outreach_job_lock.release()

        threading.Thread(target=_bg, name="re-enrichment-bg", daemon=True).start()

        # Also kick off the real SMTP verifier on GitHub Actions right now
        # instead of waiting for the next daily cron tick — this is a quick
        # single API call, not backgrounded, so its outcome can go straight
        # into the response.
        gh_triggered, gh_message = trigger_github_verification_workflow()

        message = "Re-verifying emails and founder names in the background."
        if gh_triggered:
            message += " Real SMTP verification also triggered — scores update in ~1-2 minutes."
        else:
            message += f" Real verification NOT triggered ({gh_message}) — falling back to the daily automatic cron."

        return jsonify({"success": True, "message": message, "github_verification_triggered": gh_triggered}), 202
    except Exception as e:
        _outreach_job_lock.release()
        current_app.logger.exception("Failed to run re-enrichment pipeline")
        return jsonify({"error": str(e)}), 500

@outreach_bp.route("/api/v1/admin/outreach/catalog-campaign", methods=["POST"])
@csrf.exempt
@login_required
def trigger_catalog_campaign():
    """Builds traffic-report candidates from already-listed tools that are
    sending real referral clicks. Prepares only — never sends.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — wait for it to finish before starting another."}), 409

    data = request.json or {}
    try:
        min_clicks = int(data["min_clicks"]) if data.get("min_clicks") is not None else None
        days = int(data.get("days") or 30)
    except (TypeError, ValueError):
        _outreach_job_lock.release()
        return jsonify({"error": "min_clicks and days must be whole numbers."}), 400

    try:
        # Same backgrounding rationale as /trigger-discovery: each candidate
        # chains several network-bound enrichment strategies, which would
        # otherwise hold a gthread worker (and this free-tier instance's
        # single shared vCPU) for minutes and degrade /healthz along with it.
        app_obj = current_app._get_current_object()
        app_ctx = app_obj.app_context()
        _job_start("catalog-campaign")

        def _bg():
            try:
                with app_ctx:
                    try:
                        result = run_catalog_traffic_campaign(min_clicks=min_clicks, days=days)
                        app_obj.logger.info("Catalog traffic campaign completed: %s", result)
                        _job_finish(result=result)
                    except Exception as ex:
                        app_obj.logger.exception("Catalog traffic campaign failed: %s", ex)
                        _job_finish(error=str(ex))
            finally:
                _outreach_job_lock.release()

        threading.Thread(target=_bg, name="catalog-campaign-bg", daemon=True).start()

        return jsonify({
            "success": True,
            "message": "Building traffic-report drafts in the background. Candidates appear in the list as they're enriched.",
        }), 202
    except Exception as e:
        _outreach_job_lock.release()
        current_app.logger.exception("Failed to start catalog traffic campaign")
        return jsonify({"error": str(e)}), 500


@outreach_bp.route("/api/v1/admin/outreach/catalog-campaign/preview", methods=["GET"])
@login_required
def preview_catalog_campaign():
    """How many listed tools would qualify, so the admin can sanity-check the
    click threshold before generating anything.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    try:
        min_clicks = int(request.args.get("min_clicks") or CATALOG_CAMPAIGN_MIN_CLICKS)
        days = int(request.args.get("days") or 30)
    except (TypeError, ValueError):
        return jsonify({"error": "min_clicks and days must be whole numbers."}), 400

    counts = get_catalog_click_counts(days=days, min_clicks=min_clicks)
    already = {
        c.ph_launch_id[len(CATALOG_CANDIDATE_ID_PREFIX):]
        for c in OutreachCandidate.query.filter(
            OutreachCandidate.ph_launch_id.like(f"{CATALOG_CANDIDATE_ID_PREFIX}%")
        ).all()
        if c.ph_launch_id
    }
    pending = {s: n for s, n in counts.items() if s not in already}
    return jsonify({
        "min_clicks": min_clicks,
        "days": days,
        "eligible": len(counts),
        "already_created": len(counts) - len(pending),
        "would_create": min(len(pending), CATALOG_CAMPAIGN_MAX_PER_RUN),
        "per_run_limit": CATALOG_CAMPAIGN_MAX_PER_RUN,
        "top": [{"slug": s, "clicks": n} for s, n in list(pending.items())[:10]],
    })


@outreach_bp.route("/api/v1/admin/outreach/regenerate-all-drafts", methods=["POST"])
@csrf.exempt
@login_required
def trigger_regenerate_all_drafts():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — wait for it to finish before starting another."}), 409

    try:
        app_obj = current_app._get_current_object()
        app_ctx = app_obj.app_context()
        _job_start("regenerate-drafts")

        def _bg():
            try:
                with app_ctx:
                    try:
                        count = regenerate_all_drafts()
                        app_obj.logger.info("Background draft regeneration completed: %s drafts regenerated.", count)
                        _job_finish(result={
                            "drafts_regenerated": count,
                            # The version is the whole point of the run. The
                            # caller cannot otherwise tell a regeneration that
                            # landed on new copy from one that rewrote every
                            # draft onto the same template it already had.
                            "template_version": CURRENT_DRAFT_TEMPLATE_VERSION,
                        })
                    except Exception as ex:
                        app_obj.logger.exception("Background draft regeneration failed: %s", ex)
                        _job_finish(error=str(ex))
            finally:
                _outreach_job_lock.release()

        threading.Thread(target=_bg, name="regenerate-drafts-bg", daemon=True).start()

        return jsonify({"success": True, "message": "Regenerating all drafts in the background"}), 202
    except Exception as e:
        _outreach_job_lock.release()
        current_app.logger.exception("Failed to start draft regeneration")
        return jsonify({"error": str(e)}), 500

# ─── AUTOMATED CRON ENDPOINT ──────────────────────────────────────────────────

def _verify_outreach_secret():
    """Shared auth for callers that can't do session-based admin login —
    the GitHub Actions cron workflow and the SMTP verification prober
    (scripts/verify_outreach_emails_smtp.py), both external to Render.
    Returns a Flask error response to return immediately, or None if OK.
    """
    secret = os.environ.get("OUTREACH_SECRET")
    if not secret:
        return jsonify({"error": "OUTREACH_SECRET env var is not set on the server"}), 500
    auth_header = request.headers.get("X-Outreach-Secret")
    token_arg = request.args.get("token")
    if auth_header != secret and token_arg != secret:
        return jsonify({"error": "Unauthorized"}), 401
    return None

# ─── V2 CAMPAIGN CONTROLS ─────────────────────────────────────────────────────
# Both of these default to a DRY RUN and require an explicit {"confirm": true}
# to change anything. They are bulk writes against the live candidate table
# driven by a button in an admin panel, which is exactly the shape of thing
# that gets clicked once to "see what it does".

@outreach_bp.route("/api/v1/admin/outreach/campaign/inbound-import", methods=["POST"])
@csrf.exempt
@login_required
def campaign_inbound_import():
    """Counts (or imports) the inbound-submitter pool.

    Answer the counting question BEFORE building anything else on top of this
    pool: the campaign plan assumes roughly a dozen qualified free submitters
    exist. If the real queue holds four, the warm allocation collapses and the
    revenue forecast with it — better to find that out from a dry run than
    from a send.
    """
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    payload = request.get_json(silent=True) or {}
    confirm = bool(payload.get("confirm"))
    limit = payload.get("limit")
    limit = int(limit) if limit else None

    # The dry run is pure database reads - no network, no LLM - so it answers
    # in milliseconds and stays synchronous. That matters: the count is the
    # number the campaign is sized from and it should come back instantly.
    if not confirm:
        result = import_inbound_submitters(
            campaign=CURRENT_CAMPAIGN, dry_run=True, limit=limit,
        )
        result["campaign"] = CURRENT_CAMPAIGN
        return jsonify(result)

    # The write is a different animal entirely, and running it in the request
    # thread was wrong. Per candidate it calls qualify_candidate() - which
    # fetches a pricing page and does an RDAP lookup - and then
    # generate_draft_via_gemini(), an LLM round-trip. Eleven of those is
    # minutes, not seconds: the browser gave up at 60s while the server was
    # still working, holding a gthread worker and a pooled connection the
    # whole time on a single-shared-vCPU instance.
    #
    # Same background pattern as /trigger-discovery and /re-enrich, including
    # the shared job lock - two of these running at once is what previously
    # starved this instance badly enough to stop answering /healthz.
    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({
            "error": "Another outreach job is already running — wait for it to "
                     "finish before starting the import."
        }), 409

    try:
        app_obj = current_app._get_current_object()
        app_ctx = app_obj.app_context()
        _job_start("inbound-import")

        def _bg():
            try:
                with app_ctx:
                    try:
                        res = import_inbound_submitters(
                            campaign=CURRENT_CAMPAIGN, dry_run=False, limit=limit,
                        )
                        app_obj.logger.info(
                            "Inbound import completed: %s imported.", res.get("imported"),
                        )
                        _job_finish(result=res)
                    except Exception as ex:
                        app_obj.logger.exception("Inbound import failed: %s", ex)
                        _job_finish(error=str(ex))
            finally:
                _outreach_job_lock.release()

        threading.Thread(target=_bg, name="inbound-import-bg", daemon=True).start()

        return jsonify({
            "success": True,
            "started": True,
            "campaign": CURRENT_CAMPAIGN,
            "message": "Importing in the background. Each candidate is scored and "
                       "drafted, which takes a few seconds each — they appear in "
                       "Needs review as they land.",
        }), 202
    except Exception as e:  # noqa: BLE001
        _outreach_job_lock.release()
        current_app.logger.exception("Could not start inbound import")
        return jsonify({"error": str(e)}), 500


@outreach_bp.route("/api/v1/admin/outreach/campaign/archive-v1", methods=["POST"])
@csrf.exempt
@login_required
def campaign_archive_v1():
    """Moves the pre-rework candidate pool aside. Dry run unless confirmed."""
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    confirm = bool((request.get_json(silent=True) or {}).get("confirm"))
    return jsonify(archive_v1_candidates(dry_run=not confirm))


@outreach_bp.route("/api/v1/admin/outreach/campaign/archive-discovery", methods=["POST"])
@csrf.exempt
@login_required
def campaign_archive_discovery():
    """Sources and qualifies the cold pool from a past Product Hunt date range.

    Body: {"start": "2026-04-01", "end": "2026-04-30", "confirm": false,
           "max_days": 30, "limit": 200}

    Dry run unless confirmed, and the dry run is the point: it reports how many
    launches cleared each gate without writing anything or spending a Gemini
    call. If the bar returns hundreds of qualified candidates it is too low and
    we are back to quantity, which is the failure the rework exists to fix.
    """
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    payload = request.get_json(silent=True) or {}
    try:
        start = datetime.strptime(payload["start"], "%Y-%m-%d").date()
        end = datetime.strptime(payload["end"], "%Y-%m-%d").date()
    except (KeyError, ValueError):
        return jsonify({
            "error": "Provide 'start' and 'end' as YYYY-MM-DD dates.",
        }), 400

    if end < start:
        return jsonify({"error": "'end' must not be before 'start'."}), 400

    # One HTTP request per day in the range plus several per surviving launch.
    # An unbounded range typed by hand is how this turns into a very long
    # request against a free-tier instance.
    if (end - start).days > 62:
        return jsonify({
            "error": "Range is capped at 62 days. Run it a month at a time.",
        }), 400

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another outreach job is already running."}), 409
    try:
        result = run_archive_discovery(
            start, end,
            max_days=payload.get("max_days"),
            dry_run=not bool(payload.get("confirm")),
            limit=int(payload["limit"]) if payload.get("limit") else None,
        )
    finally:
        _outreach_job_lock.release()

    result["campaign"] = CURRENT_CAMPAIGN
    return jsonify(result)


@outreach_bp.route("/api/v1/admin/outreach/candidates/<int:candidate_id>/approve", methods=["POST"])
@csrf.exempt
@login_required
def approve_candidate(candidate_id):
    """Marks one candidate approved to send, or takes that approval back.

    This is the human step the whole campaign is built around: nothing under a
    campaign sends until someone has read the draft and the evidence behind the
    score. Body {"approved": false} reverses it while the email is still
    unsent.

    Approving deliberately runs the same can_send_candidate() checks the sender
    will run, and refuses if they fail. Letting a candidate sit in 'approved'
    with a dead mailbox or a stale draft would mean the queue says ready and
    the sender silently disagrees.
    """
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    c = db.session.get(OutreachCandidate, candidate_id)
    if not c:
        return jsonify({"error": "Candidate not found."}), 404

    approved = bool((request.get_json(silent=True) or {}).get("approved", True))

    if not approved:
        if c.status == STATUS_APPROVED:
            c.status = "draft_ready"
            c.last_status_change_at = datetime.now(timezone.utc)
            db.session.commit()
        return jsonify({"id": c.id, "status": c.status})

    if c.status not in ("draft_ready", STATUS_APPROVED):
        return jsonify({
            "error": f"Only a draft can be approved — this one is '{c.status}'.",
        }), 400

    # Eligibility as the SENDER will see it, asked without mutating the row and
    # without today's pacing counting against it — see can_send_candidate.
    ok, reason = can_send_candidate(c, for_approval=True)
    if not ok:
        db.session.rollback()
        return jsonify({"error": reason}), 400

    c.status = STATUS_APPROVED
    c.last_status_change_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({"id": c.id, "status": c.status})


@outreach_bp.route("/api/v1/admin/outreach/campaign/gates", methods=["GET"])
@login_required
def campaign_gate_breakdown():
    """What the qualification bar threw away, grouped by the gate that did it.

    Invisible in the old console, which only listed candidates that survived.
    Without this there is no way to tell a bar that is correctly strict from
    one that is broken — if nearly everything dies at no_qualifying_price, the
    price extractor is failing on real pricing pages rather than the market
    being poor.
    """
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    campaign = request.args.get("campaign") or CURRENT_CAMPAIGN
    rejected = OutreachCandidate.query.filter(
        OutreachCandidate.campaign == campaign,
        OutreachCandidate.status == "rejected",
    ).order_by(OutreachCandidate.created_at.desc()).all()

    gates = {}
    rows = []
    for c in rejected:
        q = qualification_summary(c) or {}
        gate = q.get("failed_gate") or "below_score"
        gates[gate] = gates.get(gate, 0) + 1
        rows.append({
            "id": c.id,
            "product_name": c.product_name,
            "website_url": c.website_url,
            "failed_gate": gate,
            "score": c.fit_score,
            "evidence": (q.get("evidence") or [])[:6],
        })

    return jsonify({"campaign": campaign, "by_gate": gates, "total": len(rows), "rejected": rows})


# The revenue target and its deadline. Both are campaign facts rather than
# product config, which is why they live here beside the send budget.
CAMPAIGN_REVENUE_TARGET = float(os.environ.get("OUTREACH_REVENUE_TARGET", "100"))
CAMPAIGN_DEADLINE = date.fromisoformat(os.environ.get("OUTREACH_DEADLINE", "2026-09-15"))


def _campaign_revenue_window_start():
    """Revenue counts from the campaign's first send, not from an arbitrary date."""
    first = db.session.query(db.func.min(OutreachEmailLog.sent_at)).join(
        OutreachCandidate, OutreachEmailLog.candidate_id == OutreachCandidate.id
    ).filter(
        OutreachCandidate.campaign == CURRENT_CAMPAIGN,
        OutreachEmailLog.status == "success",
    ).scalar()
    if first:
        return first
    # Nothing sent yet: count from today so an unrelated older sale cannot
    # make the campaign look like it has already worked.
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _closing_combinations(remaining):
    """Tier combinations that actually reach the remaining amount.

    Exists because the obvious answer is wrong: two Fast-Track sales are $98
    against a $100 target. Left unsaid, that is discovered after two closes,
    at the point where it is too late to have pitched Reviewed to the
    best-qualified leads instead.
    """
    from app.pricing_tiers import price_for_tier

    if remaining <= 0:
        return []

    fast = price_for_tier("sponsored")   # 49
    reviewed = price_for_tier("reviewed")  # 79

    options = []
    for n_reviewed in range(0, 4):
        for n_fast in range(0, 5):
            if n_reviewed == 0 and n_fast == 0:
                continue
            total = n_reviewed * reviewed + n_fast * fast
            if total >= remaining:
                options.append({
                    "reviewed": n_reviewed,
                    "fast_track": n_fast,
                    "total": round(total, 2),
                    "sales": n_reviewed + n_fast,
                })
    # Fewest sales first, then the smallest total that still clears it — the
    # easiest real path, not the largest number.
    options.sort(key=lambda o: (o["sales"], o["total"]))
    return options[:3]


@outreach_bp.route("/api/v1/admin/outreach/campaign/status", methods=["GET"])
@login_required
def campaign_status():
    """The four numbers the campaign console header shows.

    Sends are counted from OutreachEmailLog rather than from candidate status,
    because the budget is spent by an email leaving the building — a candidate
    that was emailed and later moved to 'replied' still consumed one of the 45.
    """
    if not _is_admin():
        return jsonify({"error": "Admin access required."}), 403

    sent = db.session.query(db.func.count(OutreachEmailLog.id)).join(
        OutreachCandidate, OutreachEmailLog.candidate_id == OutreachCandidate.id
    ).filter(
        OutreachCandidate.campaign == CURRENT_CAMPAIGN,
        OutreachEmailLog.status == "success",
    ).scalar() or 0

    by_pool = dict(
        db.session.query(OutreachCandidate.lead_pool, db.func.count(OutreachCandidate.id))
        .filter(OutreachCandidate.campaign == CURRENT_CAMPAIGN)
        .group_by(OutreachCandidate.lead_pool).all()
    )
    by_status = dict(
        db.session.query(OutreachCandidate.status, db.func.count(OutreachCandidate.id))
        .filter(OutreachCandidate.campaign == CURRENT_CAMPAIGN)
        .group_by(OutreachCandidate.status).all()
    )

    # ── Revenue, and the honest arithmetic behind the target ────────────
    #
    # Counted from verified payments only. payment_status 'verified' is the one
    # value that means the server independently confirmed a real payment (see
    # Submission's own docstring); anything else is a claim.
    #
    # Deliberately counts ALL revenue in the window rather than only sales
    # attributable to an outreach email. Attribution here would be a guess —
    # a founder who got the email, sat on it, and later arrived through search
    # is not distinguishable from one who never read it — and a made-up
    # attribution number is worse than an honest total for deciding whether to
    # keep sending.
    from app.pricing_tiers import price_for_tier, tier_for_pricing_model

    since = _campaign_revenue_window_start()
    paid = Submission.query.filter(
        Submission.payment_status == "verified",
        Submission.submitted_at >= since,
    ).all()
    revenue = sum(price_for_tier(tier_for_pricing_model(p.pricing_model)) for p in paid)

    remaining_needed = max(0.0, CAMPAIGN_REVENUE_TARGET - revenue)
    days_left = (CAMPAIGN_DEADLINE - datetime.now(timezone.utc).date()).days

    return jsonify({
        "campaign": CURRENT_CAMPAIGN,
        "send_budget": CAMPAIGN_SEND_BUDGET,
        "emails_sent": sent,
        "budget_remaining": max(0, CAMPAIGN_SEND_BUDGET - sent),
        "candidates_by_pool": by_pool,
        "candidates_by_status": by_status,
        "replied": by_status.get("replied", 0),
        "awaiting_review": by_status.get("draft_ready", 0),
        # Today's pacing, so the operator can see why an approved queue is
        # not draining: it is not stuck, it is spread on purpose.
        "sent_today": campaign_sends_today(),
        "daily_send_max": CAMPAIGN_DAILY_SEND_MAX,
        "daily_remaining": campaign_daily_remaining(),
        "approved": by_status.get(STATUS_APPROVED, 0),
        "revenue": round(revenue, 2),
        "revenue_target": CAMPAIGN_REVENUE_TARGET,
        "revenue_remaining": round(remaining_needed, 2),
        "sales_count": len(paid),
        "deadline": CAMPAIGN_DEADLINE.isoformat(),
        "days_to_deadline": days_left,
        # The arithmetic that is easy to get wrong: two Fast-Track sales are
        # $98, which misses $100. Surfaced so the console can say what actually
        # closes the gap instead of leaving it to be rediscovered at $98.
        "closes_the_gap": _closing_combinations(remaining_needed),
    })


# ─── PUBLIC: PRE-FILLED SUBMIT LINK ───────────────────────────────────────────
# The one endpoint in this module that is deliberately unauthenticated. The
# outreach email hands a founder a link like /submit?c=<token>; this is what
# that page calls to fill the form in for them. The token is signed (see
# email_utils.make_prefill_token), so it cannot be guessed or incremented to
# walk the candidate table.
#
# It returns ONLY what the founder already knows about their own product —
# name, URL, tagline — and never the email address we found for them, the
# confidence score, the fit score, or anything else operational. A directory
# quietly showing a stranger the contact-discovery record it keeps on them is
# a very different thing from filling in a form.

@outreach_bp.route("/api/v1/outreach/prefill/<token>", methods=["GET"])
def outreach_prefill(token):
    candidate_id = read_prefill_token(token)
    if not candidate_id:
        # Deliberately vague and 404, not 403: a forged token and an expired
        # one are the same non-event to the person holding the link, and
        # distinguishing them would confirm which ids exist.
        return jsonify({"error": "That link is no longer valid."}), 404

    c = db.session.get(OutreachCandidate, candidate_id)
    if not c:
        return jsonify({"error": "That link is no longer valid."}), 404

    # An unsubscribed or bounced candidate keeps a working link on purpose:
    # opting out of email is not the same as declining a listing, and someone
    # who unsubscribed then changed their mind should still be able to submit.
    return jsonify({
        "name": c.product_name or "",
        "url": c.website_url or "",
        # The tagline is what discovery recorded as the product's own
        # one-liner, so it is a far better starting point for "why should this
        # be listed" than an empty box — the founder can edit it.
        "reason": c.tagline or "",
    })


@outreach_bp.route("/api/v1/admin/outreach/cron", methods=["POST"])
@csrf.exempt
def run_cron():
    """Daily automation tick. Accepts ?phase=send | discover | full.

    Why phases exist: this used to do everything in one request, and the
    GitHub Actions caller gave up at 300s. On 2026-09-01 that is exactly what
    happened — the run took 306s, curl aborted, and because the workflow step
    died there, the SMTP verification steps after it were skipped too. One
    slow scrape took down the whole night's automation.

    Sending is fast and bounded (a capped number of emails). Discovery is slow
    and unbounded — it scrapes four external sites on a free-tier instance
    with one worker. Bundling them meant the cheap, revenue-carrying half was
    hostage to the expensive, best-effort half. They are now separately
    callable, so the workflow can give each its own timeout and let discovery
    fail without taking sends with it.

    'full' is retained as the default so any existing caller (or a manual
    curl) behaves exactly as before.
    """
    auth_error = _verify_outreach_secret()
    if auth_error:
        return auth_error

    phase = (request.args.get("phase") or "full").strip().lower()
    if phase not in {"send", "discover", "full"}:
        return jsonify({"error": f"Unknown phase '{phase}'. Use send, discover, or full."}), 400

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — skipping this cron tick."}), 409

    out = {"status": "success", "phase": phase}
    try:
        # Each phase's failure is logged and swallowed so it can't block the
        # others, and so a partial run still reports what it did manage.
        if phase in ("send", "full"):
            try:
                out["followup_emails_sent"] = run_automated_followups()
            except Exception:
                current_app.logger.exception("cron: automated follow-ups failed")
                out["followup_emails_sent"] = 0
                out["followups_error"] = True

            try:
                out["initial_emails_sent"] = run_automated_initial_sends()
            except Exception:
                current_app.logger.exception("cron: automated initial sends failed")
                out["initial_emails_sent"] = 0
                out["initial_sends_error"] = True

        if phase in ("discover", "full"):
            # Before looking for new leads, bring a batch of existing drafts
            # onto the current template. can_send_candidate() refuses to send
            # a stale one, so without this the send phase would quietly go to
            # zero after every copy change — the block has to drain somewhere,
            # and this is the lane that can afford the Gemini calls.
            try:
                out["stale_drafts_refreshed"] = refresh_stale_drafts()
            except Exception:
                current_app.logger.exception("cron: stale draft refresh failed")
                out["stale_drafts_refreshed"] = 0
                out["stale_refresh_error"] = True

            try:
                out["new_candidates_discovered"] = run_discovery_pipeline()
            except Exception:
                current_app.logger.exception("cron: discovery pipeline failed")
                out["new_candidates_discovered"] = 0
                out["discovery_error"] = True

        return jsonify(out)
    except Exception as e:
        current_app.logger.exception("Automated outreach cron job failed")
        return jsonify({"error": str(e)}), 500
    finally:
        _outreach_job_lock.release()

# ─── SMTP VERIFICATION HANDOFF (GitHub Actions) ───────────────────────────────
# Render's free/hobby tier blocks outbound SMTP at the network level (see
# email_utils.py's module docstring), so the actual RCPT-TO mailbox check
# can't run here — it runs from the GitHub Actions runner instead
# (scripts/verify_outreach_emails_smtp.py, triggered by outreach-cron.yml),
# which pulls a batch of candidates to check and reports verdicts back.

@outreach_bp.route("/api/v1/admin/outreach/verification-queue", methods=["GET"])
@csrf.exempt
def get_verification_queue():
    auth_error = _verify_outreach_secret()
    if auth_error:
        return auth_error

    limit = min(int(request.args.get("limit", 60)), 200)
    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status.in_(["draft_ready", "no_email_found"]),
        OutreachCandidate.email.isnot(None),
        OutreachCandidate.verification_result.is_(None),
    ).limit(limit).all()
    return jsonify({"candidates": [{"id": c.id, "email": c.email} for c in candidates]})

@outreach_bp.route("/api/v1/admin/outreach/verification-results", methods=["POST"])
@csrf.exempt
def submit_verification_results():
    auth_error = _verify_outreach_secret()
    if auth_error:
        return auth_error

    data = request.json or {}
    results = data.get("results", [])
    updated = 0
    for r in results:
        verdict = r.get("verification_result")
        if verdict not in VERIFICATION_RESULT_CONFIDENCE:
            continue
        c = OutreachCandidate.query.get(r.get("id"))
        if not c:
            continue

        c.verification_result = verdict
        c.confidence_score = VERIFICATION_RESULT_CONFIDENCE[verdict]
        c.verified_at = datetime.now(timezone.utc)
        # Confirmed invalid/disposable (0%) is below AUTO_REJECT_BELOW_CONFIDENCE
        # same as any other sub-50 result — rejected outright rather than
        # left sitting around; the address is kept (not cleared) so the
        # rejection is auditable instead of silently losing what was found.
        c.status = _status_for_email_confidence(c.confidence_score)
        updated += 1

    db.session.commit()
    return jsonify({"success": True, "updated": updated})

@outreach_bp.route("/api/v1/admin/outreach/stale-drafts", methods=["GET"])
@login_required
def get_stale_drafts():
    """Read-only visibility into candidates whose stored draft predates
    CURRENT_DRAFT_TEMPLATE_VERSION — i.e. still carrying old copy/pricing
    that nothing will regenerate automatically. See get_stale_draft_candidates()
    for exactly what counts as stale and why. Use the existing per-candidate
    PUT /candidates/<id> {"regenerate_draft": true} (or Regenerate All Drafts,
    for the full draft_ready pool) to fix what this reports.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    stale = get_stale_draft_candidates()
    return jsonify({
        "current_template_version": CURRENT_DRAFT_TEMPLATE_VERSION,
        "stale_count": len(stale),
        "candidates": [
            {
                "id": c.id,
                "product_name": c.product_name,
                "email": c.email,
                "status": c.status,
                "draft_template_version": c.draft_template_version,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in stale
        ],
    })

@outreach_bp.route("/api/v1/admin/outreach/job-status", methods=["GET"])
@login_required
def get_outreach_job_status():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_outreach_job_state)

@outreach_bp.route("/api/v1/admin/outreach/diagnostics", methods=["GET"])
@login_required
def run_discovery_diagnostics():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
        
    try:
        log_lines = []
        log_lines.append(f"PH Token configured: {bool(os.environ.get('PRODUCTHUNT_API_TOKEN'))}")
        
        ph_launches = fetch_producthunt_launches()
        log_lines.append(f"Total PH launches fetched: {len(ph_launches)}")

        hn_launches = fetch_shownews_launches()
        log_lines.append(f"Total HN launches fetched: {len(hn_launches)}")

        betalist_launches = fetch_betalist_launches()
        log_lines.append(f"Total BetaList launches fetched: {len(betalist_launches)}")

        uneed_launches = fetch_uneed_launches()
        log_lines.append(f"Total Uneed launches fetched: {len(uneed_launches)}")

        candidates = ph_launches + hn_launches + betalist_launches + uneed_launches
        log_lines.append(f"Total combined candidates: {len(candidates)}")
        
        results = []
        for c in candidates:
            name = c.get("product_name", "")
            url = c.get("website_url", "")
            ph_id = c.get("ph_launch_id", "")
            
            reasons = []
            if is_duplicate_candidate(name, url, ph_id):
                reasons.append("DUPLICATE")
            if not is_deployed_app_url(url):
                reasons.append("NOT_DEPLOYED")
            if not is_student_relevant(name, c.get("tagline", ""), url):
                reasons.append("NOT_RELEVANT")
            if not is_commercial_saas(url):
                reasons.append("NOT_COMMERCIAL")
                
            results.append({
                "name": name,
                "url": url,
                "id": ph_id,
                "reasons": reasons if reasons else ["PASSED_ALL_GATES"]
            })
            
        return jsonify({
            "log": log_lines,
            "results": results
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()})
