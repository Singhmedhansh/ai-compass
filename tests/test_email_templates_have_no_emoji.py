"""No email this app sends contains an emoji.

Three reasons, in order of how much they cost:

1. Deliverability. An emoji in a subject line, header or signature is a
   well-known bulk-mail signal — it is one of the things that pushes a message
   into Gmail's Promotions tab, which is exactly the problem the outreach
   rewrite set out to fix.
2. Rendering. Several corporate and desktop mail clients render an emoji as a
   blank box or a literal question mark, so the brand mark becomes a glyph
   that says "this was sent by software that did not check".
3. Register. These are meant to read as correspondence from a person, not as
   marketing.

This covers BOTH email paths, because they are built completely differently
and it would be easy to fix one and not notice the other:

  - the Jinja templates under app/templates/emails/ (digest, invoices,
    submission receipts, founder reports, community recaps)
  - the outreach emails in app/outreach.py, which are assembled as HTML
    strings in code rather than rendered from a template

Scope note: this does NOT cover app/api_routes.py's LinkedIn helpers
(_li_roundup / _li_spotlight). Those are social post copy, where an emoji is
normal and expected. If email copy ever moves into that module, widen the
scan below rather than deleting this test.
"""
import glob
import io
import os

import pytest

EMAIL_TEMPLATE_DIR = os.path.join("app", "templates", "emails")


def _emoji_in(text):
    """Codepoints we treat as emoji, with their positions.

    Deliberately not a dependency on a Unicode emoji library — the ranges that
    matter for email are narrow and stable, and a test that silently stops
    running when a package is missing is worse than no test.

    Typographic punctuation (curly quotes, em dashes, arrows like → and ←) is
    NOT emoji and is fine in email copy, so those ranges are excluded.
    """
    found = []
    for idx, ch in enumerate(text):
        cp = ord(ch)
        if (
            0x1F000 <= cp <= 0x1FAFF      # emoticons, pictographs, symbols, flags
            or 0x2600 <= cp <= 0x27BF     # misc symbols + dingbats (compass, bolt, check)
            or 0x2B00 <= cp <= 0x2BFF     # extra arrows/stars used as icons
            or cp == 0xFE0F               # variation selector-16 (emoji presentation)
            or cp == 0x20E3               # combining keycap
        ):
            found.append((idx, "U+%04X" % cp))
    return found


def _context(text, idx, width=70):
    start = max(0, idx - width)
    snippet = text[start:idx + width].replace("\n", " ")
    return snippet.encode("ascii", "replace").decode()


# ─── Jinja email templates ────────────────────────────────────────────────────

def _template_files():
    return sorted(glob.glob(os.path.join(EMAIL_TEMPLATE_DIR, "**", "*.html"), recursive=True))


def test_the_email_template_directory_is_actually_being_scanned():
    # A glob that silently matches nothing would make every check below pass
    # for the wrong reason.
    files = _template_files()
    assert files, f"No templates found under {EMAIL_TEMPLATE_DIR} — the scan path is wrong."
    assert any(f.endswith("base.html") for f in files)


@pytest.mark.parametrize("path", _template_files(), ids=os.path.basename)
def test_email_template_has_no_emoji(path):
    text = io.open(path, encoding="utf-8").read()
    hits = _emoji_in(text)
    assert not hits, (
        f"{path} contains emoji: "
        + "; ".join(f"{cp} near '{_context(text, i)}'" for i, cp in hits)
    )


# ─── Outreach emails, which are built in code rather than from a template ─────

def _outreach_candidate():
    class C:
        id = 99
        product_name = "Widget AI"
        tagline = "Turn meeting notes into tickets"
        website_url = "https://widget.example.com"
        founder_name = "Priya Raman"
        email = "founder@widget.example.com"
        draft_subject = "About Widget AI"
    return C()


def test_the_cold_outreach_email_has_no_emoji(app_ctx):
    from app.outreach import get_generic_draft

    subject, html = get_generic_draft(_outreach_candidate())
    for label, part in (("subject", subject), ("body", html)):
        hits = _emoji_in(part)
        assert not hits, f"Outreach {label} contains emoji: {hits}"


@pytest.mark.parametrize("stage", [1, 2])
def test_outreach_follow_ups_have_no_emoji(app_ctx, stage):
    from app.outreach import _followup_content

    subject, html, text = _followup_content(_outreach_candidate(), stage)
    for label, part in (("subject", subject), ("html", html), ("text", text)):
        hits = _emoji_in(part)
        assert not hits, f"Follow-up stage {stage} {label} contains emoji: {hits}"


def test_the_traffic_report_upsell_email_has_no_emoji(app_ctx):
    from app.outreach import get_generic_traffic_report_draft

    subject, html = get_generic_traffic_report_draft(_outreach_candidate(), clicks=214)
    for label, part in (("subject", subject), ("body", html)):
        hits = _emoji_in(part)
        assert not hits, f"Traffic report {label} contains emoji: {hits}"


def test_the_outreach_signature_has_no_emoji(app_ctx):
    # The signature used to carry an emoji compass beside the wordmark. It is
    # the single most likely place for one to be reintroduced, since it reads
    # as branding rather than as content.
    from app.outreach import _outreach_signature_html

    assert not _emoji_in(_outreach_signature_html())


@pytest.fixture()
def app_ctx():
    import tempfile

    from app import create_app, db

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass
