import os
import re
import logging
import threading
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

from app import db
from app.models import OutreachCandidate, OutreachEmailLog, CatalogTool
from app.email_utils import send_email, make_unsubscribe_token

log = logging.getLogger(__name__)

# The AI-generated and generic drafts are signed "Medhansh Pratap Singh" and
# read as a personal 1:1 note, but the actual transport `From` defaults to
# no-reply@ (see email_utils.py) — without an explicit Reply-To, a recipient
# who hits Reply sends into a mailbox nobody reads. That's indistinguishable
# from "no one responded." Override with OUTREACH_REPLY_TO if the monitored
# inbox is ever something other than the signature address.
OUTREACH_REPLY_TO = os.environ.get("OUTREACH_REPLY_TO", "medhansh.singh@ai-compass.in")


def _outreach_send_headers(email: str) -> dict[str, str]:
    """List-Unsubscribe headers for a cold outreach send.

    Gmail/Yahoo's 2024 bulk-sender rules expect this on commercial mail, and
    it's also a straightforward trust signal — a cold email that offers a
    real one-click opt-out reads less like spam, which helps it clear spam
    filters and get read (and therefore replied to) in the first place.
    """
    token = make_unsubscribe_token(email)
    url = f"https://ai-compass.in/unsubscribe?token={token}"
    return {
        "List-Unsubscribe": f"<{url}>, <mailto:{OUTREACH_REPLY_TO}?subject=unsubscribe>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


def _append_unsubscribe_footer(html_body: str, email: str | None) -> str:
    if not email:
        return html_body
    token = make_unsubscribe_token(email)
    url = f"https://ai-compass.in/unsubscribe?token={token}"
    footer = (
        '<p style="margin-top:16px;font-size:11px;color:#94a3b8;">'
        f'Don\'t want emails like this? <a href="{url}" style="color:#94a3b8;">Unsubscribe</a>.'
        '</p>'
    )
    return f"{html_body}\n{footer}"

# Shared shell for every outreach email (initial pitch, traffic-report,
# and both follow-up stages) so a recipient sees one consistent visual
# identity across every touch instead of a polished first email followed
# by a bare-looking bump. Content producers (Gemini prompts + generic
# fallbacks) only need to write semantic paragraphs/bullets/links — the
# wrapper and signature are applied here in one place, so the visual
# quality bar doesn't depend on an LLM reproducing styling correctly
# every single call.
_OUTREACH_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

def _outreach_signature_html() -> str:
    return (
        f'<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:{_OUTREACH_FONT_STACK};">'
        '<div style="font-weight:700;color:#0f172a;font-size:14px;">Medhansh Pratap Singh</div>'
        '<div style="color:#64748b;font-size:12.5px;margin-top:3px;">Founder, '
        '<a href="https://ai-compass.in" style="color:#059669;text-decoration:none;font-weight:600;">🧭 AI Compass</a></div>'
        '<div style="color:#94a3b8;font-size:11px;margin-top:4px;">medhansh.singh@ai-compass.in &middot; '
        '<a href="https://ai-compass.in" style="color:#94a3b8;text-decoration:underline;">ai-compass.in</a></div>'
        '</div>'
    )

def _outreach_wrap(inner_html: str) -> str:
    return (
        f'<div style="max-width:560px;margin:0 auto;font-family:{_OUTREACH_FONT_STACK};'
        'font-size:14px;color:#334155;line-height:1.65;">'
        f'{inner_html}'
        f'{_outreach_signature_html()}'
        '</div>'
    )

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
    # "pro" and a bare "$" used to be in here — both matched constantly on
    # ordinary content ("process", "project", "program" all contain "pro";
    # any page mentioning a hardware/component price like "$250 FPGA" has a
    # "$"), misclassifying personal blog posts as commercial SaaS products
    # with budget for sponsorship. Same problem with "eur" as a bare
    # substring — it matches inside "neural", which is about as common a
    # word as it gets on an AI-related page. Removed/replaced with
    # unambiguous signals only.
    "pricing", "plans", "enterprise", "subscribe", "upgrade", "billing",
    "tier", "€", "lemonsqueezy", "stripe", "paddle", "free trial", "per month",
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
    if domain and domain.lower() in {"github.com", "gitlab.com", "x.com", "twitter.com", "news.ycombinator.com", "producthunt.com", "www.producthunt.com"}:
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
MIN_PH_VOTES = 10  # Skip products with fewer votes — low traction = no marketing budget

def guess_product_domain(product_name):
    """Try common TLDs for a product name to find its real website URL when PH hides it."""
    base = re.sub(r'[^a-z0-9]', '', product_name.lower())
    # Remove common suffixes from the base name
    clean_base = base.replace("app", "").replace("ai", "").replace("io", "").replace("hq", "")
    
    candidates = []
    tlds = [".com", ".io", ".ai", ".app", ".co", ".dev", ".net", ".sh", ".so", ".build", ".tech", ".run", ".design"]
    
    # Try the clean base first, then the raw base
    for b in [clean_base, base]:
        if not b:
            continue
        for tld in tlds:
            candidates.append(f"https://{b}{tld}")
            
    for url in candidates:
        try:
            resp = requests.head(url, timeout=2, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code < 400:
                return url
        except:
            pass
    return None


def scrape_producthunt_ranked_posts():
    """Scrapes PH homepage HTML once and extracts ALL needed fields (website, votes, twitter)
    from the embedded JSON — zero additional HTTP requests, no rate-limiting risk.
    Only returns products with 10+ votes that have a real resolved website URL."""

    home_url = "https://www.producthunt.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": "https://www.google.com/",
    }

    try:
        r = requests.get(home_url, headers=headers, timeout=8)
        if not r.ok:
            log.warning("PH homepage returned %s", r.status_code)
            return []
        text = r.text
    except Exception as e:
        log.warning("PH homepage fetch error: %s", e)
        return []

    # ── Extract name/slug/tagline/votes as the base set
    # PH embeds these in several JSON patterns in the page
    SKIP_SLUGS = {
        "artificial-intelligence", "developer-tools", "productivity", "saas",
        "open-source", "design-tools", "marketing", "finance", "education",
        "security", "no-code", "gaming", "health-fitness", "social-media",
        "developer-tools", "api", "devops"
    }

    # Collect raw post records keyed by slug
    posts_by_slug = {}

    # Pattern 1: standard inline JSON blob with name/slug/tagline
    for name, slug, tagline in re.findall(r'"name":"([^"]{2,80})","slug":"([^"]{2,80})","tagline":"([^"]{5,})"', text):
        if slug in SKIP_SLUGS or slug in posts_by_slug:
            continue
        name_c = name.encode().decode('unicode-escape') if '\\u' in name else name
        tag_c = tagline.encode().decode('unicode-escape') if '\\u' in tagline else tagline
        posts_by_slug[slug] = {"name": name_c[:80], "slug": slug, "tagline": tag_c[:160], "votes": 0, "website": None, "twitter": None, "maker": None}

    if not posts_by_slug:
        log.warning("PH homepage: no product matches found")
        return []

    log.info("PH homepage: found %s raw slugs", len(posts_by_slug))

    # ── Extract a traction score for each post.
    #
    # PH used to embed a plain "votesCount" number right next to each post's
    # slug, close enough that a brace-blind proximity regex (`[^{}]{0,N}`)
    # could bridge the gap. They've since (a) stopped emitting votesCount
    # for ranked-feed posts at all — replaced by a `hideVotesCount` flag
    # plus internal `latestScore`/`launchDayScore` fields — and (b) started
    # nesting several sub-objects (product/topics/friendVoters/...) between
    # the slug and those score fields. A regex that refuses to cross `{`/`}`
    # can no longer reach past those sub-objects, so every proximity match
    # failed and every post fell back to votes=0, silently emptying PH
    # discovery entirely.
    #
    # Fix: split the page into one chunk per `{"__typename":"Post",...}`
    # record first, then search within each chunk (crossing braces is fine
    # there, since we're already bounded to a single post's own JSON).
    # latestScore is the closest available substitute for a vote count.
    for chunk in text.split('"__typename":"Post"')[1:]:
        slug_m = re.search(r'"slug":"([^"]+)"', chunk[:400])
        if not slug_m or slug_m.group(1) not in posts_by_slug:
            continue
        slug = slug_m.group(1)
        score_m = (
            re.search(r'"latestScore":(\d+)', chunk[:2000])
            or re.search(r'"launchDayScore":(\d+)', chunk[:2000])
            or re.search(r'"votesCount":(\d+)', chunk[:2000])
        )
        if score_m:
            score = int(score_m.group(1))
            if score > posts_by_slug[slug]["votes"]:
                posts_by_slug[slug]["votes"] = score

    # ── Extract website URLs — try every key PH uses
    url_patterns = [
        r'"website":"(https?://[^"]{5,})"',
        r'"websiteUrl":"(https?://[^"]{5,})"',
        r'"productUrl":"(https?://[^"]{5,})"',
        r'"externalUrl":"(https?://[^"]{5,})"',
        r'"redirectUrl":"(https?://[^"]{5,})"',
        r'"homepageUrl":"(https?://[^"]{5,})"',
        r'"shoutoutUrl":"(https?://[^"]{5,})"',
    ]

    # Build a set of ALL external URLs found in the page (not PH/CDN/social)
    INTERNAL_DOMAINS = {"producthunt.com", "ph-files.imgix.net", "twitter.com", "x.com",
                        "facebook.com", "instagram.com", "linkedin.com", "youtube.com",
                        "fonts.googleapis.com", "fonts.gstatic.com", "cdn."}

    all_external = []
    for pat in url_patterns:
        all_external.extend(re.findall(pat, text))

    # Filter to real product URLs
    def _is_product_url(url):
        if not url or not url.startswith("http"):
            return False
        try:
            from urllib.parse import urlparse
            domain = urlparse(url).netloc.replace("www.", "").lower()
            return not any(d in domain for d in INTERNAL_DOMAINS) and "." in domain
        except:
            return False

    product_urls = [u for u in all_external if _is_product_url(u)]
    log.info("PH homepage: found %s external product URLs via JSON keys", len(product_urls))

    # Try to match URLs to slugs by proximity in the HTML text
    for slug, p in posts_by_slug.items():
        if p["website"]:
            continue
        # Find slug position in text
        slug_pos = text.find(f'"slug":"{slug}"')
        if slug_pos < 0:
            continue
        # Look for a website URL within 800 chars of the slug mention
        window = text[max(0, slug_pos - 200):slug_pos + 800]
        for pat in url_patterns:
            m = re.search(pat, window)
            if m and _is_product_url(m.group(1)):
                p["website"] = m.group(1)
                break

    # ── Extract Twitter handles
    for slug, handle in re.findall(r'"slug":"([^"]+)"[^{}]{0,500}?"twitterUsername":"([^"]+)"', text):
        if slug in posts_by_slug and handle:
            posts_by_slug[slug]["twitter"] = f"@{handle}"

    # ── Extract maker names
    for slug, maker in re.findall(r'"slug":"([^"]+)"[^{}]{0,500}?"makers":[^[]*\[.*?"name":"([^"]+)"', text, re.DOTALL):
        if slug in posts_by_slug and maker:
            posts_by_slug[slug]["maker"] = maker

    # ── For slugs that still have no website: smart domain construction
    # Many PH products have a website at {slug}.com, {slug}.io, {slug}.ai etc.
    # We validate with a HEAD request (fast, 2s timeout)
    NO_WEBSITE_SLUGS = [p for p in posts_by_slug.values() if not p["website"] and p["votes"] >= MIN_PH_VOTES]
    if NO_WEBSITE_SLUGS:
        log.info("Attempting smart domain resolution for %s slugs with no website...", len(NO_WEBSITE_SLUGS))

    # Only try domain guessing for high-vote products (worth the extra time)
    from concurrent.futures import ThreadPoolExecutor
    if NO_WEBSITE_SLUGS:
        # Free-tier instance has a single shared vCPU — high concurrency here
        # doesn't speed things up so much as starve the process's ability to
        # answer any other request (including /healthz) for the duration.
        with ThreadPoolExecutor(max_workers=3) as ex:
            futures = {ex.submit(guess_product_domain, p["name"]): p["slug"] for p in NO_WEBSITE_SLUGS[:20]}
            for future in futures:
                slug = futures[future]
                try:
                    url = future.result()
                    if url and slug in posts_by_slug:
                        posts_by_slug[slug]["website"] = url
                except:
                    pass

    # ── Build final candidate list: must have votes >= MIN and real website
    candidates = []
    for p in posts_by_slug.values():
        if p["votes"] < MIN_PH_VOTES:
            continue
        if not p["website"] or not is_deployed_app_url(p["website"]):
            log.debug("No website for %s (votes=%s) — skipping", p["name"], p["votes"])
            continue
        candidates.append({
            "ph_launch_id": f"ph_web_{p['slug']}",
            "product_name": p["name"],
            "tagline": p["tagline"],
            "website_url": p["website"],
            "founder_name": p.get("maker") or "",
            "twitter_handle": p.get("twitter") or "",
            "votes": p["votes"]
        })

    log.info("PH scraper: %s candidates with %s+ votes and real URLs (from %s raw slugs)",
             len(candidates), MIN_PH_VOTES, len(posts_by_slug))
    return candidates


def fetch_producthunt_launches():
    """Fetches PH launches via GraphQL API token (if available) and ranked public HTML scraper."""
    candidates = []
    seen_slugs = set()

    # 1. API GraphQL fetch if token is configured
    token = os.environ.get("PRODUCTHUNT_API_TOKEN")
    if token:
        api_url = "https://api.producthunt.com/v2/api/graphql"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        query = """
        query {
          posts(first: 50) {
            edges {
              node {
                id name tagline website
                votesCount
                makers { name twitterUsername }
              }
            }
          }
        }
        """
        try:
            r = requests.post(api_url, json={"query": query}, headers=headers, timeout=10)
            if r.ok:
                edges = r.json().get("data", {}).get("posts", {}).get("edges", [])
                for edge in edges:
                    node = edge.get("node", {})
                    ph_id = str(node.get("id", ""))
                    name = node.get("name")
                    tagline = node.get("tagline", "")
                    website = node.get("website")
                    votes = node.get("votesCount", 0)
                    makers = node.get("makers", [])
                    founder = makers[0].get("name") if makers else ""
                    twitter = f"@{makers[0].get('twitterUsername')}" if makers and makers[0].get("twitterUsername") else ""

                    if votes < MIN_PH_VOTES or not name or not website:
                        continue

                    if "producthunt.com/r/" in website:
                        real_website = guess_product_domain(name)
                        if real_website:
                            website = real_website
                        else:
                            log.debug("Skipping %s: could not resolve PH redirect %s", name, website)
                            continue

                    if not is_deployed_app_url(website):
                        continue

                    slug_key = name.lower().replace(" ", "-")
                    seen_slugs.add(slug_key)
                    candidates.append({
                        "ph_launch_id": ph_id,
                        "product_name": name,
                        "tagline": tagline or f"{name} AI Tool",
                        "website_url": website,
                        "founder_name": founder,
                        "twitter_handle": twitter,
                        "votes": votes
                    })
        except Exception as e:
            log.warning("PH GraphQL fetch failed: %s", e)

    # 2. Public ranked HTML scraper — captures Zinley, Capptivo, YourSitee, Zen Whisper, Finamie, etc.
    for wc in scrape_producthunt_ranked_posts():
        slug_key = wc["product_name"].lower().replace(" ", "-")
        if slug_key not in seen_slugs:
            seen_slugs.add(slug_key)
            candidates.append(wc)

    log.info("Total PH candidates after combined fetch: %s", len(candidates))
    return candidates

MIN_HN_POINTS = 5  # Skip HN posts with fewer points — low signal = hobby project
HN_SKIP_TITLE_PATTERNS = [
    "ask hn", "who is hiring", "who wants to be hired", "freelancer", "seeking",
    "my first", "i built", "i made", "open source", "cli tool", "command line",
    "library for", "wrapper for", "rust crate", "npm package", "python package",
    "django", "flask plugin", "chrome extension", "firefox extension"
]
HN_SKIP_DOMAINS = {
    "github.com", "gitlab.com", "pypi.org", "npmjs.com", "crates.io",
    "packagist.org", "rubygems.org", "hub.docker.com", "registry.npmjs.org"
}

def _is_quality_hn_post(title, link, points=0):
    """Returns True only if the HN Show post looks like a real commercial SaaS product."""
    if points < MIN_HN_POINTS:
        return False
    title_lower = title.lower()
    if any(pat in title_lower for pat in HN_SKIP_TITLE_PATTERNS):
        return False
    from urllib.parse import urlparse
    try:
        domain = urlparse(link).netloc.replace("www.", "")
        if domain in HN_SKIP_DOMAINS:
            return False
    except Exception:
        pass
    return is_deployed_app_url(link)

def fetch_shownews_launches():
    """Hits Algolia & HN Firebase APIs to discover newly launched commercial SaaS tools.
    Strict filters: min 5 points, no hobby/CLI/library posts, no repo domains."""
    candidates = []
    seen_ids = set()

    # 1. Algolia HN Search — fast, returns points
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
                points = h.get("points") or 0

                if not sid or sid in seen_ids or not title or not link:
                    continue
                if not _is_quality_hn_post(title, link, points):
                    continue

                seen_ids.add(sid)
                clean_name = title[8:].strip() if title.lower().startswith("show hn:") else title
                parts = clean_name.split("–") if "–" in clean_name else clean_name.split(" - ")
                prod_name = parts[0].strip()
                tagline = parts[1].strip() if len(parts) > 1 else clean_name

                candidates.append({
                    "ph_launch_id": f"hn_{sid}",
                    "product_name": prod_name[:80],
                    "tagline": tagline[:160],
                    "website_url": link,
                    "founder_name": author,
                    "twitter_handle": "",
                    "votes": points
                })
    except Exception as e:
        log.warning("Algolia Show HN fetch error: %s", e)

    # 2. Firebase HN API — backup, fetches points per story
    try:
        from concurrent.futures import ThreadPoolExecutor
        fb_url = "https://hacker-news.firebaseio.com/v0/showstories.json"
        r = requests.get(fb_url, timeout=5)
        if r.ok:
            story_ids = [sid for sid in r.json()[:60] if str(sid) not in seen_ids]

            def _fetch_single_story(sid):
                try:
                    item_r = requests.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=3)
                    if not item_r.ok:
                        return None
                    data = item_r.json()
                    title = data.get("title", "")
                    link = data.get("url", "")
                    author = data.get("by", "")
                    points = data.get("score") or 0

                    if not title or not link:
                        return None
                    if not _is_quality_hn_post(title, link, points):
                        return None

                    clean_name = title[8:].strip() if title.lower().startswith("show hn:") else title
                    parts = clean_name.split("–") if "–" in clean_name else clean_name.split(" - ")
                    prod_name = parts[0].strip()
                    tagline = parts[1].strip() if len(parts) > 1 else clean_name

                    return {
                        "ph_launch_id": f"hn_{sid}",
                        "product_name": prod_name[:80],
                        "tagline": tagline[:160],
                        "website_url": link,
                        "founder_name": author,
                        "twitter_handle": "",
                        "votes": points
                    }
                except Exception:
                    return None

            with ThreadPoolExecutor(max_workers=3) as executor:
                results = list(executor.map(_fetch_single_story, story_ids))

            for item in results:
                if item and item["ph_launch_id"].replace("hn_", "") not in seen_ids:
                    candidates.append(item)
    except Exception as e:
        log.warning("Firebase Show HN fetch error: %s", e)

    log.info("HN Show feed: %s quality candidates (min %s points, commercial SaaS only)", len(candidates), MIN_HN_POINTS)
    return candidates

