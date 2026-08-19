import os
import time
import threading
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

from app import db, csrf
from app.models import OutreachCandidate, OutreachEmailLog
from app.email_utils import send_email, send_email_with_details
from app.outreach import (
    run_discovery_pipeline,
    re_enrich_missing_candidate_emails,
    run_automated_followups,
    run_automated_initial_sends,
    regenerate_all_drafts,
    trigger_github_verification_workflow,
    generate_draft_via_gemini,
    is_valid_email,
    fetch_producthunt_launches,
    fetch_shownews_launches,
    fetch_betalist_launches,
    fetch_uneed_launches,
    is_duplicate_candidate,
    is_deployed_app_url,
    is_student_relevant,
    is_commercial_saas,
    sends_remaining_today,
    DAILY_SEND_CAP,
    CONFIDENCE_SEND_THRESHOLD,
    VERIFICATION_RESULT_CONFIDENCE,
    _status_for_email_confidence,
    OUTREACH_REPLY_TO,
    _outreach_send_headers,
    run_catalog_traffic_campaign,
    get_catalog_click_counts,
    CATALOG_CAMPAIGN_MIN_CLICKS,
    CATALOG_CAMPAIGN_MAX_PER_RUN,
    CATALOG_CANDIDATE_ID_PREFIX,
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
    
    candidates = query.order_by(OutreachCandidate.created_at.desc()).all()
    
    # Return formatted list
    res = []
    for c in candidates:
        res.append({
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
            "last_status_change_at": c.last_status_change_at.isoformat() if c.last_status_change_at else None
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
    if "product_name" in data: c.product_name = data["product_name"]
    if "website_url" in data: c.website_url = data["website_url"]
    if "founder_name" in data: c.founder_name = data["founder_name"]
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
    if "tone" in data: c.tone = data["tone"]
    if "tagline" in data: c.tagline = data["tagline"]
    if "draft_subject" in data: c.draft_subject = data["draft_subject"]
    if "draft_body" in data: c.draft_body = data["draft_body"]
    
    # Regenerate draft option
    if data.get("regenerate_draft"):
        subject, body = generate_draft_via_gemini(c)
        c.draft_subject = subject
        c.draft_body = body
        
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
    if not c.email:
        return jsonify({"error": "Email is missing for candidate"}), 400
    if not c.draft_subject or not c.draft_body:
        return jsonify({"error": "Draft subject and body are required to send"}), 400
    if (c.confidence_score or 0) < CONFIDENCE_SEND_THRESHOLD:
        return jsonify({"error": f"Email confidence ({c.confidence_score or 0}%) is below the {CONFIDENCE_SEND_THRESHOLD}% send threshold. Re-verify this address (Re-Enrich) or manually confirm it first."}), 400
    if not c.verification_result:
        # A high confidence_score alone isn't enough — enrich_candidate_email()
        # returns verification_result=None whenever that score is a heuristic
        # guess (source-quality) rather than an actual mailbox check, which
        # happens for every candidate whenever NEVERBOUNCE_APIKEY isn't set.
        # Sending on a heuristic score with no real verification behind it is
        # exactly what drives up bounce rate and tanks sender reputation.
        return jsonify({"error": "This address hasn't been mailbox-verified yet (only a heuristic confidence score). Re-Enrich to run the free SMTP verifier, or manually confirm it first."}), 400
    if sends_remaining_today() <= 0:
        return jsonify({"error": f"Daily send cap ({DAILY_SEND_CAP}) reached. Try again after 9 AM IST, or raise OUTREACH_DAILY_SEND_CAP."}), 429

    success = False
    err_msg = None
    try:
        # Send html email with fallback text description
        success, err_msg = send_email_with_details(
            to=c.email, subject=c.draft_subject, html=c.draft_body,
            reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
        )
    except Exception as exc:
        err_msg = str(exc)

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
    skipped_low_confidence = 0

    for c in candidates:
        if not c.email or not c.draft_subject or not c.draft_body or c.status == "sent":
            failed += 1
            continue
        if (c.confidence_score or 0) < CONFIDENCE_SEND_THRESHOLD or not c.verification_result:
            # See send_candidate_email for why verification_result is required
            # alongside the score — a heuristic-only confidence (no real
            # mailbox check) is exactly what's been driving bounce rate up.
            skipped_low_confidence += 1
            continue
        if remaining <= 0:
            capped += 1
            continue

        success = False
        err_msg = None
        try:
            success, err_msg = send_email_with_details(
                to=c.email, subject=c.draft_subject, html=c.draft_body,
                reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
            )
        except Exception as exc:
            err_msg = str(exc)

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
        messages.append(f"Daily send cap ({DAILY_SEND_CAP}) reached — {capped} candidate(s) deferred to tomorrow.")
    if skipped_low_confidence:
        resp["skipped_low_confidence"] = skipped_low_confidence
        messages.append(f"{skipped_low_confidence} candidate(s) skipped — below the {CONFIDENCE_SEND_THRESHOLD}% confidence send threshold.")
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
        
    logs = OutreachEmailLog.query.order_by(OutreachEmailLog.sent_at.desc()).all()
    res = []
    for l in logs:
        # Find candidate details safely
        candidate = OutreachCandidate.query.get(l.candidate_id)
        res.append({
            "id": l.id,
            "candidate_id": l.candidate_id,
            "product_name": candidate.product_name if candidate else "Deleted Candidate",
            "email": l.email,
            "subject": l.subject,
            "body": l.body,
            "status": l.status,
            "error_message": l.error_message,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None
        })
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
                        _job_finish(result={"drafts_regenerated": count})
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

@outreach_bp.route("/api/v1/admin/outreach/cron", methods=["POST"])
@csrf.exempt
def run_cron():
    """Endpoint for Render Cron or query token check."""
    auth_error = _verify_outreach_secret()
    if auth_error:
        return auth_error

    if not _outreach_job_lock.acquire(blocking=False):
        return jsonify({"error": "Another discovery/re-enrich job is already running — skipping this cron tick."}), 409

    try:
        # Run daily job
        new_candidates = run_discovery_pipeline()
        # Drafts generated above (and any left over from a prior run) go out
        # automatically now — see run_automated_initial_sends() for the send
        # gate this still enforces (confidence threshold, real mailbox
        # verification, shared DAILY_SEND_CAP).
        initial_sent = run_automated_initial_sends()
        sent_followups = run_automated_followups()

        return jsonify({
            "status": "success",
            "new_candidates_discovered": new_candidates,
            "initial_emails_sent": initial_sent,
            "followup_emails_sent": sent_followups
        })
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
