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

REJECTED_HOSTS = {
    "github.com",
    "gitlab.com",
    "codeberg.org",
    "bitbucket.org",
    "sourceforge.net",
    "raw.githubusercontent.com",
    "gist.github.com",
    "news.ycombinator.com",
    "ycombinator.com",
    "reddit.com",
    "twitter.com",
    "x.com",
    "medium.com",
    "youtube.com",
    "vimeo.com"
}

def is_deployed_app_url(url: str) -> bool:
    """Returns True ONLY if the URL points to a deployed web application domain, NOT a code repo or social link."""
    if not url or not url.startswith(("http://", "https://")):
        return False
    domain = get_domain_from_url(url).lower()
    if not domain:
        return False
    if domain in REJECTED_HOSTS or any(domain.endswith("." + host) for host in REJECTED_HOSTS):
        return False
    return True

STUDENT_RELEVANT_KEYWORDS = {
    "ai", "write", "writing", "code", "coding", "dev", "developer", "study", "research",
    "pdf", "notes", "prompt", "summarize", "flashcard", "essay", "grammar", "design",
    "video", "audio", "quiz", "math", "calculator", "resume", "portfolio", "productivity",
    "agent", "llm", "chat", "copilot", "terminal", "vscode", "extension", "notion",
    "presentation", "slides", "tutor", "homework", "transcribe", "seo", "analytics",
    "marketing", "workflow", "doc", "data", "bot", "tool", "app", "model", "edit"
}

COMMERCIAL_PRICING_SIGNALS = [
    "pricing", "plans", "pro", "enterprise", "subscribe", "upgrade", "billing",
    "tier", "$", "eur", "lemonsqueezy", "stripe", "paddle", "free trial", "per month",
    "/mo", "monthly", "annually", "checkout", "premium"
]

def is_student_relevant(product_name, tagline="", website_url=""):
    """Checks if the SaaS product is relevant to students, developers, researchers, or creators."""
    text = f"{product_name} {tagline} {website_url}".lower()
    return any(kw in text for kw in STUDENT_RELEVANT_KEYWORDS)

def is_commercial_saas(website_url):
    """Scrapes homepage HTML to verify the SaaS product has a commercial pricing model (has budget for sponsorship)."""
    if not is_deployed_app_url(website_url):
        return False
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AICompassBot/1.0"}
        resp = requests.get(website_url, headers=headers, timeout=2.5, allow_redirects=True)
        if not resp.ok or not resp.text:
            return True
        
        text_lower = resp.text.lower()
        has_pricing_signal = any(sig in text_lower for sig in COMMERCIAL_PRICING_SIGNALS)
        return has_pricing_signal
    except Exception:
        return True

def is_valid_email(email):
    if not email or "@" not in email:
        return False
    email = email.strip()
    if email.startswith("@"):
        return False
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(pattern, email):
        return False
    parts = email.split("@")
    local_part, domain_part = parts[0].lower(), parts[1].lower()
    if any(placeholder in local_part for placeholder in COMMON_PLACEHOLDERS):
        return False
    if domain_part in {"github.com", "example.com", "domain.com", "test.com", "email.com", "sample.com", "sentry.io", "wixpress.com"}:
        return False
    if local_part in {"copyright", "abuse", "dmca", "security", "privacy", "postmaster"}:
        return False
    return True

def _name_similarity(a, b):
    # Quick string similarity helper
    from difflib import SequenceMatcher
    return SequenceMatcher(None, str(a).lower().strip(), str(b).lower().strip()).ratio()