# Both sources below were picked after testing several PH-alternatives —
# Reddit and TheresAnAIForThat return 403 (bot-protected) even with browser
# headers, and IndieHackers is a pure client-rendered SPA with nothing in
# the raw HTML. BetaList and Uneed are server-rendered with no bot wall and
# an open robots.txt, so they use the same requests+regex approach as the
# PH scraper rather than needing a headless browser.

_SCRAPE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def fetch_betalist_launches():
    """Scrapes BetaList's AI Tools category feed (server-rendered HTML,
    pre-filtered to on-topic products). Each candidate's real website is
    resolved through BetaList's own /startups/{slug}/visit redirect —
    the link on the card itself is an internal tracking URL, not the
    product's actual domain.
    """
    try:
        r = requests.get("https://betalist.com/browse/ai/ai-tools", headers=_SCRAPE_HEADERS, timeout=8)
        if not r.ok:
            log.warning("BetaList AI Tools page returned %s", r.status_code)
            return []
        text = r.text
    except Exception as e:
        log.warning("BetaList fetch error: %s", e)
        return []

    slug_hits = list(re.finditer(r'href="/startups/([a-z0-9-]+)"', text))
    seen_slugs = set()
    raw = []
    for i, m in enumerate(slug_hits):
        slug = m.group(1)
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        window_end = slug_hits[i + 1].start() if i + 1 < len(slug_hits) else m.end() + 1000
        window = text[m.end():window_end]
        # BetaList reuses this same card partial across different page
        # layouts (grid card on the homepage, list row on /browse/*), with
        # different wrapping tags each time — matching on the "font-medium"
        # name class plus "whatever the next inline text node is" survives
        # either <div> or <span> wrapping instead of hard-coding one.
        name_m = re.search(r'font-medium[^"]*">([^<]{2,80})</(?:div|span)>', window)
        if not name_m:
            continue
        tagline_m = re.search(
            re.escape(name_m.group(0)) + r'\s*<(?:div|span)[^>]*>([^<]{5,200})</(?:div|span)>',
            window,
        )
        raw.append({
            "slug": slug,
            "name": name_m.group(1).strip(),
            "tagline": tagline_m.group(1).strip() if tagline_m else "",
        })

    if not raw:
        log.warning("BetaList AI Tools page: no product cards found")
        return []

    from concurrent.futures import ThreadPoolExecutor

    def _resolve(slug):
        try:
            resp = requests.get(f"https://betalist.com/startups/{slug}/visit", headers=_SCRAPE_HEADERS, timeout=6, allow_redirects=True)
            if resp.ok and is_deployed_app_url(resp.url):
                return slug, resp.url
        except Exception:
            pass
        return slug, None

    # Free-tier single-vCPU host — same low concurrency cap used for PH's
    # domain-guessing, and capped to the first 30 cards per run.
    with ThreadPoolExecutor(max_workers=3) as ex:
        resolved = dict(ex.map(_resolve, [p["slug"] for p in raw[:30]]))

    candidates = []
    for p in raw:
        website = resolved.get(p["slug"])
        if not website:
            continue
        candidates.append({
            "ph_launch_id": f"betalist_{p['slug']}",
            "product_name": p["name"][:80],
            "tagline": (p["tagline"] or f"{p['name']} on BetaList")[:160],
            "website_url": website,
            "founder_name": "",
            "twitter_handle": "",
            "votes": 0,
        })

    log.info("BetaList scraper: %s candidates with resolved websites (from %s raw cards)", len(candidates), len(raw))
    return candidates


