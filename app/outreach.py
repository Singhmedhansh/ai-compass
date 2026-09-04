import os
import re
import time
import logging
import threading
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

from app import db
from app.models import OutreachCandidate, OutreachEmailLog, CatalogTool
from app.email_utils import (
    send_email,
    send_email_with_details,
    make_unsubscribe_token,
    make_prefill_token,
    read_prefill_token,
)
from app.send_budget import reserve_send_slots, release_send_slots

log = logging.getLogger(__name__)

# The AI-generated and generic drafts are signed "Medhansh Pratap Singh" and
# read as a personal 1:1 note, but the actual transport `From` defaults to
# no-reply@ (see email_utils.py) — without an explicit Reply-To, a recipient
# who hits Reply sends into a mailbox nobody reads. That's indistinguishable
# from "no one responded." Override with OUTREACH_REPLY_TO if the monitored
# inbox is ever something other than the signature address.
OUTREACH_REPLY_TO = os.environ.get("OUTREACH_REPLY_TO", "medhansh.singh@ai-compass.in")

# The From line, not just Reply-To. Everything else this app sends is
# transactional and correctly goes out as no-reply@ — but cold outreach is a
# personal note, and Gmail sorts on what it can see. A one-to-one email whose
# From line says "no-reply" is read as bulk mail by the classifier before a
# human ever judges the copy, which is most of how these were landing in
# Promotions instead of the inbox. Sending as the same person who signs the
# email is the single largest deliverability lever available here.
#
# Requires the address to exist on the verified sending domain (it is the same
# ai-compass.in domain already verified in Resend, so no new DNS is needed) and
# to be a mailbox someone actually reads — it is now both the From and the
# Reply-To, so replies land there.
OUTREACH_FROM = os.environ.get(
    "OUTREACH_FROM", f"Medhansh Pratap Singh <{OUTREACH_REPLY_TO}>"
)


# ─── CAMPAIGN SCOPING (v2 rework) ────────────────────────────────────────────
# The v1 pipeline sent at a daily RATE. This campaign has a finite LIFETIME
# budget instead: 45 emails, hand-reviewed, aimed at qualified B2B SaaS
# companies with visible budget rather than at whatever launched this morning.
# See the rework brief; the short version is that quality here is a function of
# how few we send, so the cap has to be a total, not a per-day allowance.
CURRENT_CAMPAIGN = os.environ.get("OUTREACH_CAMPAIGN", "q3_qualified_b2b")
CAMPAIGN_SEND_BUDGET = int(os.environ.get("OUTREACH_CAMPAIGN_SEND_BUDGET", "45"))

# The three lead pools, ordered by how much the recipient already knows us.
# They convert at very different rates, so they are tracked separately rather
# than being flattened into one undifferentiated list of "candidates".
POOL_INBOUND = "inbound"   # submitted a tool to us first — warmest
POOL_TRAFFIC = "traffic"   # already listed, and we send them real clicks
POOL_COLD = "cold"         # discovered; no prior contact

VALID_LEAD_POOLS = frozenset({POOL_INBOUND, POOL_TRAFFIC, POOL_COLD})


def _inbound_listing_url(candidate):
    """Public URL of an inbound candidate's OWN listing, if it is already live.

    Every inbound candidate is someone who submitted a tool to us, and in
    practice they are all already listed - the import filters out rejected and
    paid rows, not published ones. So the warm copy cannot assume the listing
    is still pending: telling a founder whose page has been live for weeks
    that it is "in the queue" says we do not know our own site, and it says it
    to the warmest leads in the campaign.

    Returns None when the listing genuinely is not live yet (no catalog row,
    hidden, or still inside its release delay), which is the only case where
    the queue wording is true.
    """
    submission, tool = _candidate_listing(candidate)
    if not _listing_is_live(submission, tool):
        return None  # not listed, hidden, or still inside its release delay

    return f"https://ai-compass.in/tools/{tool.slug}"


def _slugify(value):
    """Same rule as api_routes._slugify, duplicated deliberately.

    app.api_routes already imports from app.outreach, so importing it back
    here is a circular import. Six characters of regex is the cheaper of the
    two problems - but the two MUST agree, so tests/test_outreach_redraft_scope
    asserts they produce identical output.
    """
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _listing_live_at(submission, tool):
    """When this listing actually became public, or None if it has not.

    Deliberately NOT CatalogTool.updated_at: that moves every time the catalog
    re-syncs from JSON, so it would report a listing published in July as
    having gone live this morning and reset the upgrade clock on every sweep.
    The table has no created_at, so the honest stamp is the submission's
    approved_at - the same one sponsorship and post_sale measure paid windows
    from, for the same reason.

    A future visible_at means the page is not reachable yet: nothing to
    upgrade, and nothing to report on.
    """
    if tool is None or getattr(tool, "hidden", False):
        return None

    now = datetime.now(timezone.utc)
    visible_at = _aware(getattr(tool, "visible_at", None))
    if visible_at is not None and visible_at > now:
        return None

    approved_at = None
    if submission is not None:
        approved_at = _aware(getattr(submission, "approved_at", None)) or _aware(
            getattr(submission, "submitted_at", None)
        )

    if visible_at and approved_at:
        return max(visible_at, approved_at)
    return visible_at or approved_at


def _listing_is_live(submission, tool):
    """Whether the page is reachable now — a different question from when.

    _listing_live_at answers "when", and returns None both for a listing that
    is not live AND for one that is live but undateable. Using it to choose
    the COPY conflated the two: a live listing we could not put a date on was
    described as "in the queue for a free listing", to a founder whose page
    has been public for weeks.

    visible_at IS NULL is the ordinary case for a row published at creation.
    It means live, not unknown.
    """
    if tool is None or getattr(tool, "hidden", False) or not getattr(tool, "slug", ""):
        return False
    visible_at = _aware(getattr(tool, "visible_at", None))
    return visible_at is None or visible_at <= datetime.now(timezone.utc)


def _candidate_listing(candidate):
    """(submission, catalog_row) behind this candidate, or (None, None)."""
    ref = getattr(candidate, "ph_launch_id", "") or ""
    if not ref.startswith("inbound:"):
        return None, None
    try:
        submission_id = int(ref.split(":", 1)[1])
    except (ValueError, IndexError):
        return None, None
    try:
        from app.models import CatalogTool, Submission

        submission = db.session.get(Submission, submission_id)
        tool = CatalogTool.query.filter_by(submission_id=submission_id).first()

        # Fall back to the slug when the back-reference was never written.
        #
        # catalog_tools.submission_id is a soft link added long after the
        # first approvals, and admin_approve_submission only started setting
        # it from that point on. Every listing approved before then is live
        # and serving with a NULL submission_id, and the one job that repairs
        # them sits behind a button that only renders when some OTHER listing
        # is stuck - so on a healthy catalogue it can never run.
        #
        # Everything else already compensates: the founder dashboard and the
        # admin listings table both fall back to the slug. Outreach did not,
        # and it failed in the worst possible direction - _inbound_listing_url
        # returned None, the draft took the "not listed yet" branch, and the
        # email told a founder whose page has been live for weeks that it was
        # "in the queue for a free listing". Being the only consumer without
        # the fallback is what turned a missing integer into a wrong claim in
        # front of a customer.
        if tool is None and submission is not None:
            slug = _slugify(getattr(submission, "name", "") or "")
            if slug:
                tool = CatalogTool.query.filter_by(slug=slug).first()

        return submission, tool
    except Exception:
        log.exception("Could not resolve listing for %s", ref)
        return None, None


def upgrade_ready_at(candidate):
    """When this candidate becomes eligible for an upgrade pitch, or None.

    None means the question does not apply - an acquisition (cold) candidate
    has no listing to ripen, and a candidate whose listing cannot be resolved
    is not held back on the strength of a lookup that failed.
    """
    if getattr(candidate, "lead_pool", None) not in ALREADY_LISTED_POOLS:
        return None
    live_at = _listing_live_at(*_candidate_listing(candidate))
    if live_at is None:
        return None
    return live_at + timedelta(days=UPGRADE_MIN_DAYS_LIVE)


def _campaign_copy(candidate) -> dict:
    """The pool-specific FACTS inside the one shared email template.

    Every outreach email — cold pitch, both follow-up stages, and the
    traffic-report upsell — uses one template: same plain shell, same voice,
    same structure, same sign-off. This function supplies the four slots in
    that template whose facts genuinely differ by pool, and exists precisely
    so the template itself stays shared.

    Without it there is no honest way to send one template to three pools:

      * The cold copy says "I would like to list {name} there. It is free" and
        "your listing is already pre-filled, so it takes about 30 seconds".
        Both are false sent to a founder who submitted their tool last week,
        and getting that wrong on the warmest leads in the campaign tells them
        we did not notice they were already a user.
      * The cold copy's closing aside offers the paid tier as an afterthought,
        which is right when the ask was a free listing. For someone already
        listed, the paid tier IS the ask — so leaving the aside in place made
        the email pitch the upgrade twice in consecutive paragraphs, and made
        the follow-up promise "nothing to pay" directly beneath a link to a
        $49 purchase.

    Slots: `offer` (what we are proposing), `cta` (the sentence above the one
    link), `link`, `aside` (the closing qualifier), and `followup_note` (the
    reassurance line the follow-ups close on).

    One skeleton, four variables, three factual variants. If a fourth pool
    appears, add it here — do not fork the template.
    """
    pool = getattr(candidate, "lead_pool", None)
    name = getattr(candidate, "product_name", "your tool") or "your tool"

    # Already listed (or queued): the free listing is done, so the proposal is
    # the placement, and the reassurance is that free stays free.
    if pool in (POOL_INBOUND, POOL_TRAFFIC):
        if pool == POOL_INBOUND:
            listing_url = _inbound_listing_url(candidate)
            if listing_url:
                # The line that makes the rest of the email credible: it names
                # the page, so the founder can check it in one click and see
                # that we know what we already published for them. It also
                # makes the ask unambiguous - the listing is theirs and free,
                # and what is being offered is the placement on top of it.
                offer = (
                    f"You submitted {name} to AI Compass a while back, and it has been "
                    f"live ever since - here is the page: {listing_url}. That listing is "
                    "yours, it stays free, and nothing below changes it. What I am "
                    "writing about is the placement it sits in:"
                )
            else:
                offer = (
                    f"You submitted {name} to AI Compass, which I appreciated - it is "
                    "exactly the kind of tool the directory is for. It is in the queue "
                    "for a free listing either way, and here is what that gets you:"
                )
        else:
            offer = (
                f"{name} is already listed on AI Compass, and the listing is doing real "
                "work. Here is what it is already getting you:"
            )
        return {
            "offer": offer,
            "cta": (
                f"If you want {name} placed above the free listings in its category - a "
                "Sponsored badge and a 30-day featured card with impressions and clicks "
                "reported back - that is $49 one-time, or $79 with a written hands-on "
                "review on its own indexed page:"
            ),
            "link": "https://ai-compass.in/submit",
            "aside": (
                "The free listing is not going anywhere either way. This is only if you "
                "want the placement."
            ),
            "followup_recap": (
                f"Quick recap: {name} is already listed, so this is only about the "
                "placement - above the free listings in its category, with a Sponsored "
                "badge and the impressions and clicks reported back. That is $49 one-time, "
                "or $79 with a written hands-on review:"
            ),
            "followup_note": (
                "And the free listing stays exactly as it is if you would rather leave it."
            ),
        }

    prefill_link, prefilled = _prefill_url(candidate)

    return {
        "offer": (
            "I run AI Compass - a hand-tested directory of AI tools (500+ listed, every one "
            f"manually tested rather than scraped) that students and developers search when "
            f"they are comparing options. I would like to list {name} there. It is free, and "
            "here is what that gets you:"
        ),
        "cta": (
            "Your listing is already pre-filled, so it takes about 30 seconds:"
            if prefilled
            else "It takes about a minute:"
        ),
        "link": prefill_link,
        # Deliberately no price, no tiers, no "there is also a paid option".
        #
        # This email's whole ask is a free listing. Naming $49 here asks a
        # stranger to consider paying before the free listing has shown them a
        # single click, and it makes the free offer read as the opening move in
        # a sale rather than the offer it actually is. The paid conversation
        # has its own email, sent 15 days after their listing is live, when the
        # impressions and clicks are real and the founder can judge it - which
        # is the whole point of UPGRADE_MIN_DAYS_LIVE.
        "aside": (
            "Nothing to pay and nothing to sign up for - the listing is free and stays "
            "free."
        ),
        "followup_recap": (
            f"The offer is just the free listing: {name} on ai-compass.in, permanently, in "
            "front of students and developers searching for tools in your category. "
            + ("It is pre-filled already, so it is about 30 seconds:"
               if prefilled else "It takes about a minute:")
        ),
        "followup_note": "Nothing to pay and nothing to sign up for.",
    }


