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

    # ── Extract votes — try multiple key names PH uses
    for key in ["votesCount", "votes_count", "votes"]:
        # Find pattern: "slug":"some-slug","...":"...","votesCount":123
        for slug, votes_str in re.findall(rf'"slug":"([^"]+)"[^{{}}]{{0,300}}?"{key}":(\d+)', text):
            if slug in posts_by_slug:
                v = int(votes_str)
                if v > posts_by_slug[slug]["votes"]:
                    posts_by_slug[slug]["votes"] = v

    # Also try extracting votes from near the name
    for name_val, votes_str in re.findall(r'"name":"([^"]+)"[^{}]{0,400}?"votesCount":(\d+)', text):
        for slug, p in posts_by_slug.items():
            if p["name"] == name_val or p["name"].lower() == name_val.lower():
                v = int(votes_str)
                if v > p["votes"]:
                    p["votes"] = v

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
        with ThreadPoolExecutor(max_workers=6) as ex:
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

            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(_fetch_single_story, story_ids))

            for item in results:
                if item and item["ph_launch_id"].replace("hn_", "") not in seen_ids:
                    candidates.append(item)
    except Exception as e:
        log.warning("Firebase Show HN fetch error: %s", e)

    log.info("HN Show feed: %s quality candidates (min %s points, commercial SaaS only)", len(candidates), MIN_HN_POINTS)
    return candidates

# ─── 2. EMAIL DISCOVERY (SCRAPE + GITHUB + RDAP + HUNTER.IO) ─────────────────

# Shared-inbox prefixes — an email here almost never reaches the person who
# can personally approve a $49.99 spend. Ranked below a founder-matching or
# neutral personal address; only used if nothing better turns up.
ROLE_INBOX_PREFIXES = {
    "info", "hello", "hi", "contact", "support", "sales", "admin", "help",
    "team", "noreply", "no-reply", "press", "media", "jobs", "careers",
    "hr", "billing", "office", "general", "enquiries", "inquiries",
    "marketing", "partnerships", "legal", "privacy",
}

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

            text = soup.get_text()
            for m in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
                if is_valid_email(m):
                    emails.add(m)

            # Obfuscated emails (e.g. contact [at] domain.com)
            for prefix, domain in re.findall(r"([a-zA-Z0-9._%+-]+)\s*\[?\s*(?:at|AT|@)\s*\]?\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", text):
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
        # pipeline gets — no need to keep crawling for something better.
        if any(score >= 90 for _, _, score in found):
            best = max(found, key=lambda t: t[2])
            return best[0], best[1]

        # 2. Follow real contact/about/team/support links found in the homepage's own
        # nav/footer — catches sites that don't use the guessed path (e.g. /reach-us,
        # /connect, or a path under a locale prefix like /en/contact).
        domain_base = get_domain_from_url(url)
        base_url = f"https://{domain_base}" if domain_base else None
        followed_paths = set()
        LINK_TEXT_HINTS = ("contact", "about", "team", "support", "help", "reach", "connect", "founder")
        if home_html and base_url:
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

        if not found:
            return None, ""
        best = max(found, key=lambda t: t[2])
        return best[0], best[1]
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
    if not domain:
        return None, ""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=4)
        if not answers:
            return None, ""
    except Exception:
        return None, ""

    # MX exists — return the highest-signal generic prefix; admin verifies via Review.
    candidate = f"{COMMON_INBOX_PREFIXES[0]}@{domain}"
    if is_valid_email(candidate):
        return candidate, "pattern_guess"
    return None, ""

def enrich_candidate_email(website_url, founder_name=""):
    """Comprehensive discovery pipeline combining Scraper, GitHub, RDAP, Hunter.io, and pattern guessing."""
    # 1. Scrape homepage and subpages
    email, source = scrape_website_for_email(website_url, founder_name)
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

    # 5. Pattern guess (MX-validated) — last resort, low confidence, review-gated
    email, source = find_email_via_pattern_guess(website_url)
    if email:
        return email, source or "pattern_guess", 35

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
Write a short, high-converting cold outreach email pitching Fast-Track Sponsored Curation to the founder of a SaaS product. The reader gets dozens of
cold emails a week and decides whether to keep reading within the first line. Your only job is to get them to click the link and pay $49.99 — write
like a founder personally reaching out to another founder, not like a marketing blast.