def fetch_uneed_launches():
    """Scrapes Uneed.best's homepage launch board (a PH-style feed
    specifically for indie SaaS/AI tools, server-rendered unlike its own
    /tags/{x} filter pages). Each candidate's real website is resolved
    through Uneed's own /tool/{slug}/visit redirect.
    """
    try:
        r = requests.get("https://uneed.best/", headers=_SCRAPE_HEADERS, timeout=8)
        if not r.ok:
            log.warning("Uneed homepage returned %s", r.status_code)
            return []
        text = r.text
    except Exception as e:
        log.warning("Uneed fetch error: %s", e)
        return []

    # Uneed's Nuxt renderer doesn't emit attributes in a stable order
    # (href/aria-label swap position between requests), so match the whole
    # <a> tag first and pull attributes out of that tag independently
    # rather than assuming which comes first.
    tag_hits = list(re.finditer(r'<a\s[^>]*href="/tool/([a-z0-9-]+)"[^>]*>', text))
    seen_slugs = set()
    raw = []
    for i, m in enumerate(tag_hits):
        slug = m.group(1)
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        label_m = re.search(r'aria-label="([^"]{2,80})"', m.group(0))
        name = label_m.group(1) if label_m else slug.replace("-", " ").title()
        window_end = tag_hits[i + 1].start() if i + 1 < len(tag_hits) else m.end() + 1500
        window = text[m.end():window_end]
        votes_m = re.search(r'\((\d+)\)\s*</span>', window)
        tagline_m = re.search(r'line-clamp-1">([^<]{5,200})</p>', window)
        raw.append({
            "slug": slug,
            "name": name[:80],
            "tagline": tagline_m.group(1).strip() if tagline_m else "",
            "votes": int(votes_m.group(1)) if votes_m else 0,
        })

    if not raw:
        log.warning("Uneed homepage: no product cards found")
        return []

    from concurrent.futures import ThreadPoolExecutor

    # Unlike BetaList, Uneed has no /visit redirect — the real site is
    # embedded directly in the tool's own detail page as an outbound link
    # tagged with a "?ref=uneed.best" marker (which also distinguishes it
    # from unrelated outbound links on the page, e.g. the maker's Twitter).
    def _resolve(slug):
        try:
            resp = requests.get(f"https://uneed.best/tool/{slug}", headers=_SCRAPE_HEADERS, timeout=6)
            if not resp.ok:
                return slug, None
            m = re.search(r'href="(https?://(?!(?:www\.)?uneed\.best)[^"]+\?ref=uneed\.best[^"]*)"', resp.text)
            if m:
                website = m.group(1).replace("&amp;", "&")
                if is_deployed_app_url(website):
                    return slug, website
        except Exception:
            pass
        return slug, None

    with ThreadPoolExecutor(max_workers=3) as ex:
        resolved = dict(ex.map(_resolve, [p["slug"] for p in raw[:30]]))

    candidates = []
    for p in raw:
        website = resolved.get(p["slug"])
        if not website:
            continue
        candidates.append({
            "ph_launch_id": f"uneed_{p['slug']}",
            "product_name": p["name"],
            "tagline": (p["tagline"] or f"{p['name']} on Uneed")[:160],
            "website_url": website,
            "founder_name": "",
            "twitter_handle": "",
            "votes": p["votes"],
        })

    log.info("Uneed scraper: %s candidates with resolved websites (from %s raw cards)", len(candidates), len(raw))
    return candidates

# ─── 2. EMAIL DISCOVERY (SCRAPE + GITHUB + RDAP + HUNTER.IO) ─────────────────

# Hard wall-clock ceiling for a single DNS deliverability check — see
# _domain_has_mail_capability() for why this is enforced via thread.join()
# rather than trusting dns.resolver's own lifetime parameter.
DNS_CHECK_HARD_TIMEOUT = 4

# Shared-inbox prefixes — an email here almost never reaches the person who
# can personally approve a $49.99 spend. Ranked below a founder-matching or
# neutral personal address; only used if nothing better turns up.
ROLE_INBOX_PREFIXES = {
    "info", "hello", "hi", "contact", "support", "sales", "admin", "help",
    "team", "noreply", "no-reply", "press", "media", "jobs", "careers",
    "hr", "billing", "office", "general", "enquiries", "inquiries",
    "marketing", "partnerships", "legal", "privacy",
}

# Obfuscated-email pattern (e.g. "contact [at] domain.com"). Whitespace
# around the at-token is mandatory, not optional — an *optional* gap lets the
# regex tear a plain word like "WeatherAPI.com" into a false match ("We" +
# "at" + "herAPI.com"), since "at" is a substring of "weather" with zero
# space around it. The prefix stopword list blocks the other common false
# positive: an ordinary sentence like "look at acme.com".
OBFUSCATED_EMAIL_RE = re.compile(
    r"\b([a-zA-Z0-9._%+-]{3,})\s+\[?(?:at)\]?\s+([a-zA-Z0-9-]+\.[a-zA-Z]{2,})\b",
    re.IGNORECASE
)
OBFUSCATION_PREFIX_STOPWORDS = {
    "at", "look", "see", "email", "reach", "mail", "find", "visit", "go",
    "check", "contact", "write", "ping", "hit", "send", "was", "were",
    "that", "what", "chat",
}

def _dns_lookup_worker(domain, result):
    try:
        import dns.resolver
        try:
            dns.resolver.resolve(domain, "MX", lifetime=3)
            result["ok"] = True
            return
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            pass
        except Exception:
            pass
        try:
            dns.resolver.resolve(domain, "A", lifetime=3)
            result["ok"] = True
        except Exception:
            pass
    except Exception:
        pass

def _domain_has_mail_capability(domain):
    """Confirms a domain can plausibly receive mail (MX, falling back to A)
    before handing an email out for outreach. Scraping arbitrary third-party
    HTML is adversarial input — a parsing glitch can produce something that's
    syntactically a valid email but points at a domain that doesn't exist,
    which just becomes a bounce against our own sending reputation.

    Runs in a daemon thread with a hard join timeout rather than trusting
    dns.resolver's own `lifetime` parameter to bound wall-clock time. In a
    sandboxed network environment where outbound DNS gets silently dropped
    (no ICMP unreachable, just nothing), dnspython's retries-across-lifetime
    accounting can run long enough to tie up a gthread worker thread — and
    with only 4 threads total on this service, a handful of stuck lookups is
    enough to make the whole process stop answering requests, including
    /healthz. This guarantees the caller is never blocked longer than
    DNS_CHECK_HARD_TIMEOUT regardless of what the resolver does internally.
    """
    if not domain or "." not in domain:
        return False
    result = {"ok": False}
    t = threading.Thread(target=_dns_lookup_worker, args=(domain, result), daemon=True)
    t.start()
    t.join(timeout=DNS_CHECK_HARD_TIMEOUT)
    return result["ok"]

def _score_email_candidate(email, founder_name=""):
    """Ranks a discovered email by how likely it is to reach an actual
    decision-maker instead of a shared inbox — a founder-matching or
    personal address gets far better reply rates than info@/support@.
    """
    local = email.split("@", 1)[0].lower()
    score = 50
    if founder_name:
        name_parts = [p for p in re.split(r"[\s._-]+", founder_name.lower()) if len(p) > 1]
        if any(part in local for part in name_parts):
            score += 40
    if local in ROLE_INBOX_PREFIXES or any(local.startswith(p) for p in ROLE_INBOX_PREFIXES):
        score -= 25
    return score

def _looks_like_real_name(name):
    """True only for an actual 'First Last' style name. A bare single-token
    handle (a GitHub/Hacker News/Product Hunt username like 'geekamongus') is
    not something to greet a stranger by in a cold email — it reads as
    obviously bot-scraped and undercuts the whole "personal outreach" premise
    the pitch is built on.
    """
    if not name:
        return False
    parts = [p for p in name.strip().split() if p]
    if len(parts) < 2:
        return False
    return all(p[:1].isalpha() and p[:1].isupper() for p in parts)

def _try_resolve_real_name(handle):
    """A bare handle isn't a name to greet someone by. If it happens to also
    be a real GitHub username, GitHub's public profile 'name' field is often
    the person's actual display name — a cheap upgrade over the raw handle.
    """
    if not handle or not re.match(r"^[a-zA-Z0-9-]+$", handle.strip()):
        return None
    try:
        r = requests.get(
            f"https://api.github.com/users/{handle.strip()}",
            headers={"User-Agent": "AICompassBot/1.0", "Accept": "application/vnd.github.v3+json"},
            timeout=3,
        )
        if r.ok:
            name = (r.json().get("name") or "").strip()
            if name and _looks_like_real_name(name):
                return name
    except Exception:
        pass
    return None