def _prefill_url(candidate) -> tuple[str, bool]:
    """(url, is_actually_prefilled) for one candidate.

    A cold email that asks a founder to go fill in a form converts far worse
    than one that has already filled it in for them — discovery has their
    product name, URL and tagline on file, so making them retype it is asking
    for effort we don't need. The token carries the candidate id; /submit
    resolves it and renders the form populated, defaulted to the free tier.

    Falls back to the bare /submit URL for an unsaved candidate (no id yet),
    so a draft generated before the row is flushed still contains a link that
    works. The second value is what the copy keys off: it is False for every
    fallback, so no email ever claims a form is filled in when it is not.
    """
    base = "https://ai-compass.in/submit"
    cid = getattr(candidate, "id", None)
    if not cid:
        return base, False
    try:
        token = make_prefill_token(cid)
        # Verify the token survives the trip back before promising anything.
        # /submit fails silently on a bad token (deliberately - see
        # SubmitPage.jsx), so a broken link does not look broken: the founder
        # gets an empty form and an email that told them it would be full.
        # That is worse than never claiming it, because it is the first thing
        # they check.
        if read_prefill_token(token) != int(cid):
            log.warning("Prefill token for candidate %s does not round-trip", cid)
            return base, False
        return f"{base}?c={token}", True
    except Exception:  # noqa: BLE001 — a signing failure must not lose the draft
        log.warning("Could not mint prefill token for candidate %s", cid)
        return base, False

# Bump this whenever the cold-pitch template (generate_draft_via_gemini's
# prompt or get_generic_draft's copy) changes in a way that makes existing
# stored drafts outdated — e.g. a pricing change, a rewritten offer, banned
# language removed. Drafts are generated once and stored (never touched
# again automatically), so this is the only way to tell "generated against
# the current template" apart from "stranded on an old one." See
# OutreachCandidate.draft_template_version and get_stale_draft_candidates()
# below. History: 1 = pre-founding-sponsor rework ($49.99, MAU/impressions
# claims); 2 = founding-sponsor $29.99 rework (2026-08-24/25); 3 = discount
# retired, quotes the $49 list price (2026-08-31); 4 = free-listing-first
# rewrite with a pre-filled submit link and the promotional styling stripped
# out (2026-09-02).
#
# Why 3 exists: the $29.99 "founding-sponsor rate" was quoted to ~264
# founders against a list price that had never sold once - negotiating
# against ourselves in public, on a product whose perks did not yet work.
# The list price is the price. Bumping this marks every stored draft still
# carrying the discount as stale so it is regenerated rather than sent.
# Why 4 exists: every stored draft below it is a paid-first pitch wrapped in
# newsletter styling, sent from no-reply@. That combination is what put these
# in Promotions instead of the inbox, and asking a stranger for $49 in the
# first email is what kept the reply rate near zero. Bumping this marks all of
# them stale so they are regenerated against the free-first template rather
# than sent as they stand.
# 5: inbound copy no longer claims a live listing is "in the queue". Every
# inbound candidate imported so far was ALREADY listed and live - one of them
# had claimed their listing the day before - so the drafts generated under
# version 4 have to be regenerated rather than sent. can_send_candidate()
# refuses a stale draft and the cron's discovery phase refreshes them, so
# bumping this is what actually stops the wrong copy going out.
CURRENT_DRAFT_TEMPLATE_VERSION = 6


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
    """One plain opt-out line, styled like the rest of the message.

    This used to be 11px grey text set apart from the body — which is exactly
    what the footer of a marketing blast looks like, and Gmail reads that
    visual signature as well as any human does. The opt-out itself stays (it
    is a legal requirement and the right thing to offer), but it now reads as
    a sentence a person typed rather than as a mailing-list boilerplate block.
    """
    if not email:
        return html_body
    token = make_unsubscribe_token(email)
    url = f"https://ai-compass.in/unsubscribe?token={token}"
    footer = (
        '<p style="margin:0 0 14px 0;">'
        f"Don't want to hear from me again? <a href=\"{url}\">Unsubscribe</a>."
        '</p>'
    )
    return f"{html_body}\n{footer}"


# Shared shell for every outreach email (initial pitch, traffic-report, and
# both follow-up stages) so a recipient sees one consistent voice across every
# touch.
#
# It used to be a branded card: a 560px centred container, a custom font
# stack, a rule-separated signature block, a green emoji wordmark and a
# button-styled CTA. That is a newsletter, and Gmail files newsletters under
# Promotions — which is where these were landing. The rewrite deliberately
# keeps almost no styling at all: default font, default link colour, plain
# paragraphs. The goal is that the HTML part and the plain-text part are
# nearly indistinguishable, because a real person writing one email to one
# other person does not send a designed document.
#
# Keep it that way. Every visual flourish added back here is paid for in
# inbox placement.

def _outreach_signature_html() -> str:
    """A typed sign-off, not a signature block.

    No logo, no emoji, no colour, no horizontal rule — all of which are
    promotional-mail tells. The address is written out in full because a real
    person's sign-off usually is, and because it gives the reader somewhere to
    reply that is visibly a human mailbox.
    """
    return (
        '<p style="margin:0 0 14px 0;">Thanks,<br>'
        'Medhansh<br>'
        'Founder, AI Compass - ai-compass.in</p>'
    )


def outreach_email_html(candidate) -> str:
    """The stored draft, wrapped in the AI Compass shell, for sending.

    Applied at SEND time rather than at generation on purpose. The stored
    draft_body is the CONTENT — what a human reviewed and approved — and the
    shell is presentation. Baking the shell into the stored draft would mean
    every future change to the brand template invalidated every approved
    draft and forced a regenerate, which un-approves the queue. Kept apart,
    the shell can change freely and nothing needs re-reviewing.

    A rendering failure returns the bare body rather than raising: the email
    is already approved and the shell is decoration. Losing the send over a
    template error would be the expensive half of that trade.
    """
    if not candidate.draft_body:
        return candidate.draft_body
    try:
        from flask import render_template

        return render_template(
            "emails/outreach.html",
            body_html=candidate.draft_body,
            subject_title=candidate.draft_subject or "AI Compass",
        )
    except Exception:  # noqa: BLE001
        log.exception("Outreach shell failed for candidate %s — sending plain.",
                      getattr(candidate, "id", None))
        return candidate.draft_body


def _outreach_wrap(inner_html: str) -> str:
    """Wraps body paragraphs with the sign-off. Intentionally minimal.

    No container div, no width constraint, no font override: the client's own
    default rendering is what a hand-written email looks like.
    """
    return f"{inner_html}\n{_outreach_signature_html()}"


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

# Fit-score pricing sub-classification (see classify_pricing_signal below).
# Deliberately separate from COMMERCIAL_PRICING_SIGNALS above: that list only
# has to prove SOME commercial signal exists (the pass/fail gate in
# is_commercial_saas). These buckets are a finer read of the same page for
# ranking already-qualified candidates — they never affect the gate.
FREEMIUM_SIGNALS = [
    "free trial", "free tier", "free plan", "start for free", "start free",
    "try for free", "free forever", "no credit card required", "forever free",
]
ENTERPRISE_ONLY_SIGNALS = [
    "contact sales", "book a demo", "request a demo", "talk to sales",
    "custom pricing", "contact us for pricing", "get in touch for pricing",
]
SELF_SERVE_PRICE_SIGNALS = ["/mo", "per month", "monthly", "annually", "checkout"]

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

def classify_pricing_text(text_lower: str) -> str:
    """Pure classifier: buckets already-fetched, lowercased homepage text as
    'freemium', 'enterprise_only', or 'unknown' for fit-score ranking.
    Split out from classify_pricing_signal so it's unit-testable without a
    network call."""
    has_freemium = any(sig in text_lower for sig in FREEMIUM_SIGNALS)
    if has_freemium:
        return "freemium"
    has_enterprise_only = any(sig in text_lower for sig in ENTERPRISE_ONLY_SIGNALS)
    has_self_serve_price = any(sig in text_lower for sig in SELF_SERVE_PRICE_SIGNALS)
    if has_enterprise_only and not has_self_serve_price:
        return "enterprise_only"
    return "unknown"

