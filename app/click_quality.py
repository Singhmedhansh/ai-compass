"""Bot heuristics and privacy-preserving client fingerprints for /go/ clicks.

The outbound-click count is the single traffic number AI Compass quotes to
vendors, so it has to hold up when someone checks it. /go/ is Disallow-ed in
robots.txt, but that is a request, not a control: anything ignoring it lands
in `outbound_clicks` and inflates the figure. Flagging at write time — rather
than filtering at read time — records the judgement once, next to the row it
describes, so every reader gets the same answer and nobody has to remember
the WHERE clause.

Deliberately conservative. This catches self-declaring bots and obviously
non-browser clients. A scraper spoofing a real Chrome user-agent is not
caught here and never will be by user-agent alone, which is exactly why
`ip_hash` exists alongside it: one client producing hundreds of clicks is
visible even when its user-agent is perfect. Read `is_bot=False` as "not
obviously a bot", never as "proven human".
"""

import hashlib

# Substring markers, matched case-insensitively against the user-agent.
# Every entry is either a self-declaration ("bot", "crawler"), an HTTP
# library that no human browses with ("curl", "python-requests"), or a
# headless/automation driver. Kept as substrings because vendors version
# their agents freely and exact matching rots within months.
_BOT_MARKERS = (
    # self-declaring crawlers
    "bot", "crawl", "spider", "slurp", "scrap", "archiver", "index",
    # HTTP clients and language runtimes
    "curl", "wget", "python-requests", "python-urllib", "httpx", "aiohttp",
    "okhttp", "java/", "go-http", "libwww", "perl", "ruby", "axios",
    "node-fetch", "guzzle", "postman", "insomnia",
    # headless browsers and automation drivers
    "headless", "phantomjs", "puppeteer", "playwright", "selenium",
    "electron", "cypress",
    # monitoring, previewing and link-unfurling agents
    "lighthouse", "pingdom", "uptime", "monitor", "statuscake",
    "preview", "validator", "feedfetcher", "embedly", "linkcheck",
)


def is_bot_user_agent(user_agent):
    """True when this user-agent should not be counted as a person.

    A missing or empty user-agent counts as a bot: every real browser
    sends one, so its absence means a script or a stripped proxy. That
    biases the count downward, which is the safe direction for a number
    we put in front of vendors.
    """
    if not user_agent:
        return True
    ua = str(user_agent).strip().lower()
    if not ua:
        return True
    return any(marker in ua for marker in _BOT_MARKERS)


def hash_ip(ip, salt):
    """Salted, truncated digest of a client address, or None.

    Salted so the table cannot be turned back into a list of addresses by
    hashing the IPv4 space (2^32 is trivially enumerable — an unsalted
    digest of an IP is not anonymisation, it is an encoding). Truncated
    to 32 hex chars because this only ever needs to support equality
    grouping, not uniqueness guarantees at cryptographic scale.
    """
    if not ip:
        return None
    ip = str(ip).strip()
    if not ip:
        return None
    digest = hashlib.sha256(f"{salt}:{ip}".encode("utf-8")).hexdigest()
    return digest[:32]


def client_ip(request):
    """Best-effort client address behind Render's proxy.

    Render terminates TLS upstream, so `remote_addr` is the proxy for
    every request and is useless for distinguishing clients. The real
    address is the FIRST entry of X-Forwarded-For; later entries are the
    proxy chain. Anything after the first hop is attacker-controlled, but
    the first is set by infrastructure we trust.
    """
    forwarded = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.remote_addr or None


def human_click_condition(model, counted_before=None):
    """SQLAlchemy condition restricting a click query to defensible humans.

    `is_bot` is NULL on every row written before the column existed, and NULL
    means "unknown", not "human" — so a number put in front of an outsider
    filters on `is_bot IS FALSE` and nothing else. That is the default here.

    Applied bare, though, the same filter also erases history: every legacy
    row disappears at once, so a founder's 30-day chart collapses on deploy
    day and creeps back over the following month as unjudged rows age out of
    the window. Nothing about their listing changed; only our bookkeeping did.

    `counted_before` avoids that cliff. Pass the moment bot-flagging started
    and unjudged rows *older* than it are kept, because "we counted every
    click" is the honest description of what that older number always was.
    Unjudged rows newer than the cutover stay excluded — after flagging began
    a NULL is a write that failed, not a historical artefact.

    Use the cutover for anything a person reads as a trend over time; leave it
    None for any figure quoted as human traffic.
    """
    from sqlalchemy import and_, or_

    if counted_before is None:
        return model.is_bot.is_(False)

    return or_(
        model.is_bot.is_(False),
        and_(model.is_bot.is_(None), model.created_at < counted_before),
    )


def bot_flagging_started_at(model, session):
    """When this deployment began recording a bot verdict, or None.

    Derived from the data (the oldest row carrying any verdict) rather than
    hard-coded, so it stays correct across environments that deployed at
    different times, and in tests. Returns None when no row has been judged
    yet, which makes `human_click_condition` fall back to counting nothing as
    unjudged-but-historical — the conservative direction.
    """
    return (
        session.query(model.created_at)
        .filter(model.is_bot.isnot(None))
        .order_by(model.created_at.asc())
        .limit(1)
        .scalar()
    )