def scrape_website_for_email(url, founder_name=""):
    """Scrapes homepage and contact subpages, collecting every plausible email
    across all pages checked and returning the best-ranked one — a
    founder-matching or personal address beats a generic info@/support@
    inbox, since a cold pitch needs to reach whoever can actually say yes.
    """
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        found = []  # list of (email, source, score)

        def extract_emails_from_html(html):
            if not html:
                return []
            soup = BeautifulSoup(html, "html.parser")
            emails = set()

            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href.lower().startswith("mailto:"):
                    email = href[7:].split("?")[0].strip()
                    if is_valid_email(email):
                        emails.add(email)

            for meta in soup.find_all("meta"):
                content = meta.get("content", "")
                if "@" in content:
                    for part in content.split():
                        if is_valid_email(part):
                            emails.add(part)

            # separator=" " keeps adjacent block-level tags (e.g. </p><p>) from
            # fusing into one run-on token — without it, "...disappear.</p><p>For
            # real..." becomes "disappear.For", which the obfuscation regex below
            # can mistake for a domain.
            text = soup.get_text(separator=" ", strip=True)
            for m in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
                if is_valid_email(m):
                    emails.add(m)

            # Obfuscated emails (e.g. "contact [at] domain.com"). Whitespace
            # around the at-token is REQUIRED (not optional) — with optional
            # whitespace, a plain word like "WeatherAPI.com" gets torn apart
            # into a fake match ("We" + "at" + "herAPI.com") because "at" is a
            # substring of "weather" with zero space around it. A stopword
            # filter on the prefix also blocks the common "look at acme.com"
            # sentence-construction false positive.
            for prefix, domain in OBFUSCATED_EMAIL_RE.findall(text):
                if prefix.lower() in OBFUSCATION_PREFIX_STOPWORDS:
                    continue
                cand = f"{prefix}@{domain}"
                if is_valid_email(cand):
                    emails.add(cand)

            return list(emails)

        def add_candidates(html, source):
            for email in extract_emails_from_html(html):
                found.append((email, source, _score_email_candidate(email, founder_name)))

        # 1. Homepage
        home_html = None
        resp = requests.get(url, headers=headers, timeout=4, allow_redirects=True)
        if resp.ok:
            home_html = resp.text
            add_candidates(home_html, "web_scraper")

        # A founder-name match on the homepage is about as good as this
        # pipeline gets — no need to keep crawling for something better. (Final
        # selection below still runs a deliverability check before this is
        # actually handed out; this is purely a "stop crawling" shortcut.)
        if any(score >= 90 for _, _, score in found):
            skip_further_crawl = True
        else:
            skip_further_crawl = False

        # 2. Follow real contact/about/team/support links found in the homepage's own
        # nav/footer — catches sites that don't use the guessed path (e.g. /reach-us,
        # /connect, or a path under a locale prefix like /en/contact).
        domain_base = get_domain_from_url(url)
        base_url = f"https://{domain_base}" if domain_base else None
        followed_paths = set()
        LINK_TEXT_HINTS = ("contact", "about", "team", "support", "help", "reach", "connect", "founder")
        if home_html and base_url and not skip_further_crawl:
            try:
                soup = BeautifulSoup(home_html, "html.parser")
                for a in soup.find_all("a", href=True):
                    href = a["href"].strip()
                    label = a.get_text(" ", strip=True).lower()
                    haystack = f"{href.lower()} {label}"
                    if any(hint in haystack for hint in LINK_TEXT_HINTS):
                        from urllib.parse import urljoin
                        full = urljoin(base_url + "/", href)
                        if get_domain_from_url(full) == domain_base:
                            path = urlparse(full).path or "/"
                            if path not in followed_paths and len(followed_paths) < 5:
                                followed_paths.add(path)
                                try:
                                    sub_resp = requests.get(full, headers=headers, timeout=3, allow_redirects=True)
                                    if sub_resp.ok:
                                        add_candidates(sub_resp.text, "scraper_linked_page")
                                except Exception:
                                    pass
            except Exception:
                pass

        # 3. Check common fixed subpages — only worth the extra requests if we
        # haven't already found at least a neutral (non-role) address.
        if base_url and (not found or max(s for _, _, s in found) < 50):
            for path in ["/contact", "/about", "/privacy", "/team", "/support", "/help", "/legal", "/imprint"]:
                if path in followed_paths:
                    continue
                try:
                    sub_resp = requests.get(base_url + path, headers=headers, timeout=3, allow_redirects=True)
                    if sub_resp.ok:
                        add_candidates(sub_resp.text, f"scraper_{path.replace('/', '')}")
                except Exception:
                    pass

        # Pick the best-ranked candidate that's actually at a real, mail
        # -capable domain — a scraping/regex glitch can produce a
        # syntactically valid but nonexistent domain, so don't hand out a
        # guaranteed-bounce address just because it ranked highest on paper.
        for email, source, score in sorted(found, key=lambda t: t[2], reverse=True):
            if _domain_has_mail_capability(email.split("@", 1)[-1]):
                return email, source, score

        return None, "", 0
    except Exception as e:
        log.debug("Scraping email failed for %s: %s", url, e)
        return None, "", 0

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

