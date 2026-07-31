import os
import re
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

from app import db
from app.models import OutreachCandidate, OutreachEmailLog, CatalogTool
from app.email_utils import send_email

log = logging.getLogger(__name__)

# Fallback email blacklist filter
COMMON_PLACEHOLDERS = {
    "sentry", "wix", "google", "facebook", "twitter", "example",
    "test", "domain", "mycompany", "yourcompany", "placeholder"
}

def get_domain_from_url(url):
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc or parsed.path
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc.split("/")[0]
    except Exception:
        return ""

def is_valid_email(email):
    if not email or "@" not in email:
        return False
    local_part = email.split("@")[0].lower()
    if any(placeholder in local_part for placeholder in COMMON_PLACEHOLDERS):
        return False
    return True

def _name_similarity(a, b):
    # Quick string similarity helper
    from difflib import SequenceMatcher
    return SequenceMatcher(None, str(a).lower().strip(), str(b).lower().strip()).ratio()

def is_duplicate_candidate(product_name, website_url):
    if not product_name:
        return True

    domain = get_domain_from_url(website_url)
    # Ignore generic hosting/repo domains for deduplication
    if domain and domain.lower() in {"github.com", "gitlab.com", "x.com", "twitter.com", "news.ycombinator.com"}:
        domain = ""

    # 1. Check against existing outreach candidates
    if domain:
        existing = OutreachCandidate.query.filter(
            (OutreachCandidate.product_name.ilike(product_name)) |
            (OutreachCandidate.website_url.ilike(f"%{domain}%"))
        ).first()
        if existing:
            return True
    else:
        existing = OutreachCandidate.query.filter(
            OutreachCandidate.product_name.ilike(product_name)
        ).first()
        if existing:
            return True

    # 2. Check against catalog tools (only match if exact domain or high name similarity)
    tools = CatalogTool.query.all()
    for t in tools:
        if _name_similarity(t.name, product_name) > 0.88:
            return True
        if domain and t.affiliate_url:
            t_domain = get_domain_from_url(t.affiliate_url)
            if t_domain and domain == t_domain:
                return True
    return False

# ─── 1. DISCOVERY VIA PRODUCT HUNT & HACKER NEWS ─────────────────────────────
def fetch_producthunt_launches():
    """Hits PH API v2 GraphQL endpoint to get all launches from today's feed."""
    token = os.environ.get("PRODUCTHUNT_API_TOKEN")
    if not token:
        log.warning("PRODUCTHUNT_API_TOKEN is missing. Skipping PH fetch.")
        return []

    url = "https://api.producthunt.com/v2/api/graphql"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Fetch all posts (not just featured: true) to capture 15-30 launches daily
    query = """
    query {
      posts(first: 40) {
        edges {
          node {
            id
            name
            tagline
            website
            makers {
              name
            }
          }
        }
      }
    }
    """

    try:
        r = requests.post(url, json={"query": query}, headers=headers, timeout=15)
        if not r.ok:
            log.error("Product Hunt API returned %s: %s", r.status_code, r.text)
            return []

        data = r.json()
        edges = data.get("data", {}).get("posts", {}).get("edges", [])
        candidates = []

        for edge in edges:
            node = edge.get("node", {})
            ph_id = node.get("id")
            name = node.get("name")
            tagline = node.get("tagline")
            website = node.get("website")
            makers = node.get("makers", [])
            founder = makers[0].get("name") if makers else None

            if not name or not website:
                continue

            candidates.append({
                "ph_launch_id": str(ph_id),
                "product_name": name,
                "tagline": tagline or f"{name} AI Tool",
                "website_url": website,
                "founder_name": founder
            })

        return candidates
    except Exception as e:
        log.exception("Product Hunt fetch failed: %s", e)
        return []

def fetch_shownews_launches():
    """Hits Hacker News Show HN API concurrently to discover newly launched software & AI tools."""
    try:
        from concurrent.futures import ThreadPoolExecutor

        url = "https://hacker-news.firebaseio.com/v0/showstories.json"
        r = requests.get(url, timeout=5)
        if not r.ok:
            return []

        story_ids = r.json()[:25]

        def _fetch_single_story(sid):
            try:
                item_r = requests.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=3)
                if not item_r.ok:
                    return None
                data = item_r.json()
                title = data.get("title", "")
                link = data.get("url", "")
                author = data.get("by", "")

                if not title or not link or not link.startswith("http"):
                    return None

                clean_name = title
                if clean_name.lower().startswith("show hn:"):
                    clean_name = clean_name[8:].strip()

                parts = clean_name.split("–") if "–" in clean_name else clean_name.split("-")
                prod_name = parts[0].strip()
                tagline = parts[1].strip() if len(parts) > 1 else clean_name

                return {
                    "ph_launch_id": f"hn_{sid}",
                    "product_name": prod_name[:80],
                    "tagline": tagline[:160],
                    "website_url": link,
                    "founder_name": author
                }
            except Exception:
                return None

        with ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(_fetch_single_story, story_ids))

        return [item for item in results if item is not None]
    except Exception as e:
        log.warning("Hacker News Show HN fetch failed: %s", e)
        return []

