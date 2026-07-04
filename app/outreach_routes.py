import os
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

from app import db, csrf
from app.models import OutreachCandidate, OutreachEmailLog
from app.email_utils import send_email
from app.outreach import (
    run_discovery_pipeline,
    run_automated_followups,
    generate_draft_via_gemini,
    is_valid_email
)

outreach_bp = Blueprint("outreach", __name__)

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
        
    success = False
    err_msg = None
    try:
        # Send html email with fallback text description
        success = send_email(to=c.email, subject=c.draft_subject, html=c.draft_body)
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
        return jsonify({"success": False, "error": err_msg or "Failed to send email via Resend"}), 500

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
    
    for c in candidates:
        if not c.email or not c.draft_subject or not c.draft_body or c.status == "sent":
            failed += 1
            continue
            
        success = False
        err_msg = None
        try:
            success = send_email(to=c.email, subject=c.draft_subject, html=c.draft_body)
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
        else:
            failed += 1
            
    db.session.commit()
    return jsonify({"success": True, "sent": sent, "failed": failed})

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
        
    try:
        new_count = run_discovery_pipeline()
        return jsonify({"success": True, "new_candidates_count": new_count})
    except Exception as e:
        current_app.logger.exception("Failed to run manual discovery pipeline")
        return jsonify({"error": str(e)}), 500

# ─── AUTOMATED CRON ENDPOINT ──────────────────────────────────────────────────

@outreach_bp.route("/api/v1/admin/outreach/cron", methods=["POST"])
@csrf.exempt
def run_cron():
    """Endpoint for Render Cron or query token check."""
    secret = os.environ.get("OUTREACH_SECRET")
    
    # Check authorization header
    auth_header = request.headers.get("X-Outreach-Secret")
    token_arg = request.args.get("token")
    
    if not secret:
        return jsonify({"error": "OUTREACH_SECRET env var is not set on the server"}), 500
        
    if auth_header != secret and token_arg != secret:
        return jsonify({"error": "Unauthorized"}), 401
        
    try:
        # Run daily job
        new_candidates = run_discovery_pipeline()
        sent_followups = run_automated_followups()
        
        return jsonify({
            "status": "success",
            "new_candidates_discovered": new_candidates,
            "followup_emails_sent": sent_followups
        })
    except Exception as e:
        current_app.logger.exception("Automated outreach cron job failed")
        return jsonify({"error": str(e)}), 500