def find_email_via_hn_profile(handle):
    """Hacker News profile 'about' text is self-reported by the account owner
    — many indie hackers list a contact email or mailto link right there.
    Only meaningful when the founder identifier is actually a bare HN/PH
    -style username, which is exactly the shape a real-name check rejects.
    """
    if not handle or not re.match(r"^[a-zA-Z0-9_-]+$", handle.strip()):
        return None, ""
    try:
        r = requests.get(f"https://hacker-news.firebaseio.com/v0/user/{handle.strip()}.json", timeout=4)
        if not r.ok:
            return None, ""
        data = r.json()
        if not data:
            return None, ""
        about = data.get("about", "") or ""
        soup = BeautifulSoup(about, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.lower().startswith("mailto:"):
                email = href[7:].split("?")[0].strip()
                if is_valid_email(email):
                    return email, "hn_profile"
        text = soup.get_text(separator=" ", strip=True)
        for m in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
            if is_valid_email(m):
                return m, "hn_profile"
    except Exception:
        pass
    return None, ""

def find_email_via_rdap(website_url):
    """Checks RDAP domain registration database for admin contact email.

    .io/.dev/.app registrars are frequently privacy-shielded, but not always —
    the generic placeholder/proxy filter in is_valid_email() already strips out
    the noise, so it's worth trying rather than skipping the whole TLD.
    """
    domain = get_domain_from_url(website_url)
    if not domain or "." not in domain:
        return None, ""
    try:
        r = requests.get(f"https://rdap.org/domain/{domain}", timeout=4)
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

COMMON_INBOX_PREFIXES = ["hello", "contact", "hi", "support", "team", "founders", "info"]

def find_email_via_pattern_guess(website_url):
    """Last-resort fallback: guesses common generic inboxes (hello@, contact@, ...)
    but only returns one if the domain actually has an MX record — otherwise a
    guess against a domain with no mail server is certain to bounce.
    Deliberately low confidence (35) since it's unverified deliverability, not an
    unverified mailbox — it lands in the admin Review queue rather than
    auto-qualifying for send.
    """
    domain = get_domain_from_url(website_url)
    if not domain or not _domain_has_mail_capability(domain):
        return None, ""

    # MX exists — return the highest-signal generic prefix; admin verifies via Review.
    candidate = f"{COMMON_INBOX_PREFIXES[0]}@{domain}"
    if is_valid_email(candidate):
        return candidate, "pattern_guess"
    return None, ""

# Shared confidence mapping for any mailbox-verification source in this
# pipeline — currently NeverBounce (verify_email_via_neverbounce, requires a
# paid/credited NEVERBOUNCE_APIKEY) and the free self-hosted SMTP RCPT-TO
# prober (scripts/verify_outreach_emails_smtp.py, runs from GitHub Actions
# since Render's free/hobby tier blocks outbound SMTP at the network level —
# see email_utils.py's module docstring for the same constraint on sending —
# and reports back via the /verification-queue and /verification-results
# routes in outreach_routes.py). Both produce the same result vocabulary.
VERIFICATION_RESULT_CONFIDENCE = {
    "valid": 95,
    "catchall": 60,   # domain accepts everything — can't confirm the mailbox itself
    "unknown": 50,    # verifier couldn't reach/get a clean answer from the mail server — inconclusive, not a hit
    "invalid": 0,
    "disposable": 0,
}

def verify_email_via_neverbounce(email):
    """Ground-truth mailbox check via NeverBounce's single-check endpoint.
    Returns (result, confidence) — (None, None) if NEVERBOUNCE_APIKEY isn't
    configured or the call fails, so callers can tell "not verified" apart
    from "verified bad" and degrade gracefully rather than downgrading
    everything just because the key is missing.
    """
    api_key = os.environ.get("NEVERBOUNCE_APIKEY")
    if not api_key or not email:
        return None, None
    try:
        r = requests.get(
            "https://api.neverbounce.com/v4.2/single/check",
            params={"key": api_key, "email": email, "timeout": 15},
            timeout=20,
        )
        if not r.ok:
            log.warning("NeverBounce verify HTTP %s for %s", r.status_code, email)
            return None, None
        result = r.json().get("result")
        return result, VERIFICATION_RESULT_CONFIDENCE.get(result)
    except Exception as e:
        log.warning("NeverBounce verify error for %s: %s", email, e)
        return None, None

def _scrape_strategy(website_url, founder_name):
    email, source, rank = scrape_website_for_email(website_url, founder_name)
    confidence = 95 if rank >= 90 else (55 if rank <= 25 else 80)
    return email, source or "web_scraper", confidence

def _github_strategy(website_url, founder_name):
    email, source = find_email_via_github(website_url, founder_name)
    return email, source or "github_api", 95

def _hn_profile_strategy(website_url, founder_name):
    # Only fires when founder_name is a bare handle (HN/PH username shape);
    # a real "First Last" name has nowhere to look this up.
    if founder_name and not _looks_like_real_name(founder_name):
        email, source = find_email_via_hn_profile(founder_name)
        return email, source or "hn_profile", 85
    return None, "", 0

def _rdap_strategy(website_url, founder_name):
    email, source = find_email_via_rdap(website_url)
    return email, source or "domain_rdap", 80

def _hunter_strategy(website_url, founder_name):
    email, score = find_email_via_hunter(website_url, founder_name)
    return email, "hunter_io", score

def _pattern_guess_strategy(website_url, founder_name):
    email, source = find_email_via_pattern_guess(website_url)
    return email, source or "pattern_guess", 35

def enrich_candidate_email(website_url, founder_name=""):
    """Comprehensive discovery pipeline combining Scraper, GitHub, HN profile,
    RDAP, Hunter.io, and pattern guessing. Every hit is re-checked for real
    mail-deliverability before being handed out — a wrong regex match on any
    of these sources is a bounce against our own sending reputation, not
    just a wasted lead.

    Returns (email, source, confidence, verification_result). When
    NEVERBOUNCE_APIKEY is configured, this chains through strategies until
    one is confirmed 'valid' by NeverBounce (ground truth) — a
    heuristically-plausible address that was never actually verified isn't
    good enough to auto-qualify for send — only falling back to the best
    inconclusive (catchall/unknown) hit if nothing comes back clean.
    verification_result is None whenever the returned confidence is a
    heuristic guess rather than an actual NeverBounce verdict (no key
    configured, budget exhausted, or the verify call itself failed).
    Without a key configured, this falls back to the prior behavior of
    returning the first MX-capable hit with its heuristic confidence score.
    """
    verification_enabled = bool(os.environ.get("NEVERBOUNCE_APIKEY"))
    strategies = [
        _scrape_strategy, _github_strategy, _hn_profile_strategy,
        _rdap_strategy, _hunter_strategy, _pattern_guess_strategy,
    ]

    best_fallback = (None, "none", 0, None)
    verifications_used = 0

    for strategy in strategies:
        email, source, heuristic_confidence = strategy(website_url, founder_name)
        if not email or not _domain_has_mail_capability(email.split("@", 1)[-1]):
            continue

        if not verification_enabled:
            return email, source, heuristic_confidence, None

        if verifications_used >= NEVERBOUNCE_MAX_PER_RUN:
            # Verification budget exhausted this run — keep the best
            # MX-capable hit as an unverified fallback rather than
            # discarding it outright.
            capped = min(heuristic_confidence, 50)
            if capped > best_fallback[2]:
                best_fallback = (email, source, capped, None)
            continue

        verdict, verified_confidence = verify_email_via_neverbounce(email)
        verifications_used += 1

        if verdict == "valid":
            return email, source, verified_confidence, verdict
        elif verdict in ("catchall", "unknown"):
            if verified_confidence > best_fallback[2]:
                best_fallback = (email, source, verified_confidence, verdict)
        elif verdict in ("invalid", "disposable"):
            pass  # confirmed bad — discard entirely, try next strategy
        else:
            # Verifier call itself failed (network/API error) — don't let an
            # unverified heuristic score of 90+ pass through as if it had
            # been confirmed; cap it same as an inconclusive result.
            candidate_confidence = min(heuristic_confidence, 50)
            if candidate_confidence > best_fallback[2]:
                best_fallback = (email, source, candidate_confidence, None)

    return best_fallback

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
Write a short, high-converting cold outreach email pitching Fast-Track Sponsored Curation to the founder of a SaaS product. The reader gets dozens of
cold emails a week and decides whether to keep reading within the first line. Your only job is to get them to click the link and pay $49.99 — write
like a founder personally reaching out to another founder, not like a marketing blast.

CONVERSION STRUCTURE (follow this order, this is what makes it work):
1. Opening line (1 sentence): reference ONE concrete, specific detail about their product — its exact tagline, a feature, or the specific problem it
   solves for students/developers. Prove in the first sentence that this isn't a template. Never open with "I came across X" or "I hope this finds
   you well" — those are the two biggest tells of a mass-blasted email and cause instant deletion.
2. Bridge (1 sentence): connect that specific detail to why AI Compass's audience (students/developers actively searching for tools like theirs) is
   exactly who they want finding them.
3. Proof, stated as outcomes not just numbers: "4,000+ monthly active visitors and 110K+ Google search impressions from students actively looking for
   tools like [product]" reads stronger than a bare stat dump — anchor the numbers to THEIR situation.
4. The offer as a tight, scannable bullet list (keep exactly these three, do not add more):
   - Guaranteed 24-hour priority review and frontpage listing
   - Sponsored placement above every free listing in their category, permanently
   - Spotlight in the weekly Student AI Digest
5. One line of genuine urgency/personal stake — something true, not fabricated scarcity: e.g. that submissions are reviewed personally within 24
   hours, or that early listings in a category compound in SEO value over time. Never invent fake countdown timers or "only 2 spots left" claims.
6. A single, unambiguous call to action: one sentence + the link https://ai-compass.in/submit — but make it low-friction by also naming the
   alternative of just replying (e.g. "grab the spot here [link] — or just reply if you've got questions first"). Most recipients who are interested
   but not ready to pay on the spot will never click a payment link cold; giving them "reply" as a zero-commitment option is what turns interest into
   an actual email back, which a link click alone can't do. Still only one link — replying is a fallback, not a second competing CTA.
7. Sign-off, then a P.S. line that restates the strongest single hook (the 24-hour guarantee or the backlink) in one short sentence — P.S. lines get
   read even by skimmers and are proven to lift reply rates.

HARD CONSTRAINTS:
- Body text (excluding the bullet list and signature) must be under 130 words total. Cold emails that take longer than 20 seconds to read get archived
  unread. Cut every sentence that doesn't directly serve steps 1-7 above.
- No emojis anywhere. No exclamation points except at most one, and only if it reads natural, not salesy.
- No spam-trigger phrasing: avoid "FREE", "ACT NOW", "$$$", ALL CAPS words, or more than one "!!!"-style emphasis.
- Never fabricate claims not in the metrics/perks below (no fake testimonials, no fake urgency, no invented statistics).
- Output valid JSON with exactly two fields: "subject" and "body". Do NOT include a signature — that is appended separately.
- Subject line: under 50 characters, reads like a real 1:1 email a person would send (e.g. mentioning the product by name), never generic corporate
  phrasing like "Exciting Partnership Opportunity" or "Featured Placement Offer".
- The "body" must be clean HTML using ONLY <p>, <b>, <ul>, <li>, and <a> tags — no <br>, no <style> blocks, no tables, no images, no signature block.
- Every <p> must carry style="margin:0 0 14px 0;" and the <ul> must carry style="margin:0 0 16px 0;padding-left:20px;color:#475569;" — this keeps
  spacing consistent across every email client instead of relying on each client's own default paragraph spacing. Example paragraph:
  <p style="margin:0 0 14px 0;">Hey Jane, ...</p>
- The CTA paragraph must look like this pattern (adjust the wording, keep the styling): <p style="margin:0 0 4px 0;font-size:14.5px;"><a
  href="https://ai-compass.in/submit" style="color:#059669;font-weight:700;text-decoration:none;border-bottom:1.5px solid #059669;">[short CTA verb
  phrase, e.g. "Get [Product] listed →"]</a> <span style="color:#64748b;font-size:13.5px;">$49.99 one-time — or just reply if you've got questions
  first.</span></p>
- The P.S. paragraph must use style="margin:16px 0 0 0;font-size:12px;color:#64748b;".

Return ONLY the raw JSON block. Do not wrap in ```json or markdown codeblocks, just return the raw JSON object.
"""

    # A raw HN/PH/GitHub username (e.g. "geekamongus") is not a name to greet
    # a stranger by — it reads as obviously bot-scraped. Only pass through an
    # actual "First Last" style name; otherwise let the model use a neutral
    # greeting instead of parroting a handle back at someone.
    display_name = candidate.founder_name if _looks_like_real_name(candidate.founder_name) else ""

    prompt = f"""
{system_prompt}

Write an outreach email for this candidate:
- Product Name: {candidate.product_name}
- Tagline: {candidate.tagline}
- Website: {candidate.website_url}
- Founder/Maker: {display_name or 'not known — use a neutral greeting'}
- Tone to use: {candidate.tone}

If a founder name is given, greet them by first name only (e.g. "Hey Jane," not "Hey Jane Doe,"). If not known, use "Hey there,".
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
        }
    }

    # gemini-2.0-flash first (same model + fallback order already proven
    # working elsewhere in this codebase, e.g. the Model Advisor endpoint),
    # falling back to 1.5-flash if the newer model errors or is unavailable
    # for this key.
    for model in ("gemini-2.0-flash", "gemini-1.5-flash"):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            r = requests.post(url, json=payload, timeout=20)
            if not r.ok:
                log.warning("Gemini (%s) returned %s: %s", model, r.status_code, r.text)
                continue

            resp_data = r.json()
            candidates_list = resp_data.get("candidates", [])
            if not candidates_list:
                log.warning("No candidates in Gemini (%s) response: %s", model, resp_data)
                continue

            text = candidates_list[0].get("content", {}).get("parts", [])[0].get("text", "").strip()

            if text.startswith("```json"):
                text = text[7:-3].strip()
            elif text.startswith("```"):
                text = text[3:-3].strip()

            import json
            result = json.loads(text)
            subject, body = result.get("subject"), result.get("body")
            if subject and body:
                return subject, _append_unsubscribe_footer(_outreach_wrap(body), candidate.email)
        except Exception as e:
            log.warning("Gemini (%s) draft generation failed: %s", model, e)

    return get_generic_draft(candidate)


def get_generic_draft(candidate):
    """Fallback template used when Gemini fails or is unconfigured. Mirrors the
    same conversion structure as the Gemini prompt: specific opening, tight
    offer bullets, one real urgency line, single CTA, P.S. reinforcement.
    """
    name = candidate.product_name
    first_name = candidate.founder_name.split(" ")[0] if _looks_like_real_name(candidate.founder_name) else "there"
    hook = f"the way {name} handles \"{candidate.tagline}\"" if candidate.tagline else f"what you're building with {name}"
    subject = f"Quick one about {name}"[:50]
    inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>
<p style="margin:0 0 14px 0;">I run <a href="https://ai-compass.in" style="color:#059669;font-weight:600;">AI Compass</a> and just saw {hook} — students and developers searching for exactly this kind of tool are who we send traffic to every day.</p>
<p style="margin:0 0 14px 0;">AI Compass gets <b>4,000+ monthly active visitors</b> and <b>110K+ Google search impressions</b> from students actively looking for tools like {name}. Here's what Fast-Track Sponsored Curation gets you:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;color:#475569;font-size:13.5px;">
  <li style="margin-bottom:5px;">Guaranteed 24-hour priority review and frontpage listing</li>
  <li style="margin-bottom:5px;">Sponsored placement above every free listing in your category, permanently</li>
  <li>Spotlight in the weekly Student AI Digest</li>
</ul>
<p style="margin:0 0 20px 0;">I personally review every fast-track submission within 24 hours of payment — no queue, no waiting.</p>
<p style="margin:0 0 4px 0;font-size:14.5px;"><a href="https://ai-compass.in/submit" style="color:#059669;font-weight:700;text-decoration:none;border-bottom:1.5px solid #059669;">Get {name} listed &rarr;</a> <span style="color:#64748b;font-size:13.5px;">$49.99 one-time — or just reply if you've got questions first.</span></p>
<p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">P.S. The 24-hour review is a real guarantee, not a marketing line — most listings go live same-day.</p>"""
    return subject, _append_unsubscribe_footer(_outreach_wrap(inner), candidate.email)

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
def find_twitter_handle_for_product(product_name, website_url):
    """Searches for an X/Twitter handle by scraping the product's homepage for social links."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(website_url, headers=headers, timeout=2.5, allow_redirects=True)
        if resp.ok:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                # Match twitter.com/handle or x.com/handle patterns
                m = re.search(r'(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})(?:[/?]|$)', href)
                if m:
                    handle = m.group(1)
                    # Skip generic pages like /home, /share, /intent
                    if handle.lower() not in {"home", "share", "intent", "search", "hashtag", "i"}:
                        return f"@{handle}"
    except Exception:
        pass
    return None

def run_discovery_pipeline():
    """Fetches today's ranked PH/HN/BetaList/Uneed launches, runs quality
    gates, and saves candidates. Contact enrichment is best-effort —
    products without email are saved as 'no_email_found' and shown in
    admin queue with a '+ Add Email' button.

    Four sources feed this now instead of two, so running the network-bound
    work (commercial-signal check, email enrichment, Twitter lookup, draft
    generation) sequentially for every survivor — like this used to — made
    a full run take long enough to regularly still be running when the next
    manual click or cron tick came in, hitting the job lock. That per-
    candidate work touches only plain strings and a not-yet-added
    OutreachCandidate instance (never db.session or a query) so it's safe
    to run in a thread pool; only the dedup check and the final add/commit
    stay in the main thread, same pattern already used by
    regenerate_all_drafts().
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    ph_launches = fetch_producthunt_launches()
    hn_launches = fetch_shownews_launches()
    betalist_launches = fetch_betalist_launches()
    uneed_launches = fetch_uneed_launches()
    launches = ph_launches + hn_launches + betalist_launches + uneed_launches
    new_candidates_count = 0
    skipped_not_deployed = 0
    skipped_not_relevant = 0
    skipped_not_commercial = 0
    skipped_duplicate = 0

    # Extra HN-specific title quality filter — skip tutorial/game/blog posts
    HN_JUNK_TITLE_PATTERNS = [
        "i built", "i made", "i wrote", "i created", "how to", "how i",
        "terminal game", "browser game", "html5 game", "50 years", "hacking history",
        "self-host", "self host", "code review agent", "what should", "what if",
        "acid 3", "acid3", "gui for ai", "wage against", "distilling", "remade in html",
        "censorship", "deepseek", "gpt-oss"
    ]

    # ── Local-only gates + the DB-bound dedup check first, in the main
    # thread — cheap, and skips wasted network work on anything we'd
    # reject anyway (duplicates are common once four sources overlap).
    survivors = []
    for l in launches:
        website_url = l.get("website_url", "")
        product_name = l.get("product_name", "")
        tagline = l.get("tagline", "")
        ph_id = l.get("ph_launch_id", "")

        if ph_id and ph_id.startswith("hn_"):
            combined_lower = f"{product_name} {tagline}".lower()
            if any(pat in combined_lower for pat in HN_JUNK_TITLE_PATTERNS):
                continue

        # ── Gate 1: Must be a real deployed app (not GitHub, not repo)
        if not is_deployed_app_url(website_url):
            skipped_not_deployed += 1
            continue

        # ── Gate 2: Must be relevant to students/developers
        if not is_student_relevant(product_name, tagline, website_url):
            skipped_not_relevant += 1
            continue

        # ── Gate 3: Deduplication
        if is_duplicate_candidate(product_name, website_url, ph_id):
            skipped_duplicate += 1
            continue

        survivors.append(l)

    def _process(l):
        website_url = l.get("website_url", "")
        product_name = l.get("product_name", "")
        tagline = l.get("tagline", "")
        founder_name = l.get("founder_name", "")
        ph_id = l.get("ph_launch_id", "")

        # ── Gate 4: Must have commercial signals (pricing, paid plan, etc.)
        if not is_commercial_saas(website_url):
            return None

        # ── Contact enrichment (best-effort, not a hard gate)
        email, source, score, verification_result = enrich_candidate_email(website_url, founder_name)
        contact_twitter = l.get("twitter_handle", "")
        if not contact_twitter:
            contact_twitter = find_twitter_handle_for_product(product_name, website_url)

        c = OutreachCandidate()
        c.ph_launch_id = ph_id
        c.product_name = product_name
        c.tagline = tagline
        c.website_url = website_url
        c.founder_name = founder_name
        c.tone = infer_tone(tagline, "")

        if email:
            c.email = email
            c.email_source = source
            c.confidence_score = score
            c.verification_result = verification_result
            c.verified_at = datetime.now(timezone.utc) if verification_result else None
            c.status = _status_for_email_confidence(score)
        elif contact_twitter:
            # Twitter-only: store handle so admin can DM or public-tweet
            c.email = contact_twitter
            c.email_source = "twitter_handle"
            c.confidence_score = 70
            c.status = "draft_ready"
        else:
            # No contact found — save anyway so admin can manually add
            c.email_source = "none"
            c.confidence_score = 0
            c.status = "no_email_found"

        subject, body = generate_draft_via_gemini(c)
        c.draft_subject = subject
        c.draft_body = body
        return c

    # Same concurrency cap used elsewhere in this file for this exact
    # reason (regenerate_all_drafts, PH domain-guessing) — this free-tier
    # instance has a single shared vCPU, so more workers here would just
    # starve the process's ability to answer other requests.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_process, l) for l in survivors]
        for f in as_completed(futures):
            try:
                c = f.result()
            except Exception as e:
                log.warning("Candidate processing failed: %s", e)
                continue
            if c is None:
                skipped_not_commercial += 1
                continue
            try:
                db.session.add(c)
                db.session.commit()
                new_candidates_count += 1
            except Exception as e:
                db.session.rollback()
                log.warning("Skipping save for %s (id: %s) due to database error: %s", c.product_name, c.ph_launch_id, e)

    log.info(
        "Discovery pipeline complete: %s saved | %s not deployed | %s not relevant | %s not commercial | %s duplicates",
        new_candidates_count, skipped_not_deployed, skipped_not_relevant, skipped_not_commercial, skipped_duplicate
    )
    return new_candidates_count

def _email_is_broken(candidate):
    """True if a candidate's stored email is syntactically invalid or points
    at a domain that can't receive mail — i.e. it's actively wrong, not just
    low-confidence. A regex glitch or stale scrape can leave one of these
    sitting in draft_ready indefinitely if nothing ever re-checks it.
    """
    if not candidate.email:
        return False
    if not is_valid_email(candidate.email):
        return True
    domain = candidate.email.split("@", 1)[-1] if "@" in candidate.email else ""
    return not _domain_has_mail_capability(domain)

def re_enrich_missing_candidate_emails():
    """Re-verifies candidates that are missing an email OR whose stored email
    or founder name looks weak — not just rows marked 'no_email_found'.
    'draft_ready' rows are in scope too: an old scrape can have stored a
    broken address (regex glitch, dead domain), a low-confidence guess, or a
    raw HN/PH username as the "founder name". Each is re-run through the
    multi-strategy pipeline / name-resolution concurrently, and the draft is
    regenerated whenever the email or name actually changes. Rows already
    sent/followed_up/replied/bounced/rejected are left untouched.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status.in_(["no_email_found", "draft_ready"])
    ).all()
    if not candidates:
        return {"emails_fixed": 0, "names_fixed": 0, "drafts_regenerated": 0}

    def _needs_email_recheck(c):
        if not c.email or _email_is_broken(c):
            return True
        if c.verification_result is None:
            # Never actually run through NeverBounce — a heuristic 80/95
            # score isn't real confirmation, regardless of how high it is.
            return True
        if c.email_source == "pattern_guess":
            # Last-resort generic guess (hello@domain) — even once NeverBounce
            # comes back "unknown" (50, the VERIFICATION_RESULT_CONFIDENCE
            # ceiling for that verdict), that's an inconclusive SMTP check,
            # not a real mailbox. `< 50` below never re-triggers at exactly
            # 50, which permanently stranded every pattern_guess row at 50%
            # no matter how many times Re-Enrich ran. Always give rediscovery
            # another shot at a real (scrape/github/rdap/hunter) address.
            return True
        return (c.confidence_score or 0) < 50

    def _needs_name_fix(c):
        return bool(c.founder_name) and not _looks_like_real_name(c.founder_name)

    work_items = [
        (c.id, c.website_url, c.founder_name, c.email, c.email_source,
         _needs_email_recheck(c), _needs_name_fix(c))
        for c in candidates
    ]
    work_items = [w for w in work_items if w[5] or w[6]]
    if not work_items:
        return {"emails_fixed": 0, "names_fixed": 0, "drafts_regenerated": 0}

    log.info("Re-verifying %s candidates (email and/or founder name)...", len(work_items))

    def _process(item):
        cid, url, founder, existing_email, existing_source, needs_email, needs_name = item
        new_email = new_source = new_name = new_verification = None
        new_score = None

        if needs_email:
            # If there's already a plausible email on file, verify that one
            # directly first — cheap (one call) and avoids burning a full
            # multi-strategy rediscovery (several network + verification
            # calls) on every candidate whose only issue is "never actually
            # verified", which would otherwise re-run on every /re-enrich
            # click forever since nothing would change verification_result.
            if existing_email and is_valid_email(existing_email) and \
                    _domain_has_mail_capability(existing_email.split("@", 1)[-1]):
                verdict, confidence = verify_email_via_neverbounce(existing_email)
                if verdict == "valid":
                    new_email, new_source, new_score, new_verification = existing_email, existing_source, confidence, verdict
                elif verdict in ("catchall", "unknown"):
                    # Inconclusive on the address already on file — keep it
                    # as a fallback, but still try rediscovery below for a
                    # chance at a cleanly 'valid' address.
                    new_email, new_source, new_score, new_verification = existing_email, existing_source, confidence, verdict

            if new_verification != "valid":
                email, source, score, verification_result = enrich_candidate_email(url, founder)
                if email and score > (new_score or 0):
                    new_email, new_source, new_score, new_verification = email, source, score, verification_result

        if needs_name:
            new_name = _try_resolve_real_name(founder)
        return cid, new_email, new_source, new_score, new_verification, new_name

    results = []
    # Capped low deliberately: each candidate can chain through several
    # network calls (scrape, GitHub, HN profile, RDAP, Hunter, pattern
    # guess), and this free-tier instance has a single shared vCPU — running
    # 8 of these concurrently was enough to starve the process's ability to
    # answer any other request (including /healthz) for minutes at a time.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_process, item) for item in work_items]
        for f in as_completed(futures):
            try:
                results.append(f.result())
            except Exception as e:
                log.warning("Candidate re-verification task error: %s", e)

    cand_dict = {c.id: c for c in candidates}
    emails_fixed = 0
    names_fixed = 0
    drafts_regenerated = 0
    any_changed = False

    for cid, new_email, new_source, new_score, new_verification, new_name in results:
        c = cand_dict.get(cid)
        if not c:
            continue
        changed = False

        if new_email:
            c.email = new_email
            c.email_source = new_source
            c.confidence_score = new_score
            c.verification_result = new_verification
            c.verified_at = datetime.now(timezone.utc) if new_verification else None
            c.status = _status_for_email_confidence(new_score)
            changed = True
            emails_fixed += 1
        elif _email_is_broken(c):
            # Confirmed broken and nothing better turned up this pass — don't
            # leave a guaranteed-bounce address sitting in draft_ready.
            c.email = None
            c.email_source = "none"
            c.confidence_score = 0
            c.verification_result = None
            c.verified_at = None
            c.status = "no_email_found"
            changed = True

        if new_name:
            c.founder_name = new_name
            changed = True
            names_fixed += 1

        if changed and c.email and c.status != "rejected":
            subject, body = generate_draft_via_gemini(c)
            c.draft_subject = subject
            c.draft_body = body
            drafts_regenerated += 1

        if changed:
            c.updated_at = datetime.now(timezone.utc)
            any_changed = True

    if any_changed:
        db.session.commit()
        log.info(
            "Re-verification complete: %s emails fixed, %s names fixed, %s drafts regenerated.",
            emails_fixed, names_fixed, drafts_regenerated
        )

    return {"emails_fixed": emails_fixed, "names_fixed": names_fixed, "drafts_regenerated": drafts_regenerated}

# ─── 5. AUTOMATED FOLLOW-UPS ────────────────────────────────────────────────

# Cold-outreach deliverability guard: caps total successful sends (initial +
# follow-up, combined) per rolling day. A fresh sending domain that jumps
# from 0 to hundreds of cold emails overnight gets flagged as spam fast —
# 30/day is a conservative ramp-up rate. Override with OUTREACH_DAILY_SEND_CAP.
DAILY_SEND_CAP = int(os.environ.get("OUTREACH_DAILY_SEND_CAP", "30"))

# Hard ceiling on NeverBounce verification calls per enrichment/re-enrich run
# — a misconfiguration or a large backlog shouldn't be able to silently burn
# through the whole NeverBounce credit balance unattended in one run.
NEVERBOUNCE_MAX_PER_RUN = int(os.environ.get("NEVERBOUNCE_MAX_VERIFICATIONS_PER_RUN", "300"))

# Minimum confidence_score required to send — enforced at the route layer as
# a hard gate (not just a UI hint), since a bounce against an unverified
# guess costs sender reputation, not just a wasted lead. 80 rather than a
# stricter 90+ because the free SMTP prober's 'catchall'/'unknown' verdicts
# (60/50) are legitimately inconclusive, not wrong — some real mail
# providers (Microsoft 365 in particular) never give a clean answer at the
# SMTP stage — so anything scoring in the low-verified tiers still needs a
# real ceiling above them, not a bar so high nothing clears it.
CONFIDENCE_SEND_THRESHOLD = int(os.environ.get("OUTREACH_CONFIDENCE_SEND_THRESHOLD", "80"))

# Below this, an email is treated as not worth an admin's review time or
# the reputation risk of sending — auto-rejected rather than left sitting
# in draft_ready. Only applies when there IS an email to judge; a candidate
# with no email at all stays 'no_email_found' (still worth manual follow-up
# via "+ Add Email"), it isn't the same failure mode as a bad guess.
AUTO_REJECT_BELOW_CONFIDENCE = int(os.environ.get("OUTREACH_AUTO_REJECT_BELOW_CONFIDENCE", "50"))

def _status_for_email_confidence(confidence):
    return "rejected" if confidence < AUTO_REJECT_BELOW_CONFIDENCE else "draft_ready"

# The send window resets at 9:00 AM IST (03:30 UTC) rather than midnight UTC
# — aligned with when the team actually starts work, not an arbitrary UTC
# boundary nobody here is awake for.
SEND_WINDOW_RESET_UTC_HOUR = 3
SEND_WINDOW_RESET_UTC_MINUTE = 30

def _current_send_window_start():
    now = datetime.now(timezone.utc)
    reset_today = now.replace(hour=SEND_WINDOW_RESET_UTC_HOUR, minute=SEND_WINDOW_RESET_UTC_MINUTE, second=0, microsecond=0)
    if now < reset_today:
        return reset_today - timedelta(days=1)
    return reset_today

def sends_remaining_today():
    window_start = _current_send_window_start()
    sent_today = OutreachEmailLog.query.filter(
        OutreachEmailLog.status == "success",
        OutreachEmailLog.sent_at >= window_start
    ).count()
    return max(0, DAILY_SEND_CAP - sent_today)

def _followup_content(c: OutreachCandidate, stage: int) -> tuple[str, str, str]:
    """Returns (subject, html, text) for follow-up `stage` (1 or 2).

    Most cold-outreach replies come from the 2nd/3rd touch, not the first
    email — a single follow-up leaves a lot of that on the table. Stage 2
    is a short, low-pressure bump that explicitly asks for *any* reply
    (yes/no/not now), since an easy-to-answer question converts to a reply
    far better than silently re-pitching the same offer again.
    """
    first_name = c.founder_name.split(" ")[0] if _looks_like_real_name(c.founder_name) else "there"
    if stage == 1:
        subject = f"Re: {c.draft_subject}"
        inner = f"""<p style="margin:0 0 14px 0;">Hi {first_name},</p>
<p style="margin:0 0 14px 0;">Just wanted to quickly follow up on my previous message. Are you interested in featuring <b>{c.product_name}</b> on AI Compass to capture traffic from students and developers?</p>
<p style="margin:0 0 4px 0;">Let me know if you have any questions — or just reply "not interested" and I'll leave it there.</p>"""
        text = (
            f"Hi {first_name},\n\nJust wanted to quickly follow up on my previous message. "
            f"Are you interested in featuring {c.product_name} on AI Compass?\n\n"
            f"Let me know if you have any questions — or just reply \"not interested\" and I'll leave it there.\n\n"
            f"Medhansh Pratap Singh\nFounder, AI Compass — ai-compass.in"
        )
    else:
        subject = f"Re: {c.draft_subject}"
        inner = f"""<p style="margin:0 0 14px 0;">Hi {first_name},</p>
<p style="margin:0 0 4px 0;">Last bump on this, promise. Still interested in getting <b>{c.product_name}</b> in front of AI Compass's student/dev audience? A quick "yes," "no," or "not now" is all I need to know whether to close this out.</p>"""
        text = (
            f"Hi {first_name},\n\nLast bump — still interested in getting {c.product_name} featured on AI Compass? "
            f"A quick yes/no/not-now reply is all I need.\n\n"
            f"Medhansh Pratap Singh\nFounder, AI Compass — ai-compass.in"
        )
    return subject, _outreach_wrap(inner), text


def _send_followup(c: OutreachCandidate, stage: int, next_status: str) -> bool:
    subject, html, text = _followup_content(c, stage)
    html = _append_unsubscribe_footer(html, c.email)

    success = False
    err_msg = None
    try:
        success = send_email(
            to=c.email, subject=subject, html=html, text=text,
            reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
        )
    except Exception as exc:
        err_msg = str(exc)

    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject=subject, body=html,
        status="success" if success else "failure", error_message=err_msg,
    ))

    if success:
        c.status = next_status
        c.last_status_change_at = datetime.now(timezone.utc)
    return success