CONVERSION STRUCTURE (follow this order, this is what makes it work):
1. Opening line (1 sentence): reference ONE concrete, specific detail about their product — its exact tagline, a feature, or the specific problem it
   solves for students/developers. Prove in the first sentence that this isn't a template. Never open with "I came across X" or "I hope this finds
   you well" — those are the two biggest tells of a mass-blasted email and cause instant deletion.
2. Bridge (1 sentence): connect that specific detail to why AI Compass's audience (students/developers actively searching for tools like theirs) is
   exactly who they want finding them.
3. Proof, stated as outcomes not just numbers: "2,000+ monthly active visitors and 100K+ Google search impressions from students actively looking for
   tools like [product]" reads stronger than a bare stat dump — anchor the numbers to THEIR situation.
4. The offer as a tight, scannable bullet list (keep exactly these three, do not add more):
   - Guaranteed 24-hour priority review and frontpage listing
   - Permanent high-authority dofollow SEO backlink to their site
   - Spotlight in the weekly Student AI Digest
5. One line of genuine urgency/personal stake — something true, not fabricated scarcity: e.g. that submissions are reviewed personally within 24
   hours, or that early listings in a category compound in SEO value over time. Never invent fake countdown timers or "only 2 spots left" claims.
6. A single, unambiguous call to action: one sentence + the link https://ai-compass.in/submit. Do not add a second competing CTA.
7. Sign-off, then a P.S. line that restates the strongest single hook (the 24-hour guarantee or the backlink) in one short sentence — P.S. lines get
   read even by skimmers and are proven to lift reply rates.

HARD CONSTRAINTS:
- Body text (excluding the bullet list and signature) must be under 130 words total. Cold emails that take longer than 20 seconds to read get archived
  unread. Cut every sentence that doesn't directly serve steps 1-7 above.
- No emojis anywhere. No exclamation points except at most one, and only if it reads natural, not salesy.
- No spam-trigger phrasing: avoid "FREE", "ACT NOW", "$$$", ALL CAPS words, or more than one "!!!"-style emphasis.
- Never fabricate claims not in the metrics/perks below (no fake testimonials, no fake urgency, no invented statistics).
- Output valid JSON with exactly two fields: "subject" and "body".
- Subject line: under 50 characters, reads like a real 1:1 email a person would send (e.g. mentioning the product by name), never generic corporate
  phrasing like "Exciting Partnership Opportunity" or "Featured Placement Offer".
- The "body" must be clean HTML using <p>, <br>, <b>, <ul>, <li>, and <a> tags only — no <style> blocks, no tables, no images.
- The body's final CTA sentence must link to https://ai-compass.in/submit.
- Always end with exactly this HTML signature block (verbatim, after the P.S. line):
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

If a founder name is given, greet them by first name only (e.g. "Hey Jane," not "Hey Jane Doe,"). If not, use "Hey there,".
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
                return subject, body
        except Exception as e:
            log.warning("Gemini (%s) draft generation failed: %s", model, e)

    return get_generic_draft(candidate)