# ─── 2. EMAIL DISCOVERY (SCRAPE + HUNTER.IO) ──────────────────────────────────
def scrape_website_for_email(url):
    """Scrapes homepage and contact subpages looking for mailto links or regex match emails."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        
        def extract_emails_from_html(html):
            if not html:
                return None
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href.lower().startswith("mailto:"):
                    email = href[7:].split("?")[0].strip()
                    if is_valid_email(email):
                        return email
            text = soup.get_text()
            matches = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
            for m in matches:
                if is_valid_email(m):
                    return m
            return None

        # 1. Check homepage first (tight 3s timeout)
        resp = requests.get(url, headers=headers, timeout=3, allow_redirects=True)
        if resp.ok:
            email = extract_emails_from_html(resp.text)
            if email:
                return email

        # 2. Check /contact, /about subpages (tight 2s timeout)
        domain_base = get_domain_from_url(url)
        if domain_base:
            base_url = f"https://{domain_base}"
            for path in ["/contact", "/about"]:
                try:
                    sub_resp = requests.get(base_url + path, headers=headers, timeout=2, allow_redirects=True)
                    if sub_resp.ok:
                        email = extract_emails_from_html(sub_resp.text)
                        if email:
                            return email
                except Exception:
                    pass

        return None
    except Exception as e:
        log.debug("Scraping email failed for %s: %s", url, e)
        return None

def find_email_via_hunter(website_url, founder_name):
    """Uses Hunter.io Email Finder or Domain Search API."""
    api_key = os.environ.get("HUNTER_API_KEY")
    if not api_key:
        return None, 0

    domain = get_domain_from_url(website_url)
    if not domain:
        return None, 0

    # If we have a founder name, use Email Finder (most targeted)
    if founder_name:
        parts = founder_name.strip().split(" ")
        first_name = parts[0]
        last_name = parts[-1] if len(parts) > 1 else ""

        url = "https://api.hunter.io/v2/email-finder"
        params = {
            "domain": domain,
            "first_name": first_name,
            "last_name": last_name,
            "api_key": api_key
        }
        try:
            r = requests.get(url, params=params, timeout=10)
            if r.ok:
                data = r.json().get("data", {})
                email = data.get("email")
                score = data.get("score", 0)
                if email and is_valid_email(email):
                    return email, score
        except Exception as e:
            log.warning("Hunter Email Finder failed: %s", e)

    # Fallback to Domain Search
    url = "https://api.hunter.io/v2/domain-search"
    params = {
        "domain": domain,
        "api_key": api_key
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        if r.ok:
            emails = r.json().get("data", {}).get("emails", [])
            for e in emails:
                email = e.get("value")
                score = e.get("confidence", 0)
                if email and is_valid_email(email):
                    return email, score
    except Exception as e:
        log.warning("Hunter Domain Search failed: %s", e)

    return None, 0

# ─── 3. GEMINI EMAIL DRAFT GENERATION ─────────────────────────────────────────
def _get_gemini_key():
    keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        import re
        keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_keys_str) if k.strip()])
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key.strip() not in keys:
        keys.append(single_key.strip())
    return keys[0] if keys else None

def generate_draft_via_gemini(candidate):
    """Calls Google Gemini API to write personalized sponsored proposal."""
    api_key = _get_gemini_key()
    if not api_key:
        log.warning("GEMINI_API_KEY / GEMINI_API_KEYS is not configured. Setting generic draft.")
        return get_generic_draft(candidate)

    system_prompt = """