def classify_pricing_signal(website_url):
    """Fetches the homepage (same request shape as is_commercial_saas, kept
    separate so that function's pass/fail gate is untouched — this only
    affects fit-score ranking of candidates that already passed it) and
    buckets the pricing model for compute_fit_score."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AICompassBot/1.0"}
        resp = requests.get(website_url, headers=headers, timeout=2.5, allow_redirects=True)
        if not resp.ok or not resp.text:
            return "unknown"
        return classify_pricing_text(resp.text.lower())
    except Exception:
        return "unknown"

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
        except Exception:
            pass
    return None


def scrape_producthunt_ranked_posts(on_date=None):
    """Scrapes a PH leaderboard page once and extracts ALL needed fields (website,
    votes, twitter) from the embedded JSON — zero additional HTTP requests, no
    rate-limiting risk. Only returns products with 10+ votes that have a real
    resolved website URL.

    `on_date` (a datetime.date) fetches that day's ARCHIVED leaderboard instead
    of today's homepage. This is the whole sourcing change behind the v2
    campaign: every previous discovery source returned products that launched
    this morning, so a company that launched in April and has spent five months
    building revenue was structurally invisible to the pipeline. The target
    profile — shipping for 3-8 months, real pricing tiers, budget to spend — only
    exists in the archive.

    Same page shape, same embedded JSON, different URL. PH serves the dated
    leaderboard at /leaderboard/daily/YYYY/M/D with no zero-padding on the month
    or day.
    """
    if on_date is not None:
        home_url = (
            f"https://www.producthunt.com/leaderboard/daily/"
            f"{on_date.year}/{on_date.month}/{on_date.day}"
        )
    else:
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
            log.warning("PH page %s returned %s", home_url, r.status_code)
            return []
        text = r.text
    except Exception as e:
        log.warning("PH fetch error for %s: %s", home_url, e)
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
        except Exception:
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
                except Exception:
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
            "votes": p["votes"],
            "traction_source": "ph"
        })

    log.info("PH scraper: %s candidates with %s+ votes and real URLs (from %s raw slugs)",
             len(candidates), MIN_PH_VOTES, len(posts_by_slug))
    return candidates


def fetch_producthunt_launches(on_date=None):
    """Fetches PH launches via GraphQL API token (if available) and ranked public HTML scraper.

    `on_date` fetches an archived day's leaderboard instead of today's. The
    GraphQL branch is skipped entirely for a dated fetch: the query above asks
    for `posts(first: 50)` with no date filter, which returns TODAY's posts
    regardless of what was asked for — silently mixing today's launches into an
    archive fetch and defeating the point of asking for a date.
    """
    candidates = []
    seen_slugs = set()

    # 1. API GraphQL fetch if token is configured (live/today only — see above)
    token = os.environ.get("PRODUCTHUNT_API_TOKEN") if on_date is None else None
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
                        "votes": votes,
                        "traction_source": "ph"
                    })
        except Exception as e:
            log.warning("PH GraphQL fetch failed: %s", e)

    # 2. Public ranked HTML scraper — captures Zinley, Capptivo, YourSitee, Zen Whisper, Finamie, etc.
    for wc in scrape_producthunt_ranked_posts(on_date=on_date):
        slug_key = wc["product_name"].lower().replace(" ", "-")
        if slug_key not in seen_slugs:
            seen_slugs.add(slug_key)
            candidates.append(wc)

    log.info(
        "Total PH candidates after combined fetch (%s): %s",
        on_date.isoformat() if on_date else "today", len(candidates),
    )
    return candidates


def fetch_producthunt_archive(start_date, end_date, max_days=None):
    """Walks the PH daily leaderboard across a date range, oldest day first.

    This is the cold pool for the v2 campaign: products that launched 3-8
    months ago, survived, and have had time to build the pricing page and the
    revenue that make them worth pitching. One HTTP request per day in the
    range, so the range is what bounds the cost — a month is ~30 requests.

    Deduplicated by product name across days, because a product that ranks on
    consecutive days appears on both leaderboards.
    """
    from datetime import timedelta

    launches = []
    seen = set()
    day = start_date
    days_fetched = 0

    while day <= end_date:
        if max_days is not None and days_fetched >= max_days:
            break
        try:
            for wc in fetch_producthunt_launches(on_date=day):
                key = wc["product_name"].lower().replace(" ", "-")
                if key in seen:
                    continue
                seen.add(key)
                # Stamp the real launch date. Candidate age is a scored signal
                # in the v2 rubric, and it cannot be recovered later — the
                # leaderboard URL is the only place this date exists.
                wc["launched_on"] = day.isoformat()
                launches.append(wc)
        except Exception as e:  # noqa: BLE001 — one bad day must not end the walk
            log.warning("PH archive fetch failed for %s: %s", day, e)

        days_fetched += 1
        day = day + timedelta(days=1)
        # Courtesy pause; this is a public HTML page and we are walking a month
        # of it in one run.
        time.sleep(1.0)

    log.info(
        "PH archive %s..%s: %s unique launches across %s day(s).",
        start_date, end_date, len(launches), days_fetched,
    )
    return launches

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
                    "votes": points,
                    "traction_source": "hn"
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
                        "votes": points,
                        "traction_source": "hn"
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
# can personally approve a $49 spend. Ranked below a founder-matching or
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

def _score_email_candidate(email, founder_name="", method="text", source=""):
    """Ranks a discovered email by how likely it is to reach an actual
    decision-maker instead of a shared inbox — or, worse, an email that was
    never a real contact address at all.

    `method` matters as much as the address itself: a deliberately-clickable
    mailto: link or a structured meta tag is a strong signal, but a bare
    email-shaped string found anywhere in a page's visible text is the
    weakest one this pipeline produces — a homepage is a marketing page full
    of screenshots, demo data, and example personas (a fictional "Alexandra
    Martinez, alex@jrney.ai" shown in a sample resume preview is exactly
    this shape), so a plain regex match there is not evidence of a real
    contact address. The same regex match on a dedicated contact/about/
    privacy/legal subpage is far more trustworthy — those pages exist
    specifically to state real contact info as prose, which is why the
    penalty below only applies to matches found on the homepage itself.
    """
    local = email.split("@", 1)[0].lower()
    score = 50

    if founder_name:
        name_parts = [p for p in re.split(r"[\s._-]+", founder_name.lower()) if len(p) > 1]
        if any(part in local for part in name_parts):
            score += 40

    if method == "mailto":
        score += 15
    elif method == "meta":
        score += 10
    elif method == "obfuscated":
        score -= 5
    elif method == "text" and source == "web_scraper":
        score -= 30

    is_role_inbox = local in ROLE_INBOX_PREFIXES or any(local.startswith(p) for p in ROLE_INBOX_PREFIXES)
    if is_role_inbox:
        # A role inbox found specifically on a contact/privacy/legal page is
        # the expected, legitimate case — that IS what those addresses are
        # for. Only penalize it as heavily when found somewhere less
        # deliberate (e.g. incidentally in homepage body text).
        score -= 10 if source not in ("web_scraper", "") else 25

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
            """Returns (email, method) pairs — method distinguishes a
            deliberately-clickable mailto: link or structured meta tag from a
            bare email-shaped string anywhere in the page's visible text
            (which includes demo/example content, not just real contact
            info), so the caller can weight them very differently.
            """
            if not html:
                return []
            soup = BeautifulSoup(html, "html.parser")
            seen = set()
            results = []

            def _add(email, method):
                if email not in seen:
                    seen.add(email)
                    results.append((email, method))

            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href.lower().startswith("mailto:"):
                    email = href[7:].split("?")[0].strip()
                    if is_valid_email(email):
                        _add(email, "mailto")

            for meta in soup.find_all("meta"):
                content = meta.get("content", "")
                if "@" in content:
                    for part in content.split():
                        if is_valid_email(part):
                            _add(part, "meta")

            # separator=" " keeps adjacent block-level tags (e.g. </p><p>) from
            # fusing into one run-on token — without it, "...disappear.</p><p>For
            # real..." becomes "disappear.For", which the obfuscation regex below
            # can mistake for a domain.
            text = soup.get_text(separator=" ", strip=True)
            for m in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
                if is_valid_email(m):
                    _add(m, "text")

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
                    _add(cand, "obfuscated")

            return results

        def add_candidates(html, source):
            for email, method in extract_emails_from_html(html):
                found.append((email, source, _score_email_candidate(email, founder_name, method, source)))

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
You are Medhansh, founder of AI Compass (https://ai-compass.in) - a hand-tested directory of AI tools for students, developers and creators.
Write a short cold email to the founder of another product offering them a FREE listing. This is not a sales email. The free listing is the
offer; the paid tiers are mentioned once, near the end, as an aside the reader is free to skip.

Why free-first: a paid pitch to a stranger who has never heard of us converts at almost nothing, and it makes the email read as a solicitation
- which is what gets it deleted or filed away as an ad. A free listing is a genuinely useful thing to be handed, it costs the reader nothing to
accept, and it is what actually gets tools into the directory. Upgrades are sold later, to founders who are already listed and can see what the
placement does for them. Your job is to get a listing accepted, NOT to sell anything today.

STRUCTURE - follow this order exactly:
1. Greeting on its own line: "Hey {first name}," or "Hey there," if no name is known.
2. One sentence of genuine, specific credit: name a concrete detail about their product - its actual tagline, the specific problem it solves,
   or a real feature. This must prove a person looked at the product. Never "I came across X" and never "I hope this finds you well".
3. One sentence: you run AI Compass, what it is (a hand-tested directory - 500+ tools, manually tested, not scraped - that students and
   developers search when comparing options), and that you would like to list their product there. Say plainly that it is free.
4. The line "here's what that gets you:" followed by exactly two bullet paragraphs, each starting with the character "* " :
   * a permanent listing on ai-compass.in, indexed by Google and cited by AI assistants when people ask for tools in their category
   * the traffic proof point, stated exactly once and never rounded or embellished: AI Compass sent 1,689 outbound click-throughs to listed
     tools in the last 30 days - people clicking through to actually try them, not just browsing
5. One sentence saying the listing is already pre-filled so it takes about 30 seconds, then the link on its OWN paragraph, as a bare visible URL.
   Use the exact placeholder PREFILL_URL for it - it is substituted later. The link text must BE the URL, not a word linking to it.
6. One short line making clear there is nothing to pay and nothing to sign up for - the listing is free and stays free.
   NEVER mention a price, a paid tier, a Sponsored badge, a featured card, an upgrade, or any amount of money. This email asks for one
   thing only: a free listing. The paid conversation is a SEPARATE email sent 15 days after their listing is live, when there are real
   impressions and clicks to show them. Putting a price in this email asks a stranger to consider paying before the free listing has
   earned them a single click, and it turns the free offer into the opening move of a sale.
7. The closing line, near-verbatim: "No pressure either way - if it's not useful, just ignore this."

HARD CONSTRAINTS:
- Under 150 words total excluding the sign-off. Every sentence must earn its place.
- Write like one founder emailing another. Plain sentences. No marketing register, no "excited to", no "reach out", no "circle back".
- No emojis. At most one exclamation point, and only if genuinely natural.
- Exactly ONE link in the whole email: the PREFILL_URL placeholder. Do not link the words "AI Compass", do not link ai-compass.in anywhere else,
  do not add a second call to action. Multiple links are a bulk-mail signal and split the reader's attention.
- Never fabricate anything. The only metric you may cite is the 1,689 click-throughs in 30 days. Never say "monthly active visitors",
  never cite an impressions or visitor count, never invent testimonials, urgency, or slot counts.
- Never state or imply a price, a discount, a paid tier or an upgrade anywhere in this email. Not in the bullets, not as an aside, not
  in the closing line.
- Do NOT write a sign-off, signature, or "Thanks," line - that is appended separately. End at the "no pressure" line.
- Subject line: under 50 characters, lowercase-ish and specific, the way a real person titles a one-to-one email. Good: "About {Product}",
  "{Product} on AI Compass", "quick one about {Product}". Never corporate phrasing like "Partnership Opportunity" or "Featured Placement".

FORMATTING - this email must look like plain text, because a designed email gets filed as an advertisement:
- The "body" is HTML using ONLY <p> and <a> tags. No <ul>, no <li>, no <b>, no <br>, no <div>, no <style>, no tables, no images, no buttons.
- Every single <p> must carry exactly style="margin:0 0 14px 0;" and nothing else. No colours, no font sizes, no font families, no borders.
- The bullets in step 4 are ordinary <p> paragraphs whose text begins with "* ". They are not a list element.
- The link paragraph is exactly: <p style="margin:0 0 14px 0;"><a href="PREFILL_URL">PREFILL_URL</a></p>
- Output valid JSON with exactly two fields: "subject" and "body". Return ONLY the raw JSON object - no markdown fences, no commentary.
"""

    # A raw HN/PH/GitHub username (e.g. "geekamongus") is not a name to greet
    # a stranger by — it reads as obviously bot-scraped. Only pass through an
    # actual "First Last" style name; otherwise let the model use a neutral
    # greeting instead of parroting a handle back at someone.
    display_name = candidate.founder_name if _looks_like_real_name(candidate.founder_name) else ""

    prompt = f"""\n{system_prompt}\n\nWrite an outreach email for this candidate:\n- Product Name: {candidate.product_name}\n- Tagline: {candidate.tagline}\n- Website: {candidate.website_url}\n- Founder/Maker: {display_name or 'not known — use a neutral greeting'}\n- Tone to use: {candidate.tone}\n\nIf a founder name is given, greet them by first name only (e.g. "Hey Jane," not "Hey Jane Doe,"). If not known, use "Hey there,".\n"""

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
                # The model writes the literal token PREFILL_URL rather than a
                # real link. Two reasons: the candidate may not have an id yet
                # when the draft is generated, and a signed token pasted into
                # a prompt is something an LLM will happily "tidy up" or
                # truncate. Substituting here means the URL in the sent email
                # is always one this process minted.
                link, prefilled = _prefill_url(candidate)
                if not prefilled:
                    # The prompt instructs the model to write "your listing is
                    # already pre-filled". When the token will not round-trip
                    # that sentence is false, and there is no reliable way to
                    # edit a claim back out of prose an LLM wrote. The template
                    # below already phrases both cases correctly, so use it
                    # rather than send a promise the link cannot keep.
                    log.info(
                        "Candidate %s has no working prefill link — using the "
                        "template draft so the copy matches the link.",
                        getattr(candidate, "id", None),
                    )
                    return get_generic_draft(candidate)
                body = body.replace("PREFILL_URL", link)
                return subject, _append_unsubscribe_footer(_outreach_wrap(body), candidate.email)
        except Exception as e:
            log.warning("Gemini (%s) draft generation failed: %s", model, e)

    return get_generic_draft(candidate)


def get_generic_draft(candidate):
    """Fallback template used when Gemini fails or is unconfigured.

    One skeleton for every lead pool: specific credit, the offer, two proof
    bullets, a single link, and an explicit permission to ignore the email.
    Pricing appears only for pools that are already listed — the cold pitch
    names no price at all. The two slots whose facts change by pool
    come from _campaign_copy(); everything else is identical for everyone we
    write to, deliberately. Plain paragraphs only - see the note on
    _outreach_wrap for why nothing here is styled.
    """
    name = candidate.product_name
    first_name = candidate.founder_name.split(" ")[0] if _looks_like_real_name(candidate.founder_name) else "there"
    copy = _campaign_copy(candidate)
    link = copy["link"]
    tagline = (candidate.tagline or "").strip().rstrip(".")

    # The tagline is quoted rather than spliced into the sentence. Taglines
    # come in every grammatical shape there is ("Build X without Y", "The
    # fastest Z", "For teams who..."), and inlining them produced sentences
    # that read as machine-assembled - the exact impression this email exists
    # to avoid. Quoting is grammatical whatever the shape.
    credit = (
        f'Nice work on {name} - "{tagline}" is a genuinely useful thing to have built.'
        if tagline else f"Nice work on {name}."
    )

    subject = f"About {name}"[:50]
    inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>\n<p style="margin:0 0 14px 0;">{credit}</p>\n<p style="margin:0 0 14px 0;">{copy['offer']}</p>\n<p style="margin:0 0 14px 0;">* A permanent listing on ai-compass.in, indexed by Google and cited by AI assistants when people ask for tools in your category.</p>\n<p style="margin:0 0 14px 0;">* Real traffic, not a vanity number: AI Compass sent 1,689 outbound click-throughs to listed tools in the last 30 days - people clicking through to actually try them, not just browsing.</p>\n<p style="margin:0 0 14px 0;">{copy['cta']}</p>\n<p style="margin:0 0 14px 0;"><a href="{link}">{link}</a></p>\n<p style="margin:0 0 14px 0;">{copy['aside']}</p>\n<p style="margin:0 0 14px 0;">No pressure either way - if it is not useful, just ignore this.</p>"""
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


# ─── FIT SCORE (likelihood-to-convert ranking, layered on top of the
# existing relevance/is_commercial_saas filter — see compute_fit_score) ────
#
# Terms intentionally left out as documented no-ops, because the pipeline
# doesn't yet capture a real signal for them (see Step 1 audit in the
# founder-fit-score work):
#   - team size (<=3)   — no reliable source; "I built"/"we built" phrasing
#     is exactly the weak text heuristic that misfires often, so it's
#     skipped rather than guessed.
#   - launch recency    — only `created_at` (when WE discovered it) exists;
#     that's not the product's actual launch date.
#   - category match    — candidates have no assigned category; matching
#     tagline text against catalog category names would be another weak
#     guess, not a real signal.
HN_HIGH_POINTS_THRESHOLD = 150
PH_HIGH_VOTES_THRESHOLD = 300

def compute_fit_score(email_source=None, pricing_signal="unknown", traction_score=None, traction_source=None):
    """Pure function: estimates likelihood-to-convert for a candidate that
    has ALREADY passed the relevance + is_commercial_saas filters. Only
    ranks who gets picked first from that pool — never a replacement for
    those gates.

    traction_source must be 'ph' or 'hn' for the traction term to apply
    (the two sources use different score scales, so an unlabeled number
    can't be judged against either threshold).
    """
    score = 0

    if pricing_signal == "freemium":
        score += 2
    elif pricing_signal == "enterprise_only":
        score -= 3

    # A founder-attributable public profile was the actual source of the
    # discovered email (not just "a name string exists" — GitHub/HN profile
    # strategies only return an email when they found and confirmed one).
    # find_email_via_github returns "github_profile" or "github_commit"
    # (never a bare "github"); hn_profile strategy always returns "hn_profile".
    if email_source in ("github_profile", "github_commit", "hn_profile"):
        score += 1

    if traction_score is not None:
        if traction_source == "ph" and traction_score > PH_HIGH_VOTES_THRESHOLD:
            score -= 2
        elif traction_source == "hn" and traction_score > HN_HIGH_POINTS_THRESHOLD:
            score -= 2

    return score


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
    for launch in launches:
        website_url = launch.get("website_url", "")
        product_name = launch.get("product_name", "")
        tagline = launch.get("tagline", "")
        ph_id = launch.get("ph_launch_id", "")

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

        survivors.append(launch)

    def _process(launch):
        website_url = launch.get("website_url", "")
        product_name = launch.get("product_name", "")
        tagline = launch.get("tagline", "")
        founder_name = launch.get("founder_name", "")
        ph_id = launch.get("ph_launch_id", "")

        # ── Gate 4: Must have commercial signals (pricing, paid plan, etc.)
        if not is_commercial_saas(website_url):
            return None

        # ── Contact enrichment (best-effort, not a hard gate)
        email, source, score, verification_result = enrich_candidate_email(website_url, founder_name)
        contact_twitter = launch.get("twitter_handle", "")
        if not contact_twitter:
            contact_twitter = find_twitter_handle_for_product(product_name, website_url)

        c = OutreachCandidate()
        c.campaign = CURRENT_CAMPAIGN
        c.lead_pool = POOL_COLD
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

        c.fit_score = compute_fit_score(
            email_source=c.email_source,
            pricing_signal=classify_pricing_signal(website_url),
            traction_score=launch.get("votes"),
            traction_source=launch.get("traction_source"),
        )

        subject, body = generate_draft_via_gemini(c)
        c.draft_subject = subject
        c.draft_body = body
        c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
        return c

    # Same concurrency cap used elsewhere in this file for this exact
    # reason (regenerate_all_drafts, PH domain-guessing) — this free-tier
    # instance has a single shared vCPU, so more workers here would just
    # starve the process's ability to answer other requests.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_process, launch) for launch in survivors]
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
            c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
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

# Minimum confidence_score required to send — enforced as a hard gate (not
# just a UI hint), since a bounce against an unverified guess costs sender
# reputation, not just a wasted lead.
#
# This is a FLOOR, not the real gate: the real gate is SENDABLE_VERIFICATION_
# RESULTS below (an address must carry a genuine mailbox-verification verdict
# that isn't a hard fail). The floor exists only to reject heuristic-only
# guesses. It has to sit at/under the lowest sendable verdict's score —
# VERIFICATION_RESULT_CONFIDENCE['unknown'] == 50 — or the free SMTP prober's
# perfectly-legitimate 'catchall' (60) / 'unknown' (50) results (which is what
# Microsoft 365 / Google Workspace domains almost always return) would never
# clear it and NOTHING would ever send. It was previously 80, which silently
# blocked every verdict except 'valid' — the cause of "outreach emails aren't
# going out". Raise OUTREACH_CONFIDENCE_SEND_THRESHOLD to 60 to exclude
# 'unknown', or 95 to require a clean 'valid'.
CONFIDENCE_SEND_THRESHOLD = int(os.environ.get("OUTREACH_CONFIDENCE_SEND_THRESHOLD", "50"))

# A candidate may be sent to only if its verification_result is one of these:
# a real verdict from NeverBounce or the free SMTP prober that isn't a
# confirmed bad address. 'catchall'/'unknown' are inconclusive but not wrong;
# 'manual_override' is an admin vouching for an address they confirmed out of
# band (see update_candidate in outreach_routes.py). 'invalid'/'disposable'
# are confirmed bad and never sendable. A None verification_result (heuristic
# score only, no real check) is also blocked.
SENDABLE_VERIFICATION_RESULTS = frozenset({"valid", "catchall", "unknown", "manual_override"})

# Manual send (send_candidate_email / bulk_send_candidates) must refuse these
# statuses outright: the recipient opted out, already replied, already bounced,
# was rejected, or was already contacted. The automated senders filter on
# status up front so they never see these; the manual routes need an explicit
# guard.
NON_SENDABLE_STATUSES = frozenset({"unsubscribed", "bounced", "replied", "rejected", "sent"})

# The free SMTP verifier runs on GitHub Actions (Render blocks outbound SMTP).
# When that workflow isn't producing verdicts, every discovered candidate sits
# in draft_ready with verification_result=None forever and nothing sends. With
# this ON (the default), such a candidate is still sendable when its heuristic
# confidence clears CONFIDENCE_SEND_THRESHOLD *and* a live DNS check confirms
# the domain can still receive mail (MX, or an A record) right now — the stored
# address already passed exactly this check when it was discovered
# (enrich_candidate_email drops anything that doesn't), so this just re-confirms
# it hasn't gone dead since. It is NOT a mailbox check: a real SMTP/NeverBounce
# verdict is still strictly better and always wins. Set
# OUTREACH_ALLOW_UNVERIFIED_SEND=0 to require a real verdict again.
ALLOW_UNVERIFIED_SEND = str(
    os.environ.get("OUTREACH_ALLOW_UNVERIFIED_SEND", "1")
).strip().lower() in ("1", "true", "yes")


STATUS_APPROVED = "approved"

# Statuses whose stored draft may still be rewritten.
#
# 'approved' belongs here and its absence was a deadlock. Both redraft paths
# used to scope to draft_ready, while can_send_candidate() refuses to send a
# draft below CURRENT_DRAFT_TEMPLATE_VERSION - so an approved candidate
# holding stale copy could neither be refreshed nor sent, and no cron tick
# would ever free it. Approving before the bump landed was enough to strand a
# row for good.
#
# The statuses deliberately NOT here are the terminal ones (sent, replied,
# bounced, rejected, unsubscribed): those already went out, or never will, and
# rewriting them edits history rather than a pending send.
REDRAFTABLE_STATUSES = ("draft_ready", "no_email_found", STATUS_APPROVED)

# ─── CAMPAIGN CADENCE AND PACING ─────────────────────────────────────────────
#
# The v1 cadence is 5 days to the first bump and 5 more to the second. Against
# a fixed deadline that does not fit: anything sent after the 5th never
# receives its second follow-up before the 15th, and the second touch is where
# most cold replies come from. The campaign compresses to 3 days and 4 more —
# 7 days end to end — so a candidate emailed on the 6th still completes its
# whole sequence on the 13th, inside the deadline.
#
# Not compressed further. Two emails three days apart is a follow-up; two
# emails one day apart is pestering someone who has already decided.
CAMPAIGN_FOLLOWUP_STAGE1_DAYS = int(os.environ.get("OUTREACH_CAMPAIGN_FOLLOWUP_1_DAYS", "3"))
CAMPAIGN_FOLLOWUP_STAGE2_DAYS = int(os.environ.get("OUTREACH_CAMPAIGN_FOLLOWUP_2_DAYS", "4"))

LEGACY_FOLLOWUP_STAGE1_DAYS = 5
LEGACY_FOLLOWUP_STAGE2_DAYS = 5

# How many campaign emails may leave in one day, separate from the lifetime 45
# and from the account-wide DAILY_SEND_CAP.
#
# This is a deliverability limit, not a budget one. Outreach now sends as
# medhansh.singh@ — a From identity with no sending history at all — and
# putting 45 cold emails through a cold identity in one or two bursts is the
# shape of a spam run. A steady 10 a day builds the reputation that gets the
# later ones delivered, and 45 at 10/day still fits comfortably inside the
# campaign window.
# Days a listing must have been LIVE before we ask its founder to upgrade.
#
# The campaign runs two tracks and they are not the same conversation:
#
#   ACQUISITION (cold)  - the tool is not listed. The ask is "let me list it",
#                         it is free, and there is nothing to wait for.
#   UPGRADE (inbound /   - the tool is already live. The ask is placement ON
#   traffic)              TOP of a listing they already have.
#
# An upgrade pitch sent the day after a listing goes live has nothing behind
# it. There are no impressions to report, no clicks to point at, and the
# founder has had no chance to see whether the listing does anything for them
# - so the email is asking them to pay for more of something they cannot yet
# judge. Fifteen days in, the numbers exist and the ask is evidenced.
#
# It is also the difference between a directory following up and a directory
# upselling on contact. The first is a relationship; the second is why most
# directory email gets ignored.
UPGRADE_MIN_DAYS_LIVE = int(os.environ.get("OUTREACH_UPGRADE_MIN_DAYS_LIVE", "15"))

# The pools whose ask is an upgrade rather than a listing. Both are already
# published, so both wait out the window above.
ALREADY_LISTED_POOLS = (POOL_INBOUND, POOL_TRAFFIC)

CAMPAIGN_DAILY_SEND_MAX = int(os.environ.get("OUTREACH_CAMPAIGN_DAILY_MAX", "10"))


def _followup_delay_days(candidate, stage):
    """How long to wait before this candidate's stage-N bump."""
    if getattr(candidate, "campaign", None):
        return (CAMPAIGN_FOLLOWUP_STAGE1_DAYS if stage == 1
                else CAMPAIGN_FOLLOWUP_STAGE2_DAYS)
    return (LEGACY_FOLLOWUP_STAGE1_DAYS if stage == 1
            else LEGACY_FOLLOWUP_STAGE2_DAYS)


def campaign_sends_today(campaign=None):
    """Campaign emails successfully sent inside the current send window."""
    campaign = campaign or CURRENT_CAMPAIGN
    return db.session.query(db.func.count(OutreachEmailLog.id)).join(
        OutreachCandidate, OutreachEmailLog.candidate_id == OutreachCandidate.id
    ).filter(
        OutreachCandidate.campaign == campaign,
        OutreachEmailLog.status == "success",
        OutreachEmailLog.sent_at >= _current_send_window_start(),
    ).scalar() or 0


def campaign_daily_remaining(campaign=None):
    return max(0, CAMPAIGN_DAILY_SEND_MAX - campaign_sends_today(campaign))



def campaign_sends_used(campaign=None):
    """How many of the campaign's finite budget have actually left the building.

    Counted from the email log, not from candidate status: a candidate that was
    emailed and has since moved to 'replied' or 'bounced' still spent one of
    the 45. Counting statuses would quietly hand the budget back every time
    someone answered.
    """
    campaign = campaign or CURRENT_CAMPAIGN
    return db.session.query(db.func.count(OutreachEmailLog.id)).join(
        OutreachCandidate, OutreachEmailLog.candidate_id == OutreachCandidate.id
    ).filter(
        OutreachCandidate.campaign == campaign,
        OutreachEmailLog.status == "success",
    ).scalar() or 0


def campaign_sends_remaining(campaign=None):
    return max(0, CAMPAIGN_SEND_BUDGET - campaign_sends_used(campaign))


def can_send_candidate(c, for_approval=False) -> tuple[bool, str | None]:
    """Single source of truth for 'is this candidate allowed to be emailed
    right now'. Returns (ok, reason_if_not). Used by BOTH the manual send
    routes and run_automated_initial_sends()."""
    if not c.email:
        return False, "Email is missing for candidate"
    if not c.draft_subject or not c.draft_body:
        return False, "Draft subject and body are required to send"

    # A stored draft written against an older template is not sendable. Drafts
    # are generated once and kept, so bumping CURRENT_DRAFT_TEMPLATE_VERSION on
    # its own changes nothing about what actually goes out — every candidate
    # drafted before the bump would still be sent carrying the old copy. That
    # is not a cosmetic problem: version 3 and below open by asking a stranger
    # for $49 in newsletter styling, which is the exact email this rewrite
    # exists to stop sending.
    #
    # refresh_stale_drafts() (run in the cron's discovery phase) regenerates
    # these, so the block clears itself without anyone clicking anything.
    version = c.draft_template_version or 0
    if version < CURRENT_DRAFT_TEMPLATE_VERSION:
        return False, (
            f"Draft was written against template v{version or 'pre-versioning'}, "
            f"current is v{CURRENT_DRAFT_TEMPLATE_VERSION}. It will be regenerated "
            "on the next discovery run — or use Regenerate Drafts to do it now."
        )
    if c.status in NON_SENDABLE_STATUSES:
        return False, f"Candidate status is '{c.status}' — not eligible to send."

    # ── Campaign candidates are hand-reviewed, and the budget is finite ──
    #
    # The v1 pipeline sent at a daily rate and auto-dispatched anything that
    # reached 'draft_ready'. This campaign is 45 emails to companies chosen
    # one at a time, so an automated run must never be able to spend that
    # budget on its own: a discovery pass over the Product Hunt archive can
    # produce hundreds of drafts, and under the v1 rules the next cron tick
    # would start emailing them unreviewed. That is the exact failure the
    # rework exists to prevent, and it is worth far more than the sends it
    # costs to block it.
    #
    # 'approved' is set by a human in the admin console. Everything else in
    # the campaign stays put no matter how good its score looks.
    if c.campaign:
        # `for_approval` is the approval endpoint asking "would this send once
        # approved?" — so it skips the two conditions that are about TIMING
        # rather than about this candidate being sendable at all.
        #
        # It must not mutate the row to ask. Setting the status to approved and
        # restoring it on failure looked equivalent and was not: the checks
        # below run their own queries, and SQLAlchemy's autoflush wrote the
        # optimistic 'approved' to the database mid-check, so a REFUSED
        # approval could leave the row sitting in the approved queue.
        if not for_approval and c.status != STATUS_APPROVED:
            return False, (
                f"Campaign '{c.campaign}' candidates are sent only after review. "
                f"Status is '{c.status}' — approve it in the Outreach console first."
            )
        if campaign_sends_remaining(c.campaign) <= 0:
            return False, (
                f"Campaign '{c.campaign}' has spent its full budget of "
                f"{CAMPAIGN_SEND_BUDGET} emails. Nothing further sends under it."
            )
        # Today's pacing is not a reason to refuse an APPROVAL. Approving
        # twenty candidates and letting them go out over two days is exactly
        # how the campaign is meant to run; blocking the eleventh approval
        # because ten have already sent would make the queue unusable after
        # lunch.
        if not for_approval and campaign_daily_remaining(c.campaign) <= 0:
            return False, (
                f"Campaign '{c.campaign}' has sent its {CAMPAIGN_DAILY_SEND_MAX} "
                "for today. Outreach goes out from a From address with no "
                "sending history, and pushing the whole batch through it in one "
                "burst is the shape of a spam run — the rest go tomorrow."
            )

        # ── An unresolved listing is a refusal, not a guess ──────────────
        #
        # The already-listed pools have two possible openings: "your listing
        # has been live since ..." and "it is in the queue for a free
        # listing". Which one goes out is decided by a lookup, and when that
        # lookup fails the copy silently takes the second branch - telling a
        # founder whose page has been public for weeks that we have not
        # listed them yet. That is the single worst sentence this campaign
        # can send: it is checkable, it is wrong, and it is the first thing
        # they will check.
        #
        # Approval is still allowed (for_approval skips this) so the queue
        # stays reviewable; only the send is held. Regenerating the draft
        # after the listing resolves clears it.
        if not for_approval and c.lead_pool in ALREADY_LISTED_POOLS:
            submission, tool = _candidate_listing(c)
            # "In the queue for a free listing" is TRUE for a submission that
            # is genuinely still pending — the inbound import deliberately
            # includes those. So an unresolved listing is only a problem when
            # the queue story cannot be the explanation: either the submission
            # is already approved (so a live page should exist and something is
            # wrong with the link), or we cannot find the submission at all and
            # therefore cannot tell which sentence is true.
            sub_status = getattr(submission, "status", None)
            unverifiable = submission is None or sub_status == "approved"
            if unverifiable and not _listing_is_live(submission, tool):
                return False, (
                    f"{c.product_name} is in the '{c.lead_pool}' pool, which pitches an "
                    "upgrade to an existing listing, but its listing could not be "
                    "resolved. The draft therefore says the tool is still 'in the queue "
                    "for a free listing' — which is wrong if the page is already live, "
                    "and is the first thing the founder will check. Fix the listing link "
                    "(Admin > Listings > Publish all now relinks orphaned rows), then "
                    "regenerate this draft."
                )

        # ── An upgrade pitch waits until the listing has something to show ──
        #
        # Like the pacing gate above this is about TIMING, not about whether
        # the candidate is sendable, so approving is still allowed - the
        # operator queues them up and each goes out on the day it ripens.
        # Blocking the approval instead would make the review queue unusable:
        # every inbound candidate would sit un-approvable for a fortnight.
        if not for_approval:
            ready_at = upgrade_ready_at(c)
            if ready_at is not None and ready_at > datetime.now(timezone.utc):
                days = max(0, (ready_at - datetime.now(timezone.utc)).days)
                return False, (
                    f"{c.product_name}'s listing has not been live for "
                    f"{UPGRADE_MIN_DAYS_LIVE} days yet — an upgrade pitch sent now "
                    "has no impressions or clicks behind it, so it is asking them "
                    "to pay for more of something they cannot judge yet. Eligible "
                    f"{ready_at.date().isoformat()} (about {days} day"
                    f"{'' if days == 1 else 's'} away)."
                )

    if (c.confidence_score or 0) < CONFIDENCE_SEND_THRESHOLD:
        return False, (
            f"Email confidence ({c.confidence_score or 0}%) is below the "
            f"{CONFIDENCE_SEND_THRESHOLD}% floor. Re-verify (Re-Enrich) or mark "
            "it manually verified."
        )

    if c.verification_result:
        if c.verification_result not in SENDABLE_VERIFICATION_RESULTS:
            return False, (
                f"Address was verified as '{c.verification_result}' — confirmed "
                "undeliverable, so it can't be sent."
            )
        return True, None

    # No real verdict on file.
    if not ALLOW_UNVERIFIED_SEND:
        return False, (
            "This address hasn't been mailbox-verified yet (only a heuristic "
            "confidence score). Re-Enrich to run the free SMTP verifier, or "
            "mark it manually verified first."
        )
    domain = c.email.split("@", 1)[-1] if "@" in c.email else ""
    if not domain or not _domain_has_mail_capability(domain):
        return False, (
            f"Email domain '{domain or c.email}' has no working mail server "
            "(no MX/A record) — sending would just bounce."
        )
    return True, None

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
    email. Both stages stay free-first for the same reason the opening email
    does: the ask is a 30-second free listing, and re-pitching a $49 upgrade
    to someone who has not replied once is how a follow-up becomes spam.
    Stage 2 says plainly that it is the final message, which is both honest
    and the thing most likely to get a yes/no out of someone.

    Same template as the opening email, and the same _campaign_copy() slot for
    the one line whose facts differ by pool - so a founder who already
    submitted their tool is never chased to "get listed".

    The plain-text half is written by hand rather than derived, because these
    are the messages most likely to be read on a phone in a text-only preview.
    """
    first_name = c.founder_name.split(" ")[0] if _looks_like_real_name(c.founder_name) else "there"
    copy = _campaign_copy(c)
    link = copy["link"]
    sign_off = "Thanks,\nMedhansh\nFounder, AI Compass - ai-compass.in"

    if stage == 1:
        subject = f"Re: {c.draft_subject}"
        inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>\n<p style="margin:0 0 14px 0;">Following up once in case this got buried - no worries at all if now is not the right time.</p>\n<p style="margin:0 0 14px 0;">{copy['followup_recap']}</p>\n<p style="margin:0 0 14px 0;"><a href="{link}">{link}</a></p>\n<p style="margin:0 0 14px 0;">{copy['followup_note']}</p>"""
        text = (
            f"Hey {first_name},\n\n"
            f"Following up once in case this got buried - no worries at all if now is not the right time.\n\n"
            f"{copy['followup_recap']}\n\n{link}\n\n"
            f"{copy['followup_note']}\n\n{sign_off}"
        )
    else:
        subject = f"Re: {c.draft_subject}"
        inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>\n<p style="margin:0 0 14px 0;">Last email from me on this, so I am not cluttering your inbox.</p>\n<p style="margin:0 0 14px 0;">If you ever want to pick this up, nothing expires. {copy['cta']}</p>\n<p style="margin:0 0 14px 0;"><a href="{link}">{link}</a></p>\n<p style="margin:0 0 14px 0;">Either way - nice work on {c.product_name}, and good luck with it.</p>"""
        text = (
            f"Hey {first_name},\n\n"
            f"Last email from me on this, so I am not cluttering your inbox.\n\n"
            f"If you ever want to pick this up, nothing expires. {copy['cta']}\n\n{link}\n\n"
            f"Either way - nice work on {c.product_name}, and good luck with it.\n\n{sign_off}"
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
            sender=OUTREACH_FROM,
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
    # Query on the SHORTEST cadence in play, then filter each candidate against
    # its own. A single 5-day cutoff would silently hold campaign candidates to
    # the legacy schedule and push their last touch past the deadline.
    now = datetime.now(timezone.utc)
    shortest = min(
        CAMPAIGN_FOLLOWUP_STAGE1_DAYS, CAMPAIGN_FOLLOWUP_STAGE2_DAYS,
        LEGACY_FOLLOWUP_STAGE1_DAYS, LEGACY_FOLLOWUP_STAGE2_DAYS,
    )
    earliest = now - timedelta(days=shortest)

    def _due(candidate, stage):
        # last_status_change_at comes back NAIVE from SQLite and tz-aware from
        # Postgres. The v1 code never noticed because its cutoff was applied in
        # SQL; comparing in Python does, and a naive/aware comparison raises
        # TypeError mid-sweep — which would stop every remaining follow-up.
        stamp = candidate.last_status_change_at
        if stamp is None:
            return False
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp <= now - timedelta(days=_followup_delay_days(candidate, stage))

    stage1_candidates = [
        c for c in OutreachCandidate.query.filter(
            OutreachCandidate.status == "sent",
            OutreachCandidate.last_status_change_at <= earliest,
        ).all() if _due(c, 1)
    ]
    stage2_candidates = [
        c for c in OutreachCandidate.query.filter(
            OutreachCandidate.status == "followed_up",
            OutreachCandidate.last_status_change_at <= earliest,
        ).all() if _due(c, 2)
    ]

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

        # Shared Resend daily budget (outreach + digest + manual all draw from
        # one 100/day account cap). Reserve per-send so a failure can hand the
        # slot straight back.
        if reserve_send_slots(1, requester="outreach-followup")["granted"] == 0:
            log.info("Shared send budget exhausted — deferring remaining follow-ups to next run.")
            break

        if _send_followup(c, stage, next_status):
            sent_count += 1
            remaining -= 1
        else:
            release_send_slots(1, requester="outreach-followup")

    if sent_count > 0:
        db.session.commit()
        log.info("Sent %s automated follow-up emails.", sent_count)

    return sent_count


def run_automated_initial_sends():
    """Sends the first outreach email for every draft_ready candidate that has
    already cleared the send gate — no admin click required.

    This exists so a ready draft doesn't sit untouched until someone opens the
    outreach dashboard; the cron tick is now the thing that actually sends it.
    It does NOT loosen anything that protects sender reputation: the same
    CONFIDENCE_SEND_THRESHOLD + real verification_result gate that
    send_candidate_email/bulk_send_candidates enforce still applies here, and
    every send still draws from the one shared DAILY_SEND_CAP (initial sends
    and follow-ups combined) via sends_remaining_today() — it only removes the
    human review step, not the deliverability guardrails.

    Ordered by fit_score DESC (oldest-first as the tie-breaker) so that
    within a given day's cap, the candidates most likely to actually convert
    get sent first — this only reorders who gets picked from the pool that
    already cleared every gate above, it never changes which candidates are
    eligible.
    """
    remaining = sends_remaining_today()
    if remaining <= 0:
        log.info("Daily send cap (%s) already reached — no initial sends this run.", DAILY_SEND_CAP)
        return 0

    # Only pull a bounded slice, not the whole draft_ready pool: we need at
    # most `remaining` sendable candidates, and can_send_candidate() may run a
    # live DNS check per row for unverified addresses — churning hundreds of
    # those in one request would blow past the cron caller's timeout. Best
    # candidates come first (fit_score), so the sendable ones are near the top;
    # anything missed rolls to the next run.
    scan_limit = max(remaining * 8, 60)
    candidates = OutreachCandidate.query.filter(
        # 'approved' is the campaign path (human-reviewed); 'draft_ready' is
        # the legacy uncampaigned path. can_send_candidate() decides which of
        # these is actually eligible — this filter only has to not exclude
        # them before it gets the chance.
        OutreachCandidate.status.in_(["draft_ready", STATUS_APPROVED]),
        OutreachCandidate.email.isnot(None),
        OutreachCandidate.draft_subject.isnot(None),
        OutreachCandidate.draft_body.isnot(None),
    ).order_by(
        # Pool BEFORE score, and the ordering matters more than it looks.
        #
        # Warm leads are scored but never gated (see import_inbound_submitters),
        # so an inbound company whose pricing page sits behind a login scores
        # near zero while a cold lead with a tidy public /pricing scores 13.
        # Ranking on score alone would therefore send the cold pool FIRST and
        # leave the warmest leads in the campaign until last — the exact
        # inversion of the plan, arrived at by a sort order rather than a
        # decision.
        #
        # Inbound first, then traffic, then cold; score only breaks ties within
        # a pool. Uncampaigned v1 rows have no pool and sort last, which is
        # correct: they are not part of this campaign.
        db.case(
            (OutreachCandidate.lead_pool == POOL_INBOUND, 0),
            (OutreachCandidate.lead_pool == POOL_TRAFFIC, 1),
            (OutreachCandidate.lead_pool == POOL_COLD, 2),
            else_=3,
        ).asc(),
        OutreachCandidate.fit_score.desc().nullslast(),
        OutreachCandidate.created_at.asc(),
    ).limit(scan_limit).all()

    sent_count = 0
    for c in candidates:
        if remaining <= 0:
            log.info("Daily send cap (%s) reached — deferring remaining initial sends to tomorrow.", DAILY_SEND_CAP)
            break
        ok, skip_reason = can_send_candidate(c)
        if not ok:
            # Not eligible (no verified/MX-reachable email, missing draft, or an
            # opted-out status). Stays in draft_ready for Re-Enrich / manual
            # review rather than being auto-sent.
            log.debug("Auto-send skip for candidate %s: %s", c.id, skip_reason)
            continue

        # Shared Resend daily budget (outreach + digest + manual all draw from
        # one 100/day account cap). Reserved per-send so a failed send can
        # return the slot immediately.
        if reserve_send_slots(1, requester="outreach-initial")["granted"] == 0:
            log.info("Shared send budget exhausted — deferring remaining initial sends to next run.")
            break

        success = False
        err_msg = None
        try:
            success, err_msg = send_email_with_details(
                to=c.email, subject=c.draft_subject, html=outreach_email_html(c),
                reply_to=OUTREACH_REPLY_TO, headers=_outreach_send_headers(c.email),
                sender=OUTREACH_FROM,
            )
        except Exception as exc:
            err_msg = str(exc)

        db.session.add(OutreachEmailLog(
            candidate_id=c.id, email=c.email, subject=c.draft_subject, body=c.draft_body,
            status="success" if success else "failure", error_message=err_msg,
        ))

        if success:
            c.status = "sent"
            c.last_status_change_at = datetime.now(timezone.utc)
            sent_count += 1
            remaining -= 1
            time.sleep(1.5)  # spread sends out rather than bursting the provider
        else:
            release_send_slots(1, requester="outreach-initial")

    db.session.commit()
    if sent_count > 0:
        log.info("Automated initial sends: %s email(s) sent.", sent_count)

    return sent_count

# ─── 6. BULK DRAFT REGENERATION ─────────────────────────────────────────────

def apply_regenerated_draft(c, subject, body):
    """Writes a freshly generated draft onto a candidate.

    Approval is consent to send a *specific* message, so when regeneration
    changes the text that consent does not carry over - the row returns to
    draft_ready and is reviewed again. This is not hypothetical: template v5
    exists because v4 told founders whose listing was already live that it was
    "in the queue for a free listing", and an approval of that sentence must
    not silently become an approval of whatever replaced it.

    Copy that comes back identical keeps its approval, so a no-op regeneration
    can never quietly empty the send queue.
    """
    changed = (c.draft_subject != subject) or (c.draft_body != body)
    c.draft_subject = subject
    c.draft_body = body
    c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
    c.updated_at = datetime.now(timezone.utc)
    if changed and c.status == STATUS_APPROVED:
        c.status = "draft_ready"
        c.last_status_change_at = datetime.now(timezone.utc)
        log.info(
            "Candidate %s returned to review: an approved draft was rewritten "
            "onto template v%s, so the approval no longer matches what would send.",
            c.id, CURRENT_DRAFT_TEMPLATE_VERSION,
        )
    return changed


def regenerate_all_drafts():
    """Regenerates draft_subject/draft_body for every draft_ready candidate
    with an email. Drafts are only generated once and stored — a later
    template change (new stats, new copy) doesn't retroactively touch
    already-generated drafts, so this is the one-shot fix to bring every
    existing candidate's draft up to date with the current template.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    candidates = OutreachCandidate.query.filter(
        OutreachCandidate.status.in_(REDRAFTABLE_STATUSES),
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
                apply_regenerated_draft(cand_dict[cid], subject, body)
                regenerated += 1
            except Exception as e:
                log.warning("Draft regeneration failed: %s", e)

    if regenerated:
        db.session.commit()
        log.info("Regenerated %s draft(s).", regenerated)

    return regenerated

def refresh_stale_drafts(limit=None):
    """Regenerates a bounded batch of drafts stranded on an older template.

    The counterpart to the staleness check in can_send_candidate(): that
    refuses to send old copy, this is what makes the refusal temporary. Run
    from the cron's DISCOVERY phase rather than the send phase, because each
    regeneration is a Gemini call — that is the slow, best-effort lane with the
    long timeout, and sends must stay fast.

    Bounded per run (default 40 — comfortably ahead of the 30/day send cap,
    so the backlog never becomes the thing throttling sends) for the same
    reason discovery is bounded:
    this is a free-tier instance with one shared vCPU, and the full backlog is
    a few hundred rows. Whatever is not reached rolls to tomorrow, oldest
    first, so the queue drains steadily instead of one run trying to redraft
    everything and timing out.
    """
    if limit is None:
        limit = int(os.environ.get("OUTREACH_STALE_DRAFT_REFRESH_LIMIT", "40"))

    stale = [c for c in get_stale_draft_candidates() if c.email][:limit]
    if not stale:
        return 0

    refreshed = 0
    for c in stale:
        try:
            subject, body = generate_draft_via_gemini(c)
            apply_regenerated_draft(c, subject, body)
            refreshed += 1
        except Exception as e:  # noqa: BLE001 — one bad row must not stop the batch
            log.warning("Stale draft refresh failed for candidate %s: %s", c.id, e)

    if refreshed:
        db.session.commit()
        log.info("Refreshed %s stale draft(s) onto template v%s.", refreshed, CURRENT_DRAFT_TEMPLATE_VERSION)
    return refreshed


# ─── V2 CAMPAIGN: QUALIFIED ARCHIVE DISCOVERY ───────────────────────

def run_archive_discovery(start_date, end_date, max_days=None, dry_run=True, limit=None):
    """Sources the cold pool: Product Hunt launches from a past date range,
    qualified against the v2 rubric before anything is written.

    This is the sourcing half of the rework. Every v1 source returned products
    that launched this morning, so the target profile - shipping 3-8 months,
    real pricing tiers, budget to spend - was structurally unreachable. Here
    the date range IS the age filter, and app/outreach_qualify.py then checks
    the budget and company-shape evidence on each survivor.

    Rejections are recorded, not discarded. A candidate that fails a gate is
    written with status 'rejected' and its failing gate stored, because the
    only way to tell a bar that is correctly strict from one that is broken is
    to look at what it threw away.

    dry_run=True by default. A full pass makes several network requests per
    surviving launch, and the counts alone answer the question that matters
    first: is the bar producing tens of candidates or hundreds?
    """
    from concurrent.futures import ThreadPoolExecutor
    from app.outreach_qualify import (
        MIN_SCORE,
        gather_facts,
        qualify_candidate,
        store_qualification,
    )

    launches = fetch_producthunt_archive(start_date, end_date, max_days=max_days)

    # Cheap local gates and the DB dedup check first, so no network work is
    # spent on anything that would be thrown away regardless.
    survivors = []
    skipped = {"not_deployed": 0, "not_relevant": 0, "duplicate": 0}
    for launch in launches:
        url = launch.get("website_url", "")
        name = launch.get("product_name", "")
        if not is_deployed_app_url(url):
            skipped["not_deployed"] += 1
            continue
        if not is_student_relevant(name, launch.get("tagline", ""), url):
            skipped["not_relevant"] += 1
            continue
        if is_duplicate_candidate(name, url, launch.get("ph_launch_id", "")):
            skipped["duplicate"] += 1
            continue
        survivors.append(launch)
        if limit and len(survivors) >= limit:
            break

    # The qualification probes are network-bound and independent per launch.
    # Three workers matches the cap already used by regenerate_all_drafts on
    # this single-shared-vCPU instance.
    def _facts(launch):
        try:
            return launch, gather_facts(launch.get("website_url", ""))
        except Exception as exc:  # noqa: BLE001 - one bad site must not end the run
            log.warning("Qualification probe failed for %s: %s", launch.get("product_name"), exc)
            return launch, None

    scored = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for launch, facts in pool.map(_facts, survivors):
            if facts is None:
                continue
            probe = OutreachCandidate()
            probe.product_name = launch.get("product_name", "")
            probe.tagline = launch.get("tagline", "")
            probe.website_url = launch.get("website_url", "")
            verdict = qualify_candidate(probe, facts=facts)
            scored.append((launch, verdict))

    qualified = [(x, v) for x, v in scored if v["passed"]]
    rejected = [(x, v) for x, v in scored if not v["passed"]]

    if dry_run:
        gates = {}
        for _, v in rejected:
            key = v["failed_gate"] or f"below_score_{MIN_SCORE}"
            gates[key] = gates.get(key, 0) + 1
        return {
            "dry_run": True,
            "launches_found": len(launches),
            "reached_qualification": len(scored),
            "would_create": len(qualified),
            "would_reject": len(rejected),
            "skipped": skipped,
            "rejected_by_gate": gates,
            "sample": [
                {
                    "name": x.get("product_name"),
                    "score": v["score"],
                    "entry_price": v["prices"].get("min_monthly"),
                    "age_days": v.get("domain_age_days"),
                }
                for x, v in sorted(qualified, key=lambda p: -p[1]["score"])[:10]
            ],
        }

    created = 0
    for launch, verdict in scored:
        c = OutreachCandidate()
        c.campaign = CURRENT_CAMPAIGN
        c.lead_pool = POOL_COLD
        c.product_name = launch.get("product_name", "")
        c.tagline = launch.get("tagline", "")
        c.website_url = launch.get("website_url", "")
        c.founder_name = launch.get("founder_name", "")
        c.ph_launch_id = launch.get("ph_launch_id") or None
        c.tone = infer_tone(c.tagline, "")
        store_qualification(c, verdict)

        if not verdict["passed"]:
            # Kept, with the reason, so the rubric can be corrected from real
            # misses rather than from guesses. Never emailed: 'rejected' is in
            # NON_SENDABLE_STATUSES.
            c.status = "rejected"
            c.email_source = "none"
            c.confidence_score = 0
            db.session.add(c)
            continue

        email, source, score, verification = enrich_candidate_email(
            c.website_url, c.founder_name
        )
        if email:
            c.email = email
            c.email_source = source
            c.confidence_score = score
            c.verification_result = verification
            c.verified_at = datetime.now(timezone.utc) if verification else None
            c.status = "draft_ready"
            subject, body = generate_draft_via_gemini(c)
            c.draft_subject = subject
            c.draft_body = body
            c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
        else:
            c.email_source = "none"
            c.confidence_score = 0
            c.status = "no_email_found"

        db.session.add(c)
        created += 1

    db.session.commit()
    log.info(
        "Archive discovery %s..%s: %s qualified, %s rejected.",
        start_date, end_date, created, len(rejected),
    )
    return {
        "dry_run": False,
        "created": created,
        "rejected": len(rejected),
        "skipped": skipped,
    }


# ─── V2 CAMPAIGN: RESET + INBOUND IMPORT ─────────────────────────────────────

ARCHIVED_V1_STATUS = "archived_v1"


def archive_v1_candidates(dry_run=True):
    """Moves the pre-rework candidate pool aside so the campaign starts clean.

    Not a delete, and not done by the migration. Every archived row keeps its
    email log, its reply history and its verification verdict — that history is
    the only record of who we have already contacted, and re-emailing someone
    who told us no six weeks ago is the single fastest way to earn a spam
    complaint. Discovery's dedup check (is_duplicate_candidate) reads these
    rows too, so deleting them would let the new pipeline rediscover and
    re-mail people the old one already burned.

    Only touches candidates that were never actually emailed. A row in 'sent',
    'followed_up', 'replied' or 'bounced' describes a real conversation and is
    left exactly where it is.

    dry_run=True by default: this is a bulk state change on production data, so
    it reports what it WOULD do and changes nothing until called explicitly.
    """
    archivable = OutreachCandidate.query.filter(
        OutreachCandidate.status.in_(["draft_ready", "no_email_found", "rejected"]),
        OutreachCandidate.campaign.is_(None),
    )
    rows = archivable.all()

    if dry_run:
        by_status = {}
        for c in rows:
            by_status[c.status] = by_status.get(c.status, 0) + 1
        return {"dry_run": True, "would_archive": len(rows), "by_status": by_status}

    now = datetime.now(timezone.utc)
    for c in rows:
        c.status = ARCHIVED_V1_STATUS
        c.last_status_change_at = now
    db.session.commit()
    log.info("Archived %s v1 outreach candidate(s).", len(rows))
    return {"dry_run": False, "archived": len(rows)}


# A submitter address that is obviously a personal mailbox tells us nothing
# about a company having budget, and the whole point of this campaign is
# companies. Not a hard reject on its own — a real founder may well have used
# their Gmail — but it is scored, and it is why the domain is recorded.
FREE_EMAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com",
    "hotmail.com", "live.com", "icloud.com", "me.com", "proton.me",
    "protonmail.com", "aol.com", "gmx.com", "mail.com", "zoho.com",
})