def is_duplicate_candidate(product_name, website_url, ph_launch_id=None):
    if not product_name:
        return True

    if ph_launch_id:
        existing_launch = OutreachCandidate.query.filter_by(ph_launch_id=str(ph_launch_id)).first()
        if existing_launch:
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

            if not name or not website or not is_deployed_app_url(website):
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
    """Hits Algolia & Hacker News APIs to discover dozens of newly launched deployed software & AI tools."""
    candidates = []
    seen_ids = set()

    # 1. Fetch from Algolia HN Search API (Returns 100 recent Show HN posts instantly in 1 request)
    try:
        algolia_url = "https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=100"
        alg_r = requests.get(algolia_url, timeout=5)
        if alg_r.ok:
            hits = alg_r.json().get("hits", [])
            for h in hits:
                sid = h.get("objectID")
                title = h.get("title", "")
                link = h.get("url", "")
                author = h.get("author", "")

                if not sid or sid in seen_ids or not title or not link or not is_deployed_app_url(link):
                    continue

                seen_ids.add(sid)
                clean_name = title
                if clean_name.lower().startswith("show hn:"):
                    clean_name = clean_name[8:].strip()

                parts = clean_name.split("–") if "–" in clean_name else clean_name.split("-")
                prod_name = parts[0].strip()
                tagline = parts[1].strip() if len(parts) > 1 else clean_name

                candidates.append({
                    "ph_launch_id": f"hn_{sid}",
                    "product_name": prod_name[:80],
                    "tagline": tagline[:160],
                    "website_url": link,
                    "founder_name": author
                })
    except Exception as e:
        log.warning("Algolia Show HN fetch error: %s", e)

    # 2. Backup: Fetch from Firebase Show Stories API
    try:
        from concurrent.futures import ThreadPoolExecutor

        fb_url = "https://hacker-news.firebaseio.com/v0/showstories.json"
        r = requests.get(fb_url, timeout=5)
        if r.ok:
            story_ids = [sid for sid in r.json()[:50] if str(sid) not in seen_ids]

            def _fetch_single_story(sid):
                try:
                    item_r = requests.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=3)
                    if not item_r.ok:
                        return None
                    data = item_r.json()
                    title = data.get("title", "")
                    link = data.get("url", "")
                    author = data.get("by", "")

                    if not title or not link or not is_deployed_app_url(link):
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

            for item in results:
                if item is not None and item["ph_launch_id"].replace("hn_", "") not in seen_ids:
                    candidates.append(item)
    except Exception as e:
        log.warning("Firebase Show HN fetch error: %s", e)

    return candidates

# ─── 2. EMAIL DISCOVERY (SCRAPE + GITHUB + RDAP + HUNTER.IO) ─────────────────
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
            
            # Check meta tags
            for meta in soup.find_all("meta"):
                content = meta.get("content", "")
                if "@" in content:
                    for part in content.split():
                        if is_valid_email(part):
                            return part

            text = soup.get_text()
            matches = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
            for m in matches:
                if is_valid_email(m):
                    return m

            # Obfuscated emails check (e.g. contact [at] domain.com)
            obf_matches = re.findall(r"([a-zA-Z0-9._%+-]+)\s*\[?\s*(?:at|AT|@)\s*\]?\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", text)
            for prefix, domain in obf_matches:
                cand = f"{prefix}@{domain}"
                if is_valid_email(cand):
                    return cand

            return None

        # 1. Check homepage first (tight 1.5s timeout)
        resp = requests.get(url, headers=headers, timeout=1.5, allow_redirects=True)
        if resp.ok:
            email = extract_emails_from_html(resp.text)
            if email:
                return email, "web_scraper"

        # 2. Check primary subpages (1.5s timeout each)
        domain_base = get_domain_from_url(url)
        if domain_base:
            base_url = f"https://{domain_base}"
            for path in ["/contact", "/about", "/privacy"]:
                try:
                    sub_resp = requests.get(base_url + path, headers=headers, timeout=1.5, allow_redirects=True)
                    if sub_resp.ok:
                        email = extract_emails_from_html(sub_resp.text)
                        if email:
                            return email, f"scraper_{path.replace('/', '')}"
                except Exception:
                    pass

        return None, ""
    except Exception as e:
        log.debug("Scraping email failed for %s: %s", url, e)
        return None, ""