def run_automated_followups():
    """Sends up to two automated bump emails to candidates who haven't replied:
    stage 1 at 5 days after the initial send, stage 2 at 5 days after that
    (10 days total). Candidates stop advancing the moment their status moves
    away from 'sent'/'followed_up' for any other reason (replied, bounced,
    rejected, unsubscribed), so nothing here ever emails someone who opted out.
    """
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)

    stage1_candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status == "sent",
        OutreachCandidate.last_status_change_at <= five_days_ago
    ).all()
    stage2_candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status == "followed_up",
        OutreachCandidate.last_status_change_at <= five_days_ago
    ).all()

    remaining = sends_remaining_today()
    sent_count = 0
    for c, stage, next_status in (
        [(c, 1, "followed_up") for c in stage1_candidates]
        + [(c, 2, "followed_up_2") for c in stage2_candidates]
    ):
        if remaining <= 0:
            log.info("Daily send cap (%s) reached — deferring remaining follow-ups to tomorrow.", DAILY_SEND_CAP)
            break
        if not c.email or not c.draft_subject:
            continue

        if _send_followup(c, stage, next_status):
            sent_count += 1
            remaining -= 1

    if sent_count > 0:
        db.session.commit()
        log.info("Sent %s automated follow-up emails.", sent_count)

    return sent_count