def import_inbound_submitters(campaign=None, dry_run=True, limit=None, qualify=True):
    """Creates outreach candidates from people who submitted a tool to US.

    This is the warmest pool in the campaign and the pipeline has never once
    emailed it. A company that found AI Compass, filled in the form and asked
    to be listed has already done the hardest part of the sale — they chose
    us. SimplAI is the case that made this obvious: a real B2B company
    submitting for free, sitting in /admin/submissions with nobody following
    up.

    Deliberately NOT filtered to approved listings only. A submission still
    pending review is an equally warm lead — arguably warmer, since they are
    actively waiting to hear from us.

    Excluded, because emailing them would be wrong rather than merely
    ineffective:
      * anyone who already paid (they are a customer; the upsell path is the
        founder report, not a cold-shaped pitch)
      * rejected submissions (we told them no; re-pitching is insulting)
      * addresses already in the outreach table under any campaign
      * unsubscribes and bounces, via the same address check
    """
    from app.models import Submission

    campaign = campaign or CURRENT_CAMPAIGN

    subs = Submission.query.filter(
        Submission.submitter_email.isnot(None),
        Submission.submitter_email != "",
        Submission.status != "rejected",
        # 'verified' means a real payment cleared — they are a customer.
        Submission.payment_status != "verified",
        Submission.is_test.is_(False),
    ).order_by(Submission.submitted_at.desc()).all()

    # One candidate per company, not per submission: a founder who submitted
    # three tools is one person with one inbox.
    seen_emails = set()
    picked = []
    skipped = {"duplicate_submitter": 0, "already_in_outreach": 0, "invalid_email": 0}

    for sub in subs:
        email = (sub.submitter_email or "").strip().lower()
        if not is_valid_email(email):
            skipped["invalid_email"] += 1
            continue
        if email in seen_emails:
            skipped["duplicate_submitter"] += 1
            continue
        seen_emails.add(email)

        if OutreachCandidate.query.filter(
            db.func.lower(OutreachCandidate.email) == email
        ).first():
            skipped["already_in_outreach"] += 1
            continue

        picked.append(sub)
        if limit and len(picked) >= limit:
            break

    def _domain_of(addr):
        return addr.split("@", 1)[-1].lower() if "@" in (addr or "") else ""

    company_domained = [
        s for s in picked if _domain_of(s.submitter_email) not in FREE_EMAIL_DOMAINS
    ]

    if dry_run:
        return {
            "dry_run": True,
            "would_import": len(picked),
            "on_company_domain": len(company_domained),
            "on_free_email": len(picked) - len(company_domained),
            "skipped": skipped,
            "sample": [
                {"name": s.name, "domain": _domain_of(s.submitter_email), "status": s.status}
                for s in picked[:10]
            ],
        }

    created = 0
    for sub in picked:
        c = OutreachCandidate()
        c.campaign = campaign
        c.lead_pool = POOL_INBOUND
        c.product_name = sub.name
        c.tagline = (sub.description or "")[:500]
        c.website_url = sub.website
        c.founder_name = ""
        c.email = sub.submitter_email.strip()
        # They typed this address into our own form, so it is self-attested
        # rather than guessed. That is a stronger signal than any scraper
        # heuristic, but it still goes through the same SMTP verifier as
        # everything else before it can be sent to.
        c.email_source = "inbound_submission"
        c.confidence_score = 95
        c.tone = infer_tone(sub.description, "")
        c.status = "draft_ready"
        c.ph_launch_id = f"inbound:{sub.id}"

        # Warm leads are SCORED but never GATED.
        #
        # The gates in outreach_qualify exist to answer "is there any evidence
        # this stranger can spend $49". That question is already answered here
        # by something far stronger than a scraped pricing page: they found us,
        # filled in our form, and asked to be listed. Rejecting an inbound
        # company because its /pricing page is behind a login, or because RDAP
        # will not disclose its registration date, would throw away the single
        # warmest lead in the campaign over a scraping failure.
        #
        # The score is still recorded, because the console ranks on it and an
        # operator picking 45 wants the best-evidenced companies first.
        if qualify:
            try:
                from app.outreach_qualify import qualify_candidate, store_qualification
                store_qualification(c, qualify_candidate(c))
            except Exception as exc:  # noqa: BLE001 - scoring must not block the import
                log.warning("Qualification failed for inbound %s: %s", sub.name, exc)

        subject, body = generate_draft_via_gemini(c)
        c.draft_subject = subject
        c.draft_body = body
        c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION

        db.session.add(c)
        created += 1

    if created:
        db.session.commit()
        log.info("Imported %s inbound submitter(s) into campaign %s.", created, campaign)

    return {"dry_run": False, "imported": created, "skipped": skipped}