def get_generic_draft(candidate):
    """Fallback template used when Gemini fails or is unconfigured. Mirrors the
    same conversion structure as the Gemini prompt: specific opening, tight
    offer bullets, one real urgency line, single CTA, P.S. reinforcement.
    """
    name = candidate.product_name
    first_name = candidate.founder_name.split(" ")[0] if candidate.founder_name else "there"
    hook = f"the way {name} handles \"{candidate.tagline}\"" if candidate.tagline else f"what you're building with {name}"
    subject = f"Quick one about {name}"[:50]
    body = f"""<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
<p>Hey {first_name},</p>
<p>I run <a href="https://ai-compass.in" style="color: #059669; font-weight: 600;">AI Compass</a> and just saw {hook} — students and developers searching for exactly this kind of tool are who we send traffic to every day.</p>
<p>AI Compass gets <b>2,000+ monthly active visitors</b> and <b>100K+ Google search impressions</b> from students actively looking for tools like {name}. Here's what Fast-Track Sponsored Curation gets you:</p>
<ul style="margin: 8px 0 16px 0; padding-left: 18px; font-size: 13px; color: #475569;">
  <li>Guaranteed 24-hour priority review and frontpage listing</li>
  <li>Permanent high-authority dofollow SEO backlink to {candidate.website_url or name}</li>
  <li>Spotlight in the weekly Student AI Digest</li>
</ul>
<p>I personally review every fast-track submission within 24 hours of payment — no queue, no waiting.</p>
<p><a href="https://ai-compass.in/submit" style="color: #059669; font-weight: 600; text-decoration: underline;">Submit {name} here</a> to get started ($49.99 one-time).</p>
<div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="font-weight: 600; color: #0f172a; font-size: 14px;">Medhansh Pratap Singh</div>
  <div style="color: #64748b; font-size: 12px; margin-top: 2px;">Founder, <a href="https://ai-compass.in" style="color: #059669; text-decoration: none; font-weight: 500;">AI Compass</a></div>
  <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">medhansh.singh@ai-compass.in • <a href="https://ai-compass.in" style="color: #64748b; text-decoration: underline;">ai-compass.in</a></div>
</div>
<p style="margin-top: 14px; font-size: 12px; color: #64748b;">P.S. The 24-hour review is a real guarantee, not a marketing line — most listings go live same-day.</p>
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
    """Fetches today's ranked PH launches + HN posts, runs quality gates, and saves candidates.
    Contact enrichment is best-effort — products without email are saved as 'no_email_found'
    and shown in admin queue with a '+ Add Email' button.
    """
    ph_launches = fetch_producthunt_launches()
    hn_launches = fetch_shownews_launches()
    launches = ph_launches + hn_launches
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

    for l in launches:
        website_url = l.get("website_url", "")
        product_name = l.get("product_name", "")
        tagline = l.get("tagline", "")
        founder_name = l.get("founder_name", "")
        twitter_from_ph = l.get("twitter_handle", "")
        ph_id = l.get("ph_launch_id", "")

        # Extra HN quality filter: reject blog posts / tutorial posts / game posts
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

        # ── Gate 3: Must have commercial signals (pricing, paid plan, etc.)
        if not is_commercial_saas(website_url):
            skipped_not_commercial += 1
            continue

        # ── Gate 4: Deduplication
        if is_duplicate_candidate(product_name, website_url, ph_id):
            skipped_duplicate += 1
            continue

        # ── Contact enrichment (best-effort, not a hard gate)
        email, source, score = enrich_candidate_email(website_url, founder_name)
        contact_twitter = twitter_from_ph

        # If no Twitter from PH, try scraping the product homepage for social links
        if not contact_twitter:
            contact_twitter = find_twitter_handle_for_product(product_name, website_url)

        # ── Build and save candidate
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
            c.status = "draft_ready"
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

        try:
            db.session.add(c)
            db.session.commit()
            new_candidates_count += 1
        except Exception as e:
            db.session.rollback()
            log.warning("Skipping save for %s (id: %s) due to database error: %s", product_name, ph_id, e)

    log.info(
        "Discovery pipeline complete: %s saved | %s not deployed | %s not relevant | %s not commercial | %s duplicates",
        new_candidates_count, skipped_not_deployed, skipped_not_relevant, skipped_not_commercial, skipped_duplicate
    )
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

# Cold-outreach deliverability guard: caps total successful sends (initial +
# follow-up, combined) per UTC day. A fresh sending domain that jumps from 0
# to hundreds of cold emails overnight gets flagged as spam fast — 30/day is
# a conservative ramp-up rate. Override with OUTREACH_DAILY_SEND_CAP.
DAILY_SEND_CAP = int(os.environ.get("OUTREACH_DAILY_SEND_CAP", "30"))

def sends_remaining_today():
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = OutreachEmailLog.query.filter(
        OutreachEmailLog.status == "success",
        OutreachEmailLog.sent_at >= start_of_day
    ).count()
    return max(0, DAILY_SEND_CAP - sent_today)

def run_automated_followups():
    """Sends simple thread-replies to candidates emailed 5+ days ago without reply."""
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)
    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status == "sent",
        OutreachCandidate.last_status_change_at <= five_days_ago
    ).all()

    remaining = sends_remaining_today()
    sent_count = 0
    for c in candidates:
        if remaining <= 0:
            log.info("Daily send cap (%s) reached — deferring remaining follow-ups to tomorrow.", DAILY_SEND_CAP)
            break
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
            remaining -= 1

    if sent_count > 0:
        db.session.commit()
        log.info("Sent %s automated follow-up emails.", sent_count)

    return sent_count