def find_email_via_github(website_url, founder_name=""):
    """Extracts public author email from GitHub profile or commit history."""
    headers = {"User-Agent": "AICompassBot/1.0", "Accept": "application/vnd.github.v3+json"}
    
    gh_match = re.search(r"github\.com/([a-zA-Z0-9\-_]+)(?:/([a-zA-Z0-9\-_]+))?", website_url or "")
    owner = gh_match.group(1) if gh_match else None
    repo = gh_match.group(2) if gh_match else None

    if not owner and founder_name and re.match(r"^[a-zA-Z0-9\-_]+$", founder_name.strip()):
        owner = founder_name.strip()

    if owner:
        # Check user profile
        try:
            r = requests.get(f"https://api.github.com/users/{owner}", headers=headers, timeout=3)
            if r.ok:
                data = r.json()
                email = data.get("email")
                if email and is_valid_email(email):
                    return email, "github_profile"
        except Exception:
            pass
            
        # Check recent commits
        if repo:
            try:
                r = requests.get(f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=5", headers=headers, timeout=4)
                if r.ok:
                    commits = r.json()
                    for c in commits:
                        commit_data = c.get("commit", {})
                        author = commit_data.get("author", {})
                        email = author.get("email")
                        if email and is_valid_email(email) and not email.endswith("users.noreply.github.com"):
                            return email, "github_commit"
            except Exception:
                pass

    return None, ""

def find_email_via_rdap(website_url):
    """Checks RDAP domain registration database for admin contact email."""
    domain = get_domain_from_url(website_url)
    if not domain or "." not in domain or domain.endswith((".app", ".dev", ".io")):
        return None, ""
    try:
        r = requests.get(f"https://rdap.org/domain/{domain}", timeout=3)
        if r.ok:
            matches = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", r.text)
            for m in matches:
                if is_valid_email(m) and not any(x in m for x in ["whois", "privacy", "registrar", "abuse", "proxy"]):
                    return m, "domain_rdap"
    except Exception:
        pass
    return None, ""

def find_email_via_hunter(website_url, founder_name):
    """Uses Hunter.io Email Finder or Domain Search API."""
    api_key = os.environ.get("HUNTER_API_KEY")
    if not api_key:
        return None, 0

    domain = get_domain_from_url(website_url)
    if not domain:
        return None, 0

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

def enrich_candidate_email(website_url, founder_name=""):
    """Comprehensive discovery pipeline combining Scraper, GitHub, RDAP, and Hunter.io."""
    # 1. Scrape homepage and subpages
    email, source = scrape_website_for_email(website_url)
    if email:
        return email, source or "web_scraper", 90

    # 2. GitHub lookup
    email, source = find_email_via_github(website_url, founder_name)
    if email:
        return email, source or "github_api", 95

    # 3. Domain RDAP lookup
    email, source = find_email_via_rdap(website_url)
    if email:
        return email, source or "domain_rdap", 80

    # 4. Hunter.io lookup
    email, score = find_email_via_hunter(website_url, founder_name)
    if email:
        return email, "hunter_io", score

    return None, "none", 0

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
You are Medhansh Pratap Singh, Founder of AI Compass (https://ai-compass.in) - a curated directory for tech-savvy students, developers, and creators.
Your task is to write a highly targeted, compelling outreach email to a commercial AI SaaS product proposing Fast-Track Sponsored Curation.

Key AI Compass Metrics to include in the email pitch:
- 2,000+ Monthly Active Visitors
- 4,000+ Students & Developers Powered
- 100K+ Google Search Impressions
- Top 15 Google Search Rankings for student AI queries

Pricing & Perks:
- Fast-Track Sponsored Curation: $49.99 one-time
- Guaranteed 24-Hour Review & Listing
- Permanent High-Authority Dofollow SEO Backlink
- Spotlight Inclusion in Weekly Student AI Digest

CRITICAL RULES:
- Do NOT use emojis anywhere in the subject line or email body. Keep it clean and professional.
- Tailor the email specifically to the target product name, tagline/description, website, and founder name.
- Highlight how their SaaS tool specifically benefits students, developers, or creators.
- Always output valid JSON with exactly two fields: "subject" and "body".
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
        if not is_deployed_app_url(l["website_url"]):
            continue
        if not is_student_relevant(l["product_name"], l["tagline"], l["website_url"]):
            continue
        if not is_commercial_saas(l["website_url"]):
            continue
        if is_duplicate_candidate(l["product_name"], l["website_url"], l.get("ph_launch_id")):
            continue

        c = OutreachCandidate()
        c.ph_launch_id = l["ph_launch_id"]
        c.product_name = l["product_name"]
        c.tagline = l["tagline"]
        c.website_url = l["website_url"]
        c.founder_name = l["founder_name"]
        c.tone = infer_tone(l["tagline"], "")

        email, source, score = enrich_candidate_email(l["website_url"], l["founder_name"])

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

def re_enrich_missing_candidate_emails():
    """Re-scans all candidates currently marked 'no_email_found' using the multi-strategy pipeline concurrently."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    candidates = OutreachCandidate.query.filter_by(status="no_email_found").all()
    if not candidates:
        return 0

    log.info("Starting concurrent re-enrichment for %s candidates...", len(candidates))

    def _process_candidate(cand_data):
        cid, url, founder = cand_data
        email, source, score = enrich_candidate_email(url, founder)
        return cid, email, source, score

    cand_tuples = [(c.id, c.website_url, c.founder_name) for c in candidates]
    results = []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_process_candidate, item) for item in cand_tuples]
        for f in as_completed(futures):
            try:
                results.append(f.result())
            except Exception as e:
                log.warning("Candidate enrichment task error: %s", e)

    cand_dict = {c.id: c for c in candidates}
    enriched_count = 0

    for cid, email, source, score in results:
        if email and cid in cand_dict:
            c = cand_dict[cid]
            c.email = email
            c.email_source = source
            c.confidence_score = score
            c.status = "draft_ready"
            
            subject, body = generate_draft_via_gemini(c)
            c.draft_subject = subject
            c.draft_body = body
            c.updated_at = datetime.now(timezone.utc)
            enriched_count += 1

    if enriched_count > 0:
        db.session.commit()
        log.info("Re-enrichment pipeline updated %s candidates with new emails.", enriched_count)

    return enriched_count

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