def get_stale_draft_candidates():
    """Candidates whose stored draft was generated against an older copy/
    pricing template than CURRENT_DRAFT_TEMPLATE_VERSION — i.e. still
    carrying content nobody has re-run through the current template since
    it changed. Rows created before draft_template_version existed have it
    NULL, which counts as stale (NULL is not "less than" anything in SQL,
    so it needs its own explicit check rather than a plain `< CURRENT`).

    Scoped to REDRAFTABLE_STATUSES: sent/followed_up/replied/bounced/
    rejected/unsubscribed rows already went out (or never will) with whatever
    content they had — regenerating those changes history, not a pending send,
    so they're deliberately excluded there.

    'approved' IS included. It is the most important status here, not an edge
    case: an approved row is a pending send by definition, and leaving it out
    meant the one queue that was about to email someone was the one queue this
    never repaired.
    """
    return OutreachCandidate.query.filter(
        OutreachCandidate.status.in_(REDRAFTABLE_STATUSES),
        db.or_(
            OutreachCandidate.draft_template_version.is_(None),
            OutreachCandidate.draft_template_version < CURRENT_DRAFT_TEMPLATE_VERSION,
        ),
    ).order_by(OutreachCandidate.created_at.asc()).all()

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

    prompt = f"""\nYou are Medhansh Pratap Singh, Founder of AI Compass (https://ai-compass.in) - a curated directory of AI tools for students, developers and\ncreators. You are writing to the maker of a product that is ALREADY LISTED on AI Compass and is ALREADY receiving real referral traffic from it.\n\nThis is not a cold pitch. It is a short traffic report with an offer attached. The reader's first reaction should be "oh, this is a real number
about my product", not "this is a sales email". Write like one founder sending another a useful stat they did not know.

FACTS YOU MUST USE (all true, do not alter or embellish):
- Product: {candidate.product_name}
- Their listing sent them {clicks} click-throughs to their site in the last {days} days.
- They are already listed for free. Nothing is being taken away and there is nothing wrong with their listing.

STRUCTURE (follow this order):
1. Opening line: state the number plainly - that {candidate.product_name}'s AI Compass listing sent {clicks} clicks to their site in the last
   {days} days. No preamble, no "I hope this finds you well", no "I came across". The number IS the hook.
2. One sentence of context: those are students and developers who searched for a tool like theirs and chose to click through.
3. The offer, in one short sentence plus at most three bullets: a Fast-Track upgrade ($49 one-time) adding placement above free listings in
   their category, a labelled "Sponsored" badge on the listing, and first position in the weekly Student AI Digest. Say "Sponsored", never
   "featured" - editorial curation is not what is being sold and must not be implied.
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
- FORMATTING - this email must look like plain text. A designed email gets filed as an advertisement, and this one is going to a founder we
  already have a relationship with, so it should look like a note from a person who knows them:
  - "body" is HTML using ONLY <p> and <a> tags. No <ul>, no <li>, no <b>, no <br>, no <div>, no style blocks, no tables, no images, no buttons.
  - Every single <p> carries exactly style="margin:0 0 14px 0;" and nothing else. No colours, no font sizes, no font families, no borders.
  - The bullets in step 3 are ordinary <p> paragraphs whose text begins with "* ". They are not a list element.
  - Exactly ONE link in the entire email, written as a bare visible URL: <p style="margin:0 0 14px 0;"><a
    href="https://ai-compass.in/submit">https://ai-compass.in/submit</a></p>
  - The P.S. is an ordinary <p style="margin:0 0 14px 0;"> paragraph beginning "P.S.".

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

    This is the upgrade half of the funnel — it goes to founders who are
    already listed for free and can see what the placement is doing for them,
    which is the only point at which asking for $49 is a reasonable thing to
    do. Styled exactly as plainly as the cold email, for the same reason: see
    the note on _outreach_wrap.
    """
    name = candidate.product_name
    first_name = candidate.founder_name.split(" ")[0] if _looks_like_real_name(candidate.founder_name) else "there"
    subject = f"{name}: {clicks} clicks from AI Compass"[:50]
    inner = f"""<p style="margin:0 0 14px 0;">Hey {first_name},</p>\n<p style="margin:0 0 14px 0;">Your AI Compass listing sent {clicks} click-throughs to {name} in the last {days} days - students and developers who searched for a tool like yours and chose to click through.</p>\n<p style="margin:0 0 14px 0;">That listing stays free permanently. If you want more of the people already browsing your category to see {name} first, the Fast-Track upgrade ($49 one-time) adds:</p>\n<p style="margin:0 0 14px 0;">* Placement above the free listings in your category.</p>\n<p style="margin:0 0 14px 0;">* A labelled "Sponsored" badge on your listing.</p>\n<p style="margin:0 0 14px 0;">* First position in the weekly Student AI Digest.</p>\n<p style="margin:0 0 14px 0;">If you want it, it is here - or just reply if you would like the numbers for a specific month first:</p>\n<p style="margin:0 0 14px 0;"><a href="https://ai-compass.in/submit">https://ai-compass.in/submit</a></p>\n<p style="margin:0 0 14px 0;">P.S. Those {clicks} clicks came from the free listing alone - nothing changes if you would rather leave it as it is.</p>"""
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
        c.campaign = CURRENT_CAMPAIGN
        c.lead_pool = POOL_TRAFFIC
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