You are Medhansh Pratap Singh, Founder of AI Compass (https://ai-compass.in) - a curated directory for students, developers, and young creators.
Your task is to write a highly targeted, warm outreach email to an AI startup proposing a sponsored/featured listing.

You write in one of two tones:
1. 'peer' (default): casual, direct, congratulatory, referencing their launch, structured value prop bullets, and soft CTA.
2. 'formal': polite, structured, context-heavy, explicit about pricing ($75/month) and metrics, asking for a chat/reply.

Here are a few-shot examples of your actual sent emails:

[EXAMPLE 1: Peer Tone - launch pitch]
Subject: Featured on AI Compass for your launch today? 🚀
Hey Airtop Team,
Huge congrats on launching "Mark" on Product Hunt today! (Already tracking in the Top 10!). Love the concept of vibe coding applied to marketing automations.
I run AI Compass (https://ai-compass.in), a curated directory where students, developers, and young creators find AI tools for productivity, coding, and business.
Mark is a fantastic resource for business and marketing students learning outbound, GTM strategies, and SEO automation.
To help with your launch momentum, we can feature Mark on our platform. You can submit to our free review queue, or use our Priority Curation tier ($49.99) to get:
- Guaranteed review & listing within 24 hours (perfect for capturing post-launch traffic).
- A permanent, high-authority backlink to airtop.ai.
- A feature in our weekly student AI digest.
If you'd like to get featured, you can submit the launch details here: https://ai-compass.in/submit
Congrats again on the launch and good luck hitting the top spots today!

[EXAMPLE 2: Formal Tone - placement offer]
Subject: Featured placement on AI Compass — student lecture notes audience
Hi Jijo,
I run AI Compass (ai-compass.in) — a curated directory of AI tools for students, covering writing, research, coding, and study. We list 447 tools and are ranking on Google for searches like "best ai tools for students" and "chatgpt alternatives for students" with around 800 monthly visitors growing fast month over month.
I came across Voicenotes while building out our study and note-taking category and immediately thought it was one of the strongest fits we've seen — you've already built out a dedicated lecture note-taker use case, which is exactly the kind of thing our audience searches for.
We're offering a small number of sponsored featured placements. For Voicenotes this would mean:
- A "Featured" badge and prominent placement on relevant pages (study tools, note-taking, and research pages)
- Direct link from pages ranking for student academic queries
- Placement alongside tools your users are already comparing you against
We'd start at $75/month — easy to test, no long commitment, and I'm happy to share full traffic and GSC data before you decide.
Would love to hear your thoughts — or if a quick chat works better, I'm flexible.

INSTRUCTIONS:
- Tailor the email specifically to the target product name, tagline/description, website, and founder name.
- Use the inferred tone specified in the prompt.
- Always output valid JSON with exactly two fields: "subject" and "body".
- Do NOT use emojis in the subject line (e.g. no 🚀, no 🔥) to ensure the email lands in the Primary inbox.
- The "body" must be formatted as clean HTML with a modern, readable font stack (using <p>, <br>, <b>, <ul>, <li>, and <a> tags).
- Make sure the body ends with a clear link to https://ai-compass.in/submit.
- Always sign the email with this exact HTML signature:
<div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="font-weight: 600; color: #0f172a; font-size: 14px;">Medhansh Pratap Singh</div>
  <div style="color: #64748b; font-size: 12px; margin-top: 2px;">Founder, <a href="https://ai-compass.in" style="color: #059669; text-decoration: none; font-weight: 500;">AI Compass</a></div>
  <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">medhansh.singh@ai-compass.in • <a href="https://ai-compass.in" style="color: #64748b; text-decoration: underline;">ai-compass.in</a></div>
</div>

Return ONLY the raw JSON block. Do not wrap in ```json or markdown codeblocks, just return the raw JSON object.
"""

    prompt = f"""
{system_prompt}

Write an outreach email for this candidate:
- Product Name: {candidate.product_name}
- Tagline: {candidate.tagline}
- Website: {candidate.website_url}
- Founder/Maker: {candidate.founder_name or 'Team'}
- Tone to use: {candidate.tone}
"""

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
            }
        }

        r = requests.post(url, json=payload, timeout=20)
        if not r.ok:
            log.error("Gemini API returned %s: %s", r.status_code, r.text)
            return get_generic_draft(candidate)

        resp_data = r.json()
        candidates_list = resp_data.get("candidates", [])
        if not candidates_list:
            log.error("No candidates in Gemini response: %s", resp_data)
            return get_generic_draft(candidate)

        text = candidates_list[0].get("content", {}).get("parts", [])[0].get("text", "").strip()

        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()

        import json
        result = json.loads(text)
        return result.get("subject"), result.get("body")
    except Exception as e:
        log.exception("Gemini draft generation failed: %s", e)
        return get_generic_draft(candidate)


def get_generic_draft(candidate):
    """A fallback template if Gemini API fails or is unconfigured."""
    subject = f"Featured placement on AI Compass — {candidate.product_name} launch"
    body = f"""<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
<p>Hey {candidate.founder_name or 'Team'},</p>
<p>Congrats on the launch of <b>{candidate.product_name}</b>! We love what you are building.</p>
<p>I run <a href="https://ai-compass.in" style="color: #059669; font-weight: 500;">AI Compass</a>, a curated directory where students and developers discover AI tools. We think {candidate.product_name} would be a fantastic resource for our audience.</p>
<div style="border-left: 3px solid #10b981; padding-left: 14px; margin: 16px 0; background-color: #f8fafc; padding: 12px 14px; border-radius: 0 8px 8px 0;">
  <p style="margin: 0; font-size: 13px; color: #475569;">To help with your launch momentum, we can feature you on our platform. You can submit your tool to our fast-track queue here: <a href="https://ai-compass.in/submit" style="color: #059669; font-weight: 600;">ai-compass.in/submit</a>.</p>
</div>
<p>Congrats again on the launch!</p>
<div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="font-weight: 600; color: #0f172a; font-size: 14px;">Medhansh Pratap Singh</div>
  <div style="color: #64748b; font-size: 12px; margin-top: 2px;">Founder, <a href="https://ai-compass.in" style="color: #059669; text-decoration: none; font-weight: 500;">AI Compass</a></div>
  <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">medhansh.singh@ai-compass.in • <a href="https://ai-compass.in" style="color: #64748b; text-decoration: underline;">ai-compass.in</a></div>
</div>
</div>"""
    return subject, body

def infer_tone(tagline, description):
    """Infers tone based on keywords in company info. Defaults to 'peer'."""
    text = f"{tagline or ''} {description or ''}".lower()
    formal_signals = [
        "funding", "funded", "raised", "seed", "series", "enterprise", "backed", "investors",
        "corporate", "b2b", "compliance", "security", "infrastructure", "yc ", "y combinator",
        "venture", "capital"
    ]
    if any(sig in text for sig in formal_signals):
        return "formal"
    return "peer"


# ─── 4. RUN PIPELINE JOBS ──────────────────────────────────────────────────
def run_discovery_pipeline():
    """Fetches today's launches from PH & Hacker News, resolves emails, and drafts proposal content."""
    ph_launches = fetch_producthunt_launches()
    hn_launches = fetch_shownews_launches()
    launches = ph_launches + hn_launches
    new_candidates_count = 0

    for l in launches:
        if is_duplicate_candidate(l["product_name"], l["website_url"]):
            continue

        c = OutreachCandidate()
        c.ph_launch_id = l["ph_launch_id"]
        c.product_name = l["product_name"]
        c.tagline = l["tagline"]
        c.website_url = l["website_url"]
        c.founder_name = l["founder_name"]
        c.tone = infer_tone(l["tagline"], "")

        email = scrape_website_for_email(l["website_url"])
        source = "scraper"
        score = 100

        if not email:
            email, score = find_email_via_hunter(l["website_url"], l["founder_name"])
            source = "hunter"

        if email:
            c.email = email
            c.email_source = source
            c.confidence_score = score
            c.status = "draft_ready"
        else:
            c.email_source = "none"
            c.status = "no_email_found"

        subject, body = generate_draft_via_gemini(c)
        c.draft_subject = subject
        c.draft_body = body

        db.session.add(c)
        new_candidates_count += 1

    if new_candidates_count > 0:
        db.session.commit()
        log.info("Outreach discovery pipeline created %s new candidates.", new_candidates_count)

    return new_candidates_count

# ─── 5. AUTOMATED FOLLOW-UPS ────────────────────────────────────────────────
def run_automated_followups():
    """Sends simple thread-replies to candidates emailed 5+ days ago without reply."""
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)
    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status == "sent",
        OutreachCandidate.last_status_change_at <= five_days_ago
    ).all()

    sent_count = 0
    for c in candidates:
        if not c.email or not c.draft_subject:
            continue

        followup_subject = f"Re: {c.draft_subject}"
        followup_body = f"""<p>Hi {c.founder_name.split(' ')[0] if c.founder_name else 'there'},</p>
<p>Just wanted to quickly follow up on my previous message. Are you interested in featuring {c.product_name} on AI Compass to capture traffic from students and developers?</p>
<p>Let me know if you have any questions!</p>
<br>
Best,<br>
Medhansh"""

        success = False
        err_msg = None
        try:
            text_alt = f"Hi,\n\nJust wanted to quickly follow up on my previous message. Are you interested in featuring {c.product_name} on AI Compass?\n\nBest, Medhansh"
            success = send_email(to=c.email, subject=followup_subject, html=followup_body, text=text_alt)
        except Exception as exc:
            err_msg = str(exc)

        log_entry = OutreachEmailLog(
            candidate_id=c.id,
            email=c.email,
            subject=followup_subject,
            body=followup_body,
            status="success" if success else "failure",
            error_message=err_msg
        )
        db.session.add(log_entry)

        if success:
            c.status = "followed_up"
            c.last_status_change_at = datetime.now(timezone.utc)
            sent_count += 1

    if sent_count > 0:
        db.session.commit()
        log.info("Sent %s automated follow-up emails.", sent_count)

    return sent_count
