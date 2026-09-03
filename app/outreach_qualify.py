"""Qualification for the v2 outreach campaign: gates reject, scores rank.

`compute_fit_score()` in app/outreach.py stays where it is for uncampaigned v1
rows, but it is not what qualifies a campaign candidate — and it could not be,
because it scores the target profile backwards. It awards +2 for freemium (the
segment least likely to have a marketing budget), subtracts 3 for sales-led
pricing (a company with an approver and a budget line), and subtracts 2 for
high Product Hunt traction (a product that survived its launch). It was written
on the assumption that a successful founder ignores cold email. Under the new
target, those are precisely the buyers.

The rules here are split deliberately:

  GATES reject outright. A candidate that fails one is not a worse lead, it is
  not a lead. No readable price means no evidence they can spend $49, and the
  campaign is 45 emails to companies that can.

  SCORES rank whatever survives, and every signal records its evidence so the
  admin console can show why a candidate scored what it did. A bare number
  nobody can audit is how the previous scoring stayed inverted for months
  without anyone noticing.

Kept in its own module rather than added to app/outreach.py because this is a
separable concern with a lot of pure, heavily-tested logic, and outreach.py is
already past three thousand lines.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone

import requests

log = logging.getLogger(__name__)


# ─── Thresholds ───────────────────────────────────────────────────────────────

# A tier at or above this is the cheapest credible evidence of budget: a company
# already paying for its own software monthly can expense $49 once.
MIN_MONTHLY_PRICE = float(os.environ.get("OUTREACH_QUALIFY_MIN_PRICE", "19"))

# A ceiling that clears the gate on its own, even when the entry tier does not.
#
# The gate originally read only the LOWEST monthly price, which asks "is the
# cheapest thing they sell more than $19" - not the question that matters. A
# company selling $5/mo at the bottom and $499/mo at the top is obviously able
# to spend $49, and reading the floor alone scored it zero. That is exactly
# what happened to a real inbound lead priced $5-$499/mo: the strongest budget
# signal in the pool was the reason it ranked last.
#
# A freemium ladder is evidence of a business, not of poverty. 49 rather than
# 19 because a single tier at this level is the claim being tested - that
# someone here signs off on a $49 one-time spend without a procurement
# conversation.
QUALIFYING_TOP_TIER_PRICE = float(
    os.environ.get("OUTREACH_QUALIFY_TOP_TIER_PRICE", "49")
)

# 3-8 months. Below 90 days they are still in launch noise with no revenue to
# spend; past ~9 months the "recently launched, looking for distribution"
# framing stops being true and the email reads as untargeted.
MIN_DOMAIN_AGE_DAYS = int(os.environ.get("OUTREACH_QUALIFY_MIN_AGE_DAYS", "90"))
MAX_DOMAIN_AGE_DAYS = int(os.environ.get("OUTREACH_QUALIFY_MAX_AGE_DAYS", "270"))

# Set so a pass over a month of Product Hunt archive yields tens of survivors,
# not hundreds. Hundreds means the bar is too low and we are back to quantity —
# the exact failure this rework exists to fix.
MIN_SCORE = int(os.environ.get("OUTREACH_QUALIFY_MIN_SCORE", "7"))

# Gate identifiers, stored on the candidate so the console can show a
# rejected-at-gate view. Without that view there is no way to tell a bar that is
# correctly strict from one that is simply broken.
GATE_UNREACHABLE = "site_unreachable"
GATE_NO_PRICING_PAGE = "no_pricing_page"
GATE_NO_QUALIFYING_PRICE = "no_qualifying_price"
GATE_DOMAIN_TOO_NEW = "domain_too_new"
GATE_DOMAIN_TOO_OLD = "domain_too_old"


# ─── Price extraction (pure) ──────────────────────────────────────────────────

# Words that turn a dollar amount into something other than a price. Without
# them, "save $50", "raised $2M" and "30-day money back" all read as pricing,
# and a company with no paid plan sails through the budget gate.
# Scanned over a TIGHT window immediately before the amount (see
# _LOOKBEHIND). A wide window produces false negatives that are worse than the
# false positives it prevents: "Save $50 today! Plans from $29/mo" must still
# yield $29, because rejecting a qualified company over a promo banner near its
# price table costs a real lead at the hardest gate.
#
# "back" is deliberately absent here and lives only in the after-window list.
# "30-day money back guarantee" sits above the plan table on a great many
# pricing pages, and treating it as a disqualifier threw away the genuine
# prices underneath it.
_DISQUALIFIERS_BEFORE = (
    "save", "saved", "saving", "discount", "raised", "funding", "valued",
    "revenue", "arr", "mrr", "worth", "refund", "credit", "bonus",
    "up to", "as low as", "was ", "reg. ",
)

# Just enough to catch a qualifier attached to this amount, not the previous
# sentence.
_LOOKBEHIND = 18
_LOOKAHEAD = 40
_DISQUALIFIERS_AFTER = ("off", "back", "saved", "discount", "in savings", "raised")

_MONTHLY_MARKERS = (
    "/mo", "/ mo", "per month", "a month", "/month", "/ month", "monthly",
    "per user per month", "per seat", "mo.", "each month",
)
_ANNUAL_MARKERS = (
    "/yr", "/ yr", "per year", "a year", "/year", "/ year", "annually",
    "annual", "yr.", "billed yearly",
)

_AMOUNT_RE = re.compile(r"[$]\s?(\d[\d,]*(?:\.\d{1,2})?)")


def extract_price_points(text):
    """Pulls real, self-serve prices out of already-fetched pricing-page text.

    Returns {'monthly', 'annual', 'min_monthly', 'max_monthly'}. Pure and
    unit-testable with no network, because the budget gate rests entirely on
    this and it needs to fail in obvious ways rather than subtle ones.

    Deliberately conservative. The previous pipeline only asked "does the word
    'pricing' appear anywhere on the page", which is true of essentially every
    SaaS homepage including ones with nothing to sell. Reading an actual number
    is the difference between "has a pricing page" and "charges money".

    An annual figure is recorded but never divided into a monthly one. Annual
    plans carry an unknown discount, so a derived monthly price would be a
    number we invented — and this gate decides who gets emailed.
    """
    empty = {"monthly": [], "annual": [], "min_monthly": None, "max_monthly": None}
    if not text:
        return empty

    lowered = text.lower()
    monthly, annual = [], []

    for match in _AMOUNT_RE.finditer(lowered):
        try:
            amount = float(match.group(1).replace(",", ""))
        except ValueError:
            continue

        # A free tier is not evidence of budget, and large round numbers on a
        # marketing page are funding and savings claims, not monthly prices.
        if amount <= 0 or amount > 10000:
            continue

        before = lowered[max(0, match.start() - _LOOKBEHIND):match.start()]
        after = lowered[match.end():match.end() + _LOOKAHEAD]

        if any(bad in before for bad in _DISQUALIFIERS_BEFORE):
            continue
        if any(bad in after for bad in _DISQUALIFIERS_AFTER):
            continue

        if any(marker in after for marker in _MONTHLY_MARKERS):
            monthly.append(amount)
        elif any(marker in after for marker in _ANNUAL_MARKERS):
            annual.append(amount)

    return {
        "monthly": sorted(set(monthly)),
        "annual": sorted(set(annual)),
        "min_monthly": min(monthly) if monthly else None,
        "max_monthly": max(monthly) if monthly else None,
    }


# ─── Network probes ───────────────────────────────────────────────────────────

_PRICING_PATHS = ("/pricing", "/plans", "/price", "/upgrade")

_COMPANY_PATHS = (
    ("careers", ("/careers", "/jobs")),
    ("team", ("/team", "/about")),
    ("docs", ("/docs", "/documentation", "/api")),
    ("changelog", ("/changelog", "/blog", "/releases")),
)

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AICompassBot/1.0"


def _fetch(url, timeout=4):
    """One best-effort GET. Returns page text, or None. Never raises."""
    try:
        r = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout, allow_redirects=True)
        if r.ok and r.text:
            return r.text
    except Exception:
        pass
    return None


def fetch_pricing_text(website_url):
    """Finds the pricing page. Returns (text, url_used) or (None, None).

    Falls back to the homepage, because plenty of small SaaS sites put the whole
    plan table on the front page and have no /pricing at all. Treating those as
    "no pricing page" would reject real candidates over a routing decision.
    """
    base = (website_url or "").rstrip("/")
    if not base:
        return None, None

    for path in _PRICING_PATHS:
        text = _fetch(base + path)
        if text and "$" in text:
            return text, base + path

    text = _fetch(base)
    return (text, base) if text else (None, None)


def domain_age_days(website_url, get_domain=None):
    """Days since domain registration via RDAP. None if unavailable.

    This is the same record find_email_via_rdap() already fetches — it read the
    contact email out and threw the registration date away, which is the one
    field that says how long the company has existed.
    """
    if get_domain is None:
        from app.outreach import get_domain_from_url as get_domain

    domain = get_domain(website_url)
    if not domain or "." not in domain:
        return None

    try:
        r = requests.get(f"https://rdap.org/domain/{domain}", timeout=4)
        if not r.ok:
            return None
        for event in r.json().get("events", []):
            if event.get("eventAction") == "registration":
                stamp = (event.get("eventDate") or "").replace("Z", "+00:00")
                if not stamp:
                    return None
                registered = datetime.fromisoformat(stamp)
                if registered.tzinfo is None:
                    registered = registered.replace(tzinfo=timezone.utc)
                return (datetime.now(timezone.utc) - registered).days
    except Exception:
        return None
    return None


def probe_company_signals(website_url):
    """Cheap 'is this a company or a weekend project' checks.

    None is decisive alone — plenty of real companies have no /careers — which
    is why they are scored rather than gated.
    """
    base = (website_url or "").rstrip("/")
    signals = {key: False for key, _ in _COMPANY_PATHS}
    if not base:
        return signals

    for key, paths in _COMPANY_PATHS:
        for path in paths:
            if _fetch(base + path, timeout=3):
                signals[key] = True
                break
    return signals


def gather_facts(website_url):
    """All the network work for one candidate, in one call."""
    pricing_text, pricing_url = fetch_pricing_text(website_url)
    return {
        "pricing_text": pricing_text,
        "pricing_url": pricing_url,
        "domain_age_days": domain_age_days(website_url),
        "company_signals": probe_company_signals(website_url),
    }


# ─── Scoring ──────────────────────────────────────────────────────────────────

def qualify_candidate(candidate, facts=None):
    """Scores one candidate and records why. Returns a dict; never raises.

    `facts` lets a caller supply already-gathered network results instead of
    fetching again — discovery gathers them concurrently for a batch, and the
    tests pass them in directly so the rubric is testable without a network.

    The returned dict is what gets stored in qualification_json and rendered as
    the evidence chips in the admin console.
    """
    from app.outreach import ENTERPRISE_ONLY_SIGNALS

    website = getattr(candidate, "website_url", "") or ""
    if facts is None:
        facts = gather_facts(website)

    pricing_text = facts.get("pricing_text")
    age = facts.get("domain_age_days")
    company = facts.get("company_signals") or {}

    evidence = []
    prices = {"monthly": [], "annual": [], "min_monthly": None, "max_monthly": None}

    def note(signal, hit, detail, weight=0):
        evidence.append({
            "signal": signal, "hit": bool(hit), "detail": detail, "weight": weight,
        })

    def verdict(score, failed_gate=None):
        return {
            "score": score,
            "passed": failed_gate is None and score >= MIN_SCORE,
            "failed_gate": failed_gate,
            "min_score": MIN_SCORE,
            "evidence": evidence,
            "prices": prices,
            "domain_age_days": age,
            "pricing_url": facts.get("pricing_url"),
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── Gate 1: reachable, with something that looks like pricing ────────
    if not pricing_text:
        note("pricing_page", False, "No pricing page or homepage reachable")
        return verdict(0, GATE_UNREACHABLE if not website else GATE_NO_PRICING_PAGE)

    prices = extract_price_points(pricing_text)

    # ── Gate 2: a real, self-serve price we can actually read ────────────
    lowest = prices["min_monthly"]
    highest = prices["max_monthly"]

    # Either end of the ladder can clear this. See QUALIFYING_TOP_TIER_PRICE:
    # judging a company by its cheapest plan mistakes a freemium entry point
    # for an absence of budget.
    entry_ok = lowest is not None and lowest >= MIN_MONTHLY_PRICE
    ceiling_ok = highest is not None and highest >= QUALIFYING_TOP_TIER_PRICE

    if not entry_ok and not ceiling_ok:
        shown = f"${lowest:g}/mo" if lowest is not None else "none found"
        detail = f"Entry price {shown} (need ${MIN_MONTHLY_PRICE:g}+/mo"
        if highest is not None:
            detail += f", or a ${QUALIFYING_TOP_TIER_PRICE:g}+/mo tier; top is ${highest:g}/mo)"
        else:
            detail += f", or a ${QUALIFYING_TOP_TIER_PRICE:g}+/mo tier)"
        note("qualifying_price", False, detail)
        return verdict(0, GATE_NO_QUALIFYING_PRICE)

    if entry_ok:
        note("qualifying_price", True, f"Entry tier ${lowest:g}/mo")
    else:
        # Worth spelling out in the evidence: the operator scanning the console
        # should see WHY a $5/mo product cleared a $19 bar.
        note("qualifying_price", True,
             f"Entry tier ${lowest:g}/mo, but sells up to ${highest:g}/mo")

    # ── Gate 3: shipping for 3-8 months ──────────────────────────────────
    #
    # An UNKNOWN age does not reject. RDAP is privacy-shielded for a large share
    # of .io/.dev/.app domains, and rejecting every one of those would discard
    # much of the target market over a registrar's disclosure policy. It simply
    # scores nothing.
    score = 0
    if age is not None:
        if age < MIN_DOMAIN_AGE_DAYS:
            note("domain_age", False, f"Domain only {age}d old — still launch noise")
            return verdict(0, GATE_DOMAIN_TOO_NEW)
        if age > MAX_DOMAIN_AGE_DAYS:
            note("domain_age", False, f"Domain {age}d old — past the window")
            return verdict(0, GATE_DOMAIN_TOO_OLD)
        note("domain_age", True, f"Domain {age}d old", 3)
        score += 3
    else:
        note("domain_age", False, "Registration date not public (privacy shield)")

    # ── Scored signals ───────────────────────────────────────────────────
    top = prices["max_monthly"]
    if top is not None and top >= 99:
        note("budget_ceiling", True, f"Top tier ${top:g}/mo", 3)
        score += 3
    else:
        note("budget_ceiling", False,
             f"Top tier ${top:g}/mo" if top is not None else "No higher tier found")

    # Inverted from compute_fit_score's -3. A company running a sales motion has
    # an approver and a budget line: a slower close, not a worse lead.
    if any(sig in pricing_text.lower() for sig in ENTERPRISE_ONLY_SIGNALS):
        note("sales_led_pricing", True, "Has a contact-sales tier", 2)
        score += 2
    else:
        note("sales_led_pricing", False, "Self-serve only")

    for key, weight, label in (
        ("careers", 2, "Careers page"),
        ("docs", 2, "Docs or public API"),
        ("changelog", 2, "Changelog or blog"),
        ("team", 1, "Team or about page"),
    ):
        if company.get(key):
            note(key, True, label, weight)
            score += weight
        else:
            note(key, False, f"No {label.lower()}")

    if getattr(candidate, "verification_result", None) in ("valid", "manual_override"):
        note("verified_mailbox", True, "Mailbox verified", 1)
        score += 1
    else:
        note("verified_mailbox", False, "Mailbox not confirmed")

    return verdict(score)


def store_qualification(candidate, qualification):
    """Persists the score and its evidence onto the candidate."""
    import json

    candidate.qualification_json = json.dumps(qualification)
    # fit_score stays the column the admin list already sorts on, so the new
    # score feeds it rather than introducing a second competing ranking number.
    candidate.fit_score = qualification.get("score", 0)
    return candidate


def qualification_summary(candidate):
    """Reads qualification_json back for the admin console. Never raises."""
    import json

    raw = getattr(candidate, "qualification_json", None)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        log.warning("Unreadable qualification_json on candidate %s", getattr(candidate, "id", "?"))
        return None