# ─── 6. BULK DRAFT REGENERATION ─────────────────────────────────────────────

def regenerate_all_drafts():
    """Regenerates draft_subject/draft_body for every draft_ready candidate
    with an email. Drafts are only generated once and stored — a later
    template change (new stats, new copy) doesn't retroactively touch
    already-generated drafts, so this is the one-shot fix to bring every
    existing candidate's draft up to date with the current template.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status == "draft_ready",
        OutreachCandidate.email.isnot(None),
    ).all()
    if not candidates:
        return 0

    cand_dict = {c.id: c for c in candidates}

    def _generate(cid):
        return cid, generate_draft_via_gemini(cand_dict[cid])

    regenerated = 0
    # Same concurrency cap as re_enrich_missing_candidate_emails — this
    # free-tier instance has a single shared vCPU, so more workers here
    # would just starve the process's ability to answer other requests.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_generate, cid) for cid in cand_dict]
        for f in as_completed(futures):
            try:
                cid, (subject, body) = f.result()
                c = cand_dict[cid]
                c.draft_subject = subject
                c.draft_body = body
                c.updated_at = datetime.now(timezone.utc)
                regenerated += 1
            except Exception as e:
                log.warning("Draft regeneration failed: %s", e)

    if regenerated:
        db.session.commit()
        log.info("Regenerated %s draft(s).", regenerated)

    return regenerated

# ─── 7. REMOTE VERIFICATION TRIGGER (GitHub Actions) ────────────────────────

GITHUB_REPO = "Singhmedhansh/ai-compass"

def trigger_github_verification_workflow():
    """Dispatches outreach-cron.yml on GitHub Actions in verify_only mode so
    the real SMTP mailbox verifier (scripts/verify_outreach_emails_smtp.py)
    runs on demand instead of waiting for the next daily cron tick. This has
    to happen remotely — Render's free/hobby tier blocks outbound SMTP (see
    email_utils.py's module docstring), which is exactly why that verifier
    lives on a GitHub-hosted runner in the first place.

    Returns (success, message). Requires GITHUB_ACTIONS_PAT: a token scoped
    to Actions:write on this one repo — never used to touch code or secrets,
    only to start a workflow run.
    """
    token = os.environ.get("GITHUB_ACTIONS_PAT")
    if not token:
        return False, "GITHUB_ACTIONS_PAT is not configured on the server"
    try:
        r = requests.post(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/outreach-cron.yml/dispatches",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"ref": "main", "inputs": {"mode": "verify_only"}},
            timeout=15,
        )
        if r.status_code == 204:
            return True, "Verification workflow triggered"
        return False, f"GitHub API returned {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)

# ─── 8. CATALOG TRAFFIC-REPORT CAMPAIGN ─────────────────────────────────────
#
# Sections 1-3 above pitch founders of brand-new PH/HN launches — strangers
# with no relationship to AI Compass, asked to pay immediately. This section
# targets the opposite audience: tools ALREADY listed in the catalog that are
# ALREADY receiving outbound clicks from us.
#
# That turns the email from a pitch into a report. "AI Compass sent you 143
# clicks last month" is specific, true, verifiable on their end, and comes
# from someone who demonstrably gave value before asking for anything. It
# also changes the offer — these tools are already listed, so the ask is an
# upgrade to featured placement, not "get listed".
#
# Everything downstream is deliberately shared with the cold pipeline: these
# are ordinary OutreachCandidate rows, so they inherit the mailbox
# verification send gate, the daily send cap, unsubscribe suppression,
# follow-ups and the admin review UI without duplicating any of it.

# Minimum trailing-window clicks before a listed tool is worth contacting.
# Below this the opener is too weak to justify the send — reporting 2 clicks
# lands worse than not emailing, and still spends sender reputation.
CATALOG_CAMPAIGN_MIN_CLICKS = int(os.environ.get("OUTREACH_CATALOG_MIN_CLICKS", "5"))

# Per-run ceiling. Each candidate chains several network-bound enrichment
# strategies, so an unbounded run would hold a worker for a very long time on
# a free-tier instance.
CATALOG_CAMPAIGN_MAX_PER_RUN = int(os.environ.get("OUTREACH_CATALOG_MAX_PER_RUN", "25"))

# ph_launch_id is unique+indexed, so prefixing catalog-sourced rows with this
# reuses that constraint for dedup rather than adding a column (and a Render
# migration) purely to tell the two sources apart.
CATALOG_CANDIDATE_ID_PREFIX = "catalog:"


def get_catalog_click_counts(days=30, min_clicks=1):
    """{slug: clicks} for tools with outbound clicks in the trailing window."""
    from sqlalchemy import func

    from app.models import OutboundClick

    since = datetime.now(timezone.utc) - timedelta(days=days)
    n = func.count(OutboundClick.id)
    rows = (
        db.session.query(OutboundClick.slug, n.label("n"))
        .filter(OutboundClick.created_at >= since)
        .group_by(OutboundClick.slug)
        .having(n >= min_clicks)
        .order_by(n.desc())
        .all()
    )
    return {slug: count for slug, count in rows}


def _existing_candidate_for(product_name, website_url):
    """An OutreachCandidate already covering this product/domain, or None.

    Only looks at the outreach pipeline — unlike is_duplicate_candidate(),
    it does not treat presence in the catalog as a disqualifier.
    """
    domain = get_domain_from_url(website_url)
    if domain and domain.lower() in REJECTED_HOSTS:
        domain = ""
    q = OutreachCandidate.query
    if domain:
        return q.filter(
            (OutreachCandidate.product_name.ilike(product_name)) |
            (OutreachCandidate.website_url.ilike(f"%{domain}%"))
        ).first()
    return q.filter(OutreachCandidate.product_name.ilike(product_name)).first()


def _catalog_tool_info(slug):
    """(name, tagline, website_url) for a visible catalog tool, or None."""
    import json

    ct = CatalogTool.query.filter_by(slug=slug).first()
    if ct is None or ct.hidden:
        return None
    try:
        data = json.loads(ct.data) if ct.data else {}
    except Exception:
        data = {}

    website = str(data.get("link") or "").strip()
    if not website.startswith(("http://", "https://")):
        return None
    return (
        ct.name or str(data.get("name") or slug),
        str(data.get("tagline") or "").strip(),
        website,
    )


def generate_traffic_report_draft(candidate, clicks, days=30):
    """Warm-pitch draft: leads with the tool's real click count, then offers
    the upgrade. Deliberately separate from generate_draft_via_gemini() —
    that prompt sells "get listed" to someone who isn't, which is both the
    wrong offer and an obviously wrong one for a maker who is already in the
    directory and reading their own traffic numbers.
    """
    api_key = _get_gemini_key()
    if not api_key:
        return get_generic_traffic_report_draft(candidate, clicks, days)

    display_name = candidate.founder_name if _looks_like_real_name(candidate.founder_name) else ""

    prompt = f"""
