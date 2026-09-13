"""One way to answer "who is this request from".

There were three copies of this logic (app/api_routes.py, app/auth.py,
app/click_quality.py) and all three were wrong in the same way: they read the
FIRST entry of X-Forwarded-For and treated it as trustworthy. One of them said
so in its docstring — "the first is set by infrastructure we trust".

It is not. X-Forwarded-For is a list that each proxy APPENDS to, so the
leftmost entry is whatever the original caller sent, including a caller who
made it up. This was verified against production: after exhausting the login
rate limit from a real address, adding a single forged

    X-Forwarded-For: 203.0.113.1

header reset the bucket and the next three attempts were served. Every per-IP
limit in the app — login, submissions, checkout, feedback, newsletter — was
bypassable by rotating one header value.

The order below goes from most to least trustworthy for this deployment
(Cloudflare in front of Render):

1. CF-Connecting-IP. Cloudflare sets this to the connecting address and
   overwrites any copy the client supplies, so it cannot be forged by traffic
   arriving through Cloudflare.
2. The RIGHTMOST X-Forwarded-For entry. Appending means the last entry was
   written by the closest proxy, so it is the one the client could not have
   authored. This is deliberately the opposite of what the old code did.
3. remote_addr. Behind a proxy this is the proxy itself, which makes it a
   single shared bucket for everybody — correct but useless for telling
   clients apart. Last resort.

A caveat worth writing down: an attacker who reaches the Render origin
directly, bypassing Cloudflare, can still set CF-Connecting-IP themselves,
because nothing between them and gunicorn will overwrite it. Closing that
needs the origin restricted to Cloudflare's ranges at the host, which is a
hosting-config change and not something this module can do. What this module
does fix is the far easier attack: forging the header through the front door.
"""

from __future__ import annotations

UNKNOWN = "unknown"


def client_ip(request) -> str:
    """Return the best available client address, or "unknown"."""
    cf = str(request.headers.get("CF-Connecting-IP") or "").strip()
    if cf:
        return cf

    forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        # Rightmost non-empty entry: the one appended by the nearest proxy.
        for candidate in reversed([p.strip() for p in forwarded.split(",")]):
            if candidate:
                return candidate

    return str(request.remote_addr or UNKNOWN)
