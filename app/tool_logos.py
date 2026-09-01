"""Logo storage for submitted tools.

Two ways a Submission gets a logo, and the order matters:

1. The founder uploads one on /submit (optional, PNG or JPEG only). This is
   the good case — a real brand mark rather than a 16x16 favicon.
2. Nobody uploaded one, so at approval we go and find it ourselves from the
   tool's own domain, through the same favicon sources the /icon proxy uses.

An upload is never overwritten by an auto-fetch. The second path exists so
the admin does not have to hunt down a logo by hand for every free listing,
not so it can replace a choice a human already made.

Bytes live in the submissions row (see Submission.logo_data) rather than in
static/. Render's disk is wiped on every deploy, so a file written there
disappears and every card that pointed at it falls back to a letter tile —
silently, weeks later, with nothing in the logs.
"""

import base64
import binascii
import re

# Roughly a 512x512 PNG with room to spare. Big enough that a founder's real
# logo fits, small enough that a hundred of them in one table is still a
# table and not a blob store.
LOGO_MAX_BYTES = 512 * 1024

# PNG and JPEG only, as the form promises. Deliberately not SVG: it is a
# document format that can carry script, and we serve these back from our own
# origin, where an <img> is the least of what an SVG can do.
ALLOWED_LOGO_MIMES = {"image/png": "png", "image/jpeg": "jpg"}

_DATA_URL_RE = re.compile(r"^data:(?P<mime>[\w.+/-]+);base64,(?P<body>.+)$", re.DOTALL)


class LogoError(ValueError):
    """Rejected upload — the message is written to be shown to the submitter."""


def _sniff_mime(raw: bytes):
    """The real type, from the file's own magic bytes.

    The declared MIME in a data: URL is whatever the browser (or a script
    posting to this endpoint directly) says it is, so it decides nothing on
    its own. A .png extension on a renamed executable is the case this
    closes.
    """
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return None


def decode_logo_data_url(value):
    """(bytes, mime) for a browser-produced data: URL, or (None, None) if the
    field was left empty. Raises LogoError on anything present but unusable."""
    text = str(value or "").strip()
    if not text:
        return None, None

    match = _DATA_URL_RE.match(text)
    if not match:
        raise LogoError("Logo must be an uploaded PNG or JPG image file.")

    declared = match.group("mime").lower()
    if declared not in ALLOWED_LOGO_MIMES:
        raise LogoError("Logo must be a PNG or JPG image.")

    try:
        raw = base64.b64decode(match.group("body"), validate=True)
    except (binascii.Error, ValueError):
        raise LogoError("Logo upload was corrupted in transit — please try again.") from None

    if not raw:
        raise LogoError("Logo file was empty.")
    if len(raw) > LOGO_MAX_BYTES:
        raise LogoError(f"Logo must be under {LOGO_MAX_BYTES // 1024}KB.")

    actual = _sniff_mime(raw)
    if actual is None or actual != declared:
        raise LogoError("Logo must be a real PNG or JPG image.")

    return raw, actual


def attach_uploaded_logo(submission, value):
    """Store a submitted logo on the row. Returns True if one was stored."""
    raw, mime = decode_logo_data_url(value)
    if raw is None:
        return False
    submission.logo_data = raw
    submission.logo_mime = mime
    submission.logo_source = "upload"
    return True


def domain_for(url):
    """Bare hostname from a submitted website URL.

    From the URL, never from the tool's NAME. The name-based guess the
    frontend used to fall back on turns "SimplAI" into simplai.com, which is
    someone else's domain and someone else's logo — the submission itself
    says simplai.ai.
    """
    text = str(url or "").strip()
    if not text:
        return None
    if not re.match(r"^https?://", text, re.IGNORECASE):
        text = f"https://{text}"
    from urllib.parse import urlparse

    try:
        host = (urlparse(text).hostname or "").lower().strip(".")
    except ValueError:
        return None
    if host.startswith("www."):
        host = host[4:]
    if not host or "." not in host or not re.fullmatch(r"[a-z0-9.-]{3,253}", host):
        return None
    return host


def autofetch_logo(submission):
    """Fetch the tool's favicon from its own domain and store it.

    No-op (returns False) when the row already has a logo — an upload always
    wins — or when nothing could be fetched. A miss is not an error: ToolLogo
    still resolves a live /icon/<domain> request in the browser, so the worst
    case is the status quo, not a broken card.
    """
    if submission is None or submission.logo_data:
        return False

    domain = domain_for(getattr(submission, "website", None))
    if not domain:
        return False

    from app.routes import _fetch_icon_bytes

    raw = _fetch_icon_bytes(domain)
    if not raw or len(raw) > LOGO_MAX_BYTES:
        return False

    # Favicon services answer with PNG most of the time and .ico occasionally.
    # Store the sniffed type when we recognise it and fall back to the generic
    # icon type otherwise, rather than claiming image/png over an .ico body.
    submission.logo_data = raw
    submission.logo_mime = _sniff_mime(raw) or "image/x-icon"
    submission.logo_source = "auto"
    return True


def logo_url_for(submission):
    """Public URL for a stored logo, or None when the row has none."""
    if submission is None or not submission.logo_data or not submission.id:
        return None
    return f"/logo/submission/{submission.id}"