You are Medhansh Pratap Singh, Founder of AI Compass (https://ai-compass.in) - a curated directory of AI tools for students, developers and
creators. You are writing to the maker of a product that is ALREADY LISTED on AI Compass and is ALREADY receiving real referral traffic from it.

This is not a cold pitch. It is a short traffic report with an offer attached. The reader's first reaction should be "oh, this is a real number
about my product", not "this is a sales email". Write like one founder sending another a useful stat they did not know.

FACTS YOU MUST USE (all true, do not alter or embellish):
- Product: {candidate.product_name}
- Their listing sent them {clicks} click-throughs to their site in the last {days} days.
- They are already listed for free. Nothing is being taken away and there is nothing wrong with their listing.

STRUCTURE (follow this order):
1. Opening line: state the number plainly - that {candidate.product_name}'s AI Compass listing sent {clicks} clicks to their site in the last
   {days} days. No preamble, no "I hope this finds you well", no "I came across". The number IS the hook.
2. One sentence of context: those are students and developers who searched for a tool like theirs and chose to click through.
3. The offer, in one short sentence plus at most three bullets: a Fast-Track upgrade ($49.99 one-time) adding featured placement at the top of
   their category, a featured badge on the listing, and a spot in the weekly Student AI Digest.
4. One honest line on why that matters: higher placement means more of the people already browsing that category see them first. Do NOT invent a
   multiplier, a percentage lift, a conversion rate, or any statistic not given above.
5. A single call to action: the link https://ai-compass.in/submit - and explicitly offer replying as the zero-commitment alternative, e.g. "or
   just reply if you want the numbers for a specific month first".
6. Sign-off, then a P.S. restating the click number in one short sentence.

HARD CONSTRAINTS:
- Under 120 words of body text excluding bullets and signature. Must be readable in fifteen seconds.
- Never imply their listing is at risk, will be removed, or is underperforming. The free listing is permanent either way - say so if it fits.
- Never fabricate statistics. The ONLY numbers you may state are {clicks} and {days}.
- No emojis. At most one exclamation mark. No ALL CAPS, no "FREE", no fake urgency or scarcity.
- Output valid JSON with exactly two fields: "subject" and "body". Do NOT include a signature — that is appended separately.
- Subject line: under 50 characters, references the real number or the product by name, reads like a 1:1 email. Good shape:
  "{candidate.product_name}: {clicks} clicks from AI Compass". Never generic corporate phrasing.
- "body" must be clean HTML using ONLY <p>, <b>, <ul>, <li>, <a> tags — no <br>, no style blocks, no tables, no images, no signature block.
- Every <p> must carry style="margin:0 0 14px 0;" and the <ul> must carry style="margin:0 0 16px 0;padding-left:20px;color:#475569;" — this keeps
  spacing consistent across every email client instead of relying on each client's own default paragraph spacing.
- The CTA paragraph must look like this pattern (adjust the wording, keep the styling): <p style="margin:0 0 4px 0;font-size:14.5px;"><a
  href="https://ai-compass.in/submit" style="color:#059669;font-weight:700;text-decoration:none;border-bottom:1.5px solid #059669;">[short CTA verb
  phrase]</a> <span style="color:#64748b;font-size:13.5px;">or just reply if you'd like the numbers for a specific month first.</span></p>
- The P.S. paragraph must use style="margin:16px 0 0 0;font-size:12px;color:#64748b;".

Greet them by first name only if a name is given, otherwise "Hey there,".
- Founder/Maker: {display_name or 'not known - use a neutral greeting'}

Return ONLY the raw JSON object, with no markdown code fences around it.
"""

    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.6}}

    for model in ("gemini-2.0-flash", "gemini-1.5-flash"):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            r = requests.post(url, json=payload, timeout=20)
            if not r.ok:
                log.warning("Gemini (%s) traffic-report draft returned %s", model, r.status_code)
                continue

            candidates_list = r.json().get("candidates", [])
            if not candidates_list:
                continue

            text = candidates_list[0].get("content", {}).get("parts", [])[0].get("text", "").strip()
            if text.startswith("```json"):
                text = text[7:-3].strip()
            elif text.startswith("```"):
                text = text[3:-3].strip()

            import json
            result = json.loads(text)
            subject, body = result.get("subject"), result.get("body")
            if subject and body:
                return subject, _append_unsubscribe_footer(_outreach_wrap(body), candidate.email)
        except Exception as e:
            log.warning("Gemini (%s) traffic-report draft failed: %s", model, e)

    return get_generic_traffic_report_draft(candidate, clicks, days)


def get_generic_traffic_report_draft(candidate, clicks, days=30):
    """Template fallback for when Gemini is unavailable. Same shape as the
    prompted version: number first, offer second, reply invited.
    """
    name = candidate.product_name
    first_name = candidate.founder_name.split(" ")[0] if _looks_like_real_name(candidate.founder_name) else "there"
    subject = f"{name}: {clicks} clicks from AI Compass"[:50]
    inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>
<p style="margin:0 0 14px 0;">Your <a href="https://ai-compass.in" style="color:#059669;font-weight:600;">AI Compass</a> listing sent <b>{clicks} click-throughs</b> to {name} in the last {days} days — students and developers who searched for a tool like yours and chose to click through.</p>
<p style="margin:0 0 14px 0;">That listing stays free permanently. If you want more of the people already browsing your category to see {name} first, the Fast-Track upgrade ($49.99 one-time) adds:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;color:#475569;font-size:13.5px;">
  <li style="margin-bottom:5px;">Featured placement at the top of your category</li>
  <li style="margin-bottom:5px;">A featured badge on your listing</li>
  <li>A spot in the weekly Student AI Digest</li>
</ul>
<p style="margin:0 0 4px 0;font-size:14.5px;"><a href="https://ai-compass.in/submit" style="color:#059669;font-weight:700;text-decoration:none;border-bottom:1.5px solid #059669;">Upgrade {name} &rarr;</a> <span style="color:#64748b;font-size:13.5px;">or just reply if you'd like the numbers for a specific month first.</span></p>
<p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">P.S. Those {clicks} clicks came from the free listing alone — nothing changes if you'd rather leave it as is.</p>"""
    return subject, _append_unsubscribe_footer(_outreach_wrap(inner), candidate.email)


def run_catalog_traffic_campaign(min_clicks=None, days=30, limit=None):
    """Creates outreach candidates from already-listed catalog tools that are
    sending real referral traffic, drafting a traffic report for each.

    Only prepares candidates — it never sends. They land in the same review
    queue as cold ones and clear the same mailbox-verification send gate.
    """
    min_clicks = CATALOG_CAMPAIGN_MIN_CLICKS if min_clicks is None else min_clicks
    limit = CATALOG_CAMPAIGN_MAX_PER_RUN if limit is None else limit

    click_counts = get_catalog_click_counts(days=days, min_clicks=min_clicks)
    if not click_counts:
        log.info("Catalog traffic campaign: no tools with >=%s clicks in %s days.", min_clicks, days)
        return {"created": 0, "skipped_existing": 0, "skipped_no_url": 0, "eligible": 0}

    created = skipped_existing = skipped_no_url = 0

    for slug, clicks in click_counts.items():
        if created >= limit:
            log.info("Catalog traffic campaign: hit per-run limit of %s.", limit)
            break

        catalog_id = f"{CATALOG_CANDIDATE_ID_PREFIX}{slug}"
        if OutreachCandidate.query.filter_by(ph_launch_id=catalog_id).first() is not None:
            skipped_existing += 1
            continue

        info = _catalog_tool_info(slug)
        if info is None:
            skipped_no_url += 1
            continue
        product_name, tagline, website_url = info

        # A tool can already be in the pipeline from cold discovery under a
        # different id. Emailing it twice with two contradictory pitches is
        # exactly what gets a sending domain marked as spam.
        #
        # Deliberately NOT is_duplicate_candidate() — that helper also treats
        # "matches a catalog tool" as duplicate, which is correct for cold
        # discovery (already listed = nothing to pitch) and exactly backwards
        # here, where being in the catalog is the entry requirement. Using it
        # would match every candidate against itself and create zero rows,
        # silently.
        if _existing_candidate_for(product_name, website_url) is not None:
            skipped_existing += 1
            continue

        email, source, score, verification_result = enrich_candidate_email(website_url, "")

        c = OutreachCandidate()
        c.ph_launch_id = catalog_id
        c.product_name = product_name
        c.tagline = tagline
        c.website_url = website_url
        c.founder_name = ""
        c.tone = infer_tone(tagline, "")

        if email:
            c.email = email
            c.email_source = source
            c.confidence_score = score
            c.verification_result = verification_result
            c.verified_at = datetime.now(timezone.utc) if verification_result else None
            c.status = _status_for_email_confidence(score)
        else:
            c.email_source = "none"
            c.confidence_score = 0
            c.status = "no_email_found"

        subject, body = generate_traffic_report_draft(c, clicks, days)
        c.draft_subject = subject
        c.draft_body = body

        try:
            db.session.add(c)
            db.session.commit()
            created += 1
        except Exception as e:
            db.session.rollback()
            log.warning("Catalog traffic campaign: skipping %s (%s): %s", product_name, slug, e)

    log.info(
        "Catalog traffic campaign complete: %s created | %s already in pipeline | %s no usable URL | %s eligible",
        created, skipped_existing, skipped_no_url, len(click_counts)
    )
    return {
        "created": created,
        "skipped_existing": skipped_existing,
        "skipped_no_url": skipped_no_url,
        "eligible": len(click_counts),
    }
