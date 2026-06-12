import json
import os
import requests
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, render_template, current_app
from flask_login import login_required, current_user
from app.models import User, CatalogTool
from app.email_utils import send_email, make_unsubscribe_token
from app.tool_cache import get_cached_tools
from app import csrf

admin_email_bp = Blueprint("admin_email", __name__)

def _get_gemini_key():
    keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        keys.extend([k.strip() for k in env_keys_str.split(",") if k.strip()])
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key.strip() not in keys:
        keys.append(single_key.strip())
    return keys[0] if keys else None

@admin_email_bp.route("/api/v1/admin/emails/draft", methods=["POST"])
@csrf.exempt
@login_required
def draft_email():
    if not current_user.is_admin:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json or {}
    prompt_intent = data.get("prompt", "Draft a weekly newsletter.")
    
    api_key = _get_gemini_key()
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500
    
    try:
        tools = get_cached_tools() or []
        tools.sort(key=lambda t: t.get('rating', 0), reverse=True)
        
        # Newest and trending tools to inform the LLM
        context = {
            "top_tools": [
                {"name": t.get('name'), "category": t.get('category'), "tagline": t.get('shortDescription') or t.get('description', '')[:100]}
                for t in tools[:20]
            ]
        }
        
        system_prompt = f"""
You are the AI Compass newsletter editor. The user wants to: {prompt_intent}
Here is the context data of top trending tools: {json.dumps(context)}

You must return ONLY valid JSON with exactly this structure:
{{
  "subject": "Email Subject",
  "opening_text": "A friendly opening paragraph about the latest AI news and updates.",
  "news_items": [
    {{
      "title": "Item Name",
      "badge": "Short Badge (e.g. New, Trending)",
      "description": "2-3 sentences describing it."
    }}
  ]
}}
Do not include markdown codeblocks (```json) in your response, just the raw JSON.
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": system_prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
            }
        }
        
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code != 200:
            return jsonify({"error": f"Gemini API returned {resp.status_code}", "details": resp.text}), 500
            
        resp_data = resp.json()
        candidates = resp_data.get("candidates", [])
        if not candidates:
            return jsonify({"error": "No response from Gemini"}), 500
            
        text = candidates[0].get("content", {}).get("parts", [])[0].get("text", "")
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        result_payload = json.loads(text)
        return jsonify(result_payload)
        
    except Exception as e:
        current_app.logger.exception("Failed to draft email via Gemini")
        return jsonify({"error": str(e)}), 500

@admin_email_bp.route("/api/v1/admin/emails/preview", methods=["POST"])
@csrf.exempt
@login_required
def preview_email():
    if not current_user.is_admin:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json or {}
    subject = data.get("subject", "Preview Email")
    opening_text = data.get("opening_text", "")
    news_items = data.get("news_items", [])
    
    html = render_template(
        "emails/newsletter.html",
        subject=subject,
        user_name="Admin Viewer",
        opening_text=opening_text,
        news_items=news_items,
        cta_text="Browse all tools",
        cta_link="https://ai-compass.in/tools",
        unsubscribe_url="#"
    )
    return jsonify({"html": html})

@admin_email_bp.route("/api/v1/admin/emails/send", methods=["POST"])
@csrf.exempt
@login_required
def send_admin_email():
    if not current_user.is_admin:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json or {}
    subject = data.get("subject")
    opening_text = data.get("opening_text", "")
    news_items = data.get("news_items", [])
    
    if not subject:
        return jsonify({"error": "Subject required"}), 400
        
    users = User.query.filter_by(notifications_enabled=True).all()
    sent = 0
    errors = []
    
    for u in users:
        try:
            if not u.email:
                continue
            unsub_token = make_unsubscribe_token(u.email)
            unsub_url = f"https://ai-compass.in/api/auth/unsubscribe?token={unsub_token}"
            html = render_template(
                "emails/newsletter.html",
                subject=subject,
                user_name=u.display_name or "Student",
                opening_text=opening_text,
                news_items=news_items,
                cta_text="Explore the Directory",
                cta_link="https://ai-compass.in/tools",
                unsubscribe_url=unsub_url
            )
            if send_email(u.email, subject, html):
                sent += 1
            else:
                errors.append(u.email)
        except Exception as e:
            current_app.logger.exception(f"Failed to send email to {u.email}")
            errors.append(u.email)
            
    return jsonify({
        "status": "success",
        "sent_count": sent,
        "failed_count": len(errors),
        "total_attempted": len(users)
    })
