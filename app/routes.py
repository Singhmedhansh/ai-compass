import html as html_module
import os
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from flask import Blueprint, Response, current_app, jsonify, redirect, send_from_directory
from sqlalchemy import text

from app import db
from app.tool_cache import TOOL_CACHE, get_cached_tools, get_visible_tools

main_bp = Blueprint('main', __name__)


def _total_tools() -> int:
    """Live visible-tool count, shared by every SEO surface so the
    figure can't drift when tools are added or hidden. Matches
    /api/v1/stats (which the homepage hero reads), so server SSR
    bodies and the React hydration agree on the same number."""
    try:
        return len(get_visible_tools() or [])
    except Exception:
        return 0

DIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'static', 'dist'
)

# Per-route static meta (title, description). /tools/<slug> is handled
# dynamically against the tool catalog below.
_ROUTE_META = {
    'tools': ('AI Tools Directory — AI Compass', 'Browse {count} curated AI tools by category, rating, and pricing. Find the right tool for writing, coding, research, and more.'),
    'ai-tool-finder': ('AI Tool Finder Wizard — AI Compass', 'Answer 4 questions and get 5-6 AI tools picked for you. Free, no login, no ranking tricks.'),
    'compare': ('Compare AI Tools — AI Compass', 'Side-by-side comparison of AI tools — pricing, features, platforms, and ratings.'),
    'collections': ('AI Tool Collections — AI Compass', 'Curated collections — best free, best for students, best for coding, and more.'),
    'best-ai-tools-for-students': ('Best AI Tools for Students — AI Compass', 'Hand-picked AI tools for studying, writing essays, coding, and research. Student-friendly pricing and perks.'),
    'best-free-ai-tools': ('Best Free AI Tools — AI Compass', 'The best AI tools you can use without paying. Curated and ranked by quality, not popularity.'),
    'best-coding-tools-for-students': ('Best Coding Tools for Students — AI Compass', 'The 10 best AI coding tools for student developers — Cursor, GitHub Copilot, Claude Code, Supabase, v0, Netlify. Free tiers and student plans, hand-tested.'),
    'best-jasper-alternatives': ('10 Best Jasper AI Alternatives in 2026 — AI Compass', 'Jasper is $39+/mo and built for marketing teams. These 10 alternatives are cheaper, better suited to fiction, academic, and student workflows — most with usable free tiers.'),
    'best-murf-alternatives': ('10 Best Murf AI Alternatives in 2026 — AI Compass', "Murf is no longer the voice-quality leader. These 10 alternatives — led by ElevenLabs — have better voices, usable free tiers, and pricing that doesn't feel like a 2022 SaaS quote."),
    'best-synthesia-alternatives': ('10 Best Synthesia Alternatives in 2026 — AI Compass', "Synthesia is $22+/mo for AI avatar videos most creators don't need. These 10 alternatives — led by Pictory — split into cheaper avatar tools and 'AI video without avatars' for explainers, training, and social shorts."),
    'best-ai-tools-for-fiction-writers': ('10 Best AI Tools for Fiction Writers in 2026 — AI Compass', 'The 10 best AI tools for fiction writers, novelists, and screenwriters — Sudowrite, NovelAI, Squibler, Claude, and more. Hand-tested for prose voice, worldbuilding, and revision.'),
}

# Routes the React SPA actually renders. Anything not in this set (and
# not a dynamic tool/alternatives/collections slug, handled below) is a
# genuine 404 — the catch-all used to return 200 for every URL, which
# Google treats as a soft-404 and which sent users to a blank page.
# Keep in sync with frontend/src/App.jsx <Route> table.
_KNOWN_SPA_ROUTES: set[str] = {
    '',  # homepage
    'tools',
    'ai-tool-finder',
    'collections',
    'compare',
    'dashboard',
    'profile',
    'login',
    'register',
    'admin',
    'submit',
    'team',
    'contact',
    'privacy',
    'terms',
    'best-ai-tools-for-students',
    'best-free-ai-tools',
    'best-coding-tools-for-students',
    'best-jasper-alternatives',
    'best-murf-alternatives',
    'best-synthesia-alternatives',
    'best-ai-tools-for-fiction-writers',
    'auth/callback',
}

_INDEX_HTML_CACHE = None


def _get_base_index_html():
    global _INDEX_HTML_CACHE
    if _INDEX_HTML_CACHE is None:
        index_path = os.path.join(DIST_DIR, 'index.html')
        if not os.path.exists(index_path):
            return None
        with open(index_path, 'r', encoding='utf-8') as handle:
            _INDEX_HTML_CACHE = handle.read()
    return _INDEX_HTML_CACHE


def _inject_meta(
    base_html: str,
    *,
    title: str,
    description: str,
    canonical_path: str | None = None,
    image_url: str | None = None,
) -> str:
    safe_title = html_module.escape(title or '', quote=True)
    safe_desc = html_module.escape((description or '')[:160], quote=True)

    out = re.sub(r'<title>[^<]*</title>', f'<title>{safe_title}</title>', base_html, count=1)
    out = re.sub(
        r'<meta\s+name="description"\s+content="[^"]*"\s*/?>',
        f'<meta name="description" content="{safe_desc}" />',
        out, count=1, flags=re.DOTALL,
    )
    out = re.sub(r'(property="og:title"\s+content=")[^"]*(")', rf'\g<1>{safe_title}\g<2>', out, count=1)
    out = re.sub(r'(property="og:description"\s+content=")[^"]*(")', rf'\g<1>{safe_desc}\g<2>', out, count=1)
    out = re.sub(r'(name="twitter:title"\s+content=")[^"]*(")', rf'\g<1>{safe_title}\g<2>', out, count=1)
    out = re.sub(r'(name="twitter:description"\s+content=")[^"]*(")', rf'\g<1>{safe_desc}\g<2>', out, count=1)
    if canonical_path:
        canonical_url = f'https://ai-compass.in{canonical_path}'
        out = re.sub(r'(<link\s+rel="canonical"\s+href=")[^"]*(")', rf'\g<1>{canonical_url}\g<2>', out, count=1)
        out = re.sub(r'(property="og:url"\s+content=")[^"]*(")', rf'\g<1>{canonical_url}\g<2>', out, count=1)
        # twitter:url was left at the homepage default for every tool page,
        # so X/Twitter unfurls of /tools/<slug> linked to the wrong URL.
        out = re.sub(r'(name="twitter:url"\s+content=")[^"]*(")', rf'\g<1>{canonical_url}\g<2>', out, count=1)
    if image_url:
        safe_img = html_module.escape(image_url, quote=True)
        out = re.sub(r'(property="og:image"\s+content=")[^"]*(")', rf'\g<1>{safe_img}\g<2>', out, count=1)
        out = re.sub(r'(name="twitter:image"\s+content=")[^"]*(")', rf'\g<1>{safe_img}\g<2>', out, count=1)
    return out


def _esc(value) -> str:
    return html_module.escape(str(value or ''), quote=True)


def _inject_seo_root(out_html: str, seo_html: str) -> str:
    """Render real, crawlable content into the otherwise-empty React root.

    Search engines (and link-unfurlers that do a shallow render) see this
    server-rendered HTML instead of a blank <div id="root">. On the client,
    React's createRoot().render() replaces these children on mount, so real
    users never see it — this is the standard progressive-enhancement SSR
    shell, not cloaking (the content mirrors what the SPA renders).

    The content is wrapped in an inline visually-hidden (clip) container so
    that during the ~1s before the JS bundle parses, the browser does NOT
    paint a flash of unstyled headings/links. It stays in the DOM (crawlers
    read it fine); it's just off-screen for humans. Inline style is required
    because the app stylesheet hasn't loaded yet at this point.
    """
    if not seo_html:
        return out_html
    hidden = (
        '<div data-seo-shell aria-hidden="true" style="position:absolute;'
        'width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;'
        'clip:rect(0 0 0 0);white-space:nowrap;border:0">'
        f'{seo_html}</div>'
    )
    # Insert right after the opening <div id="root"> tag, so this works
    # whether the root is empty OR already contains the boot loader (#2).
    replaced, count = re.subn(
        r'(<div id="root"[^>]*>)',
        rf'\g<1>{hidden}',
        out_html,
        count=1,
    )
    return replaced if count else out_html


def _seo_body(normalized: str, tool: dict | None = None) -> str:
    """Build a minimal semantic HTML block for crawlers, per route."""
    if tool is not None:
        name = _esc(tool.get('name'))
        # shortDescription is null for most records; tagline is the real
        # one-liner. Prefer it, then fall back to the long description.
        desc = _esc(
            tool.get('shortDescription')
            or tool.get('tagline')
            or tool.get('description')
        )
        category = _esc(tool.get('category'))
        sub = _esc(tool.get('subCategory'))
        pricing = _esc(tool.get('pricing') or tool.get('price'))
        link = _esc(tool.get('url') or tool.get('website') or tool.get('link'))
        parts = [f'<h1>{name}</h1>']
        if desc:
            parts.append(f'<p>{desc}</p>')
        meta_bits = []
        if category:
            meta_bits.append(f'Category: {category}')
        if sub:
            meta_bits.append(f'Type: {sub}')
        if pricing:
            meta_bits.append(f'Pricing: {pricing}')
        if tool.get('studentPerk') or tool.get('student_perk'):
            meta_bits.append('Student-friendly')
        if meta_bits:
            parts.append(f'<p>{" · ".join(meta_bits)}</p>')

        features = tool.get('features') or []
        if isinstance(features, list) and features:
            lis = ''.join(f'<li>{_esc(f)}</li>' for f in features[:8] if f)
            if lis:
                parts.append(f'<h2>Key features of {name}</h2><ul>{lis}</ul>')

        use_cases = tool.get('use_cases') or tool.get('useCases') or []
        if isinstance(use_cases, list) and use_cases:
            uc = ', '.join(_esc(u) for u in use_cases[:6] if u)
            if uc:
                parts.append(f'<p>Best for: {uc}.</p>')

        if link:
            parts.append(f'<p><a href="{link}" rel="nofollow noopener">Visit {name}</a></p>')
        parts.append(
            f'<p><a href="/alternatives/{_esc(tool.get("slug"))}">'
            f'See {name} alternatives</a> · '
            f'<a href="/tools">Browse all {_total_tools()} curated AI tools on AI Compass</a></p>'
        )
        return ''.join(parts)

    if normalized in ('', 'tools'):
        tools = get_cached_tools() or []
        is_home = normalized == ''
        heading = (
            'Free AI Tools for Students — 400+ Hand-Tested | AI Compass'
            if is_home
            else 'AI Tools Directory — AI Compass'
        )
        # The homepage only needs a representative sample for crawl discovery
        # (keeps the served HTML lean); the full link index lives on /tools.
        listed = tools[:30] if is_home else tools
        items = []
        for t in listed:
            slug = _esc(t.get('slug'))
            tname = _esc(t.get('name'))
            tdesc = _esc(
                t.get('shortDescription') or t.get('tagline') or t.get('description')
            )
            if not slug or not tname:
                continue
            items.append(
                f'<li><a href="/tools/{slug}">{tname}</a>'
                + (f' — {tdesc}' if tdesc else '')
                + '</li>'
            )
        tail = (
            f'<p><a href="/tools">Browse all {_total_tools()} curated AI tools</a></p>'
            if is_home
            else ''
        )
        return (
            f'<h1>{heading}</h1>'
            '<p>Hand-curated, hand-tested AI tools for students — writing, coding, '
            'research, design, image, video, audio, and study tools. Free to browse, '
            'no login required.</p>'
            f'<ul>{"".join(items)}</ul>{tail}'
        )

    if normalized in _ROUTE_META:
        title, desc = _ROUTE_META[normalized]
        count = _total_tools()
        # /tools description carries {count} as a template — sub in the
        # live figure so the SSR body stays in sync with /api/v1/stats.
        if normalized == 'tools':
            desc = desc.format(count=count)
        return f'<h1>{_esc(title)}</h1><p>{_esc(desc)}</p><p><a href="/tools">Browse all {count} curated AI tools</a></p>'

    return ''


def _seo_alternatives(tool: dict, alts: list[dict]) -> str:
    name = _esc(tool.get('name'))
    slug = _esc(tool.get('slug'))
    items = []
    for a in alts:
        a_slug = _esc(a.get('slug'))
        a_name = _esc(a.get('name'))
        a_desc = _esc(a.get('shortDescription') or a.get('description'))
        if not a_slug or not a_name:
            continue
        items.append(
            f'<li><a href="/tools/{a_slug}">{a_name}</a>'
            + (f' — {a_desc}' if a_desc else '')
            + '</li>'
        )
    return (
        f'<h1>Top {name} Alternatives in 2026</h1>'
        f'<p>Hand-tested alternatives to {name}, ranked by similarity — pricing, '
        'free tiers, and use cases compared. Curated by AI Compass.</p>'
        f'<ul>{"".join(items)}</ul>'
        f'<p><a href="/tools/{slug}">See {name} details</a> · '
        f'<a href="/tools">Browse all {_total_tools()} curated AI tools</a></p>'
    )


def _not_found_html(base: str, path: str) -> str:
    """SPA shell with status-404 metadata and a minimal crawlable body.

    Returned for any URL not in the known route set or for tool /
    alternatives slugs that don't exist. The React app still mounts and
    its <Route path="*"> renders a friendly NotFoundPage — but crawlers
    see the 404 status + a "page not found" body instead of the
    homepage's content.
    """
    safe_path = _esc(f'/{path}' if path else '/')
    count = _total_tools()
    html = _inject_meta(
        base,
        title='Page not found — AI Compass',
        description=f'That page does not exist on AI Compass. Browse {count} hand-tested AI tools for students instead.',
        canonical_path=None,
    )
    seo = (
        '<h1>Page not found</h1>'
        f'<p>We could not find <code>{safe_path}</code> on AI Compass.</p>'
        '<p><a href="/">Go to the homepage</a> · '
        f'<a href="/tools">Browse all {count} curated AI tools</a></p>'
    )
    return _inject_seo_root(html, seo)


def _meta_for_request_path(path: str):
    """Render the SPA shell for `path`. Returns (html, status_code).

    `status_code` is 200 for known routes, 404 for everything else. A
    None return means the dist build is missing entirely (cold deploy).
    """
    base = _get_base_index_html()
    if base is None:
        return None

    normalized = (path or '').strip('/')

    # Tool detail: /tools/<slug> — must validate the slug. A non-existent
    # slug used to fall through and serve the homepage SEO shell.
    if normalized.startswith('tools/') and normalized.count('/') == 1:
        slug = normalized.split('/', 1)[1]
        tools = get_cached_tools() or []
        tool = next(
            (t for t in tools if str(t.get('slug', '')).strip().lower() == slug.strip().lower()),
            None,
        )
        if tool:
            name = tool.get('name') or slug
            desc = (
                tool.get('shortDescription')
                or tool.get('tagline')
                or tool.get('description')
                or f'{name} — pricing, features, platforms, and student-friendly alternatives on AI Compass.'
            )
            html = _inject_meta(
                base,
                title=f'{name} — AI Compass',
                description=desc,
                canonical_path=f'/tools/{slug}',
                image_url=f'https://ai-compass.in/og/{slug}.png',
            )
            return _inject_seo_root(html, _seo_body(normalized, tool=tool)), 200
        return _not_found_html(base, path), 404

    # Alternatives: /alternatives/<slug> — must emit its OWN canonical.
    # Without this the SPA fallback served the static homepage canonical,
    # so Google flagged every alternatives page "Alternate page with proper
    # canonical tag" and refused to index it.
    if normalized.startswith('alternatives/') and normalized.count('/') == 1:
        slug = normalized.split('/', 1)[1]
        tools = get_cached_tools() or []
        tool = next(
            (t for t in tools if str(t.get('slug', '')).strip().lower() == slug.strip().lower()),
            None,
        )
        if tool:
            name = tool.get('name') or slug
            tool_cat = str(tool.get('category') or '').strip().lower()
            alts = [
                t for t in tools
                if t is not tool
                and str(t.get('category') or '').strip().lower() == tool_cat
                and t.get('slug') and t.get('name')
            ][:12]
            html = _inject_meta(
                base,
                title=f'Top {name} Alternatives in 2026 | AI Compass',
                description=(
                    f'Hand-tested alternatives to {name}, ranked by similarity. '
                    'Free tiers, pricing, and use cases compared. Curated by AI Compass.'
                ),
                canonical_path=f'/alternatives/{slug}',
                image_url=f'https://ai-compass.in/og/{slug}.png',
            )
            return _inject_seo_root(html, _seo_alternatives(tool, alts)), 200
        return _not_found_html(base, path), 404

    # Collections slugs come from the DB and aren't cheap to validate
    # here, so we let those fall through to the SPA which renders its
    # own "collection not found" UI client-side.
    if normalized.startswith('collections/') and normalized.count('/') == 1:
        html = _inject_meta(
            base,
            title='Collection — AI Compass',
            description='Curated collection of AI tools on AI Compass.',
            canonical_path=f'/{normalized}',
        )
        return _inject_seo_root(html, _seo_body('collections')), 200

    # Homepage — keep server title/description identical to the client
    # (HomePage.jsx <Helmet>) so crawlers and users never see a mismatch.
    if normalized == '':
        title = 'Free AI Tools for Students — 400+ Hand-Tested | AI Compass'
        desc = (
            '400+ free and freemium AI tools, hand-tested for students. '
            'Find the right one in 30 seconds. No login, no signup, no ranking tricks.'
        )
        html = _inject_meta(base, title=title, description=desc, canonical_path='/')
        return _inject_seo_root(html, _seo_body('')), 200

    # Static route meta
    if normalized in _ROUTE_META:
        title, desc = _ROUTE_META[normalized]
        # /tools description carries {count} as a template — sub in the
        # live figure so the crawler-visible meta stays in sync with
        # /api/v1/stats. Other routes' descriptions don't reference count.
        if normalized == 'tools':
            desc = desc.format(count=_total_tools())
        html = _inject_meta(base, title=title, description=desc, canonical_path=f'/{normalized}')
        return _inject_seo_root(html, _seo_body(normalized)), 200

    # Known SPA route with no server-side meta (login, dashboard, etc.):
    # serve the shell unchanged. Status 200.
    if normalized in _KNOWN_SPA_ROUTES:
        return base, 200

    # Anything else: real 404 (still serving the SPA shell so the React
    # NotFoundPage can render — but with the right HTTP status for
    # crawlers and link-checkers).
    return _not_found_html(base, path), 404


@main_bp.route('/health', strict_slashes=False)
def health_check():
    database_status = 'ok'
    tools_cache_status = 'ok'

    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        database_status = 'error'

    try:
        get_cached_tools()
    except Exception:
        tools_cache_status = 'error'

    status = 'ok' if database_status == 'ok' and tools_cache_status == 'ok' else 'degraded'
    return jsonify({
        'status': status,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'checks': {
            'database': database_status,
            'tools_cache': tools_cache_status,
        },
    })


@main_bp.route('/sitemap.xml')
def sitemap():
    # Ensure cache is primed in case this route is hit before startup priming.
    get_cached_tools()

    base = 'https://ai-compass.in'
    urls = []
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # `lastmod = today` for the static URLs (was hardcoded to dates that
    # got stale within weeks). The homepage, /tools, and listicles all
    # surface content that can change every deploy (new tools added, copy
    # tweaked, listicle re-tested), so claiming a frozen April 2026 date
    # was suppressing recrawl. The per-tool / per-alternatives URLs below
    # already used `today`; static URLs now match.
    static = [
        ('/', '1.0', 'weekly'),
        ('/tools', '0.9', 'weekly'),
        ('/ai-tool-finder', '0.8', 'monthly'),
        ('/best-ai-tools-for-students', '0.9', 'weekly'),
        ('/best-free-ai-tools', '0.9', 'weekly'),
        ('/best-coding-tools-for-students', '0.9', 'weekly'),
        ('/best-jasper-alternatives', '0.9', 'weekly'),
        ('/best-murf-alternatives', '0.9', 'weekly'),
        ('/best-synthesia-alternatives', '0.9', 'weekly'),
        ('/best-ai-tools-for-fiction-writers', '0.9', 'weekly'),
        ('/collections', '0.7', 'weekly'),
        # Public static routes that were previously absent from the sitemap
        # despite being indexable. Lower priority — these aren't conversion
        # surfaces, just trust pages — but worth declaring so crawlers find
        # and refresh them on a sensible cadence.
        ('/compare', '0.5', 'monthly'),
        ('/team', '0.4', 'monthly'),
        ('/contact', '0.3', 'yearly'),
        ('/privacy', '0.2', 'yearly'),
        ('/terms', '0.2', 'yearly'),
    ]
    for path, priority, freq in static:
        safe_path = escape(str(path))
        safe_priority = escape(str(priority))
        safe_freq = escape(str(freq))
        urls.append(
            f'<url><loc>{base}{safe_path}</loc><lastmod>{today}</lastmod><changefreq>{safe_freq}</changefreq><priority>{safe_priority}</priority></url>'
        )

    for slug, _ in TOOL_CACHE.items():
        safe_slug = escape(str(slug))
        urls.append(
            f'<url><loc>{base}/tools/{safe_slug}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'
        )
        urls.append(
            f'<url><loc>{base}/alternatives/{safe_slug}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>'
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(urls)
        + '\n</urlset>'
    )
    return Response(xml, mimetype='application/xml')


@main_bp.route('/robots.txt')
def robots():
    # Disallow rules cover routes that either require auth (so crawlers
    # would just see a login redirect) or are operationally not for
    # public discovery. Most of these would already 401/redirect for
    # crawlers, but declaring them saves crawl budget and stops Google
    # surfacing login pages in SERPs.
    content = (
        'User-agent: *\n'
        'Allow: /\n'
        'Disallow: /go/\n'        # affiliate/outbound redirects — not for crawling
        'Disallow: /admin\n'      # admin panel — auth-gated, no SEO value
        'Disallow: /dashboard\n'  # logged-in dashboard
        'Disallow: /profile\n'    # logged-in profile
        'Disallow: /login\n'      # login form
        'Disallow: /register\n'   # signup form
        'Disallow: /auth/\n'      # OAuth callback paths
        'Disallow: /unsubscribe\n'  # tokenised, single-use
        'Disallow: /icon/\n'      # internal favicon proxy
        'Disallow: /og/\n'        # generated per-tool social cards
        'Sitemap: https://ai-compass.in/sitemap.xml\n'
    )
    return Response(content, mimetype='text/plain')


@main_bp.route('/go/<slug>')
def outbound(slug):
    """Single tracked outbound hop for every 'Visit tool' click.

    Resolves affiliate URL (if the tool is enrolled) else the tool's normal
    link. Centralising this means affiliate links can change without a
    frontend redeploy, and every click is logged in one place for revenue
    analytics. Marked noindex/nofollow so it never affects SEO.
    """
    from app.affiliates import affiliate_for

    slug_l = (slug or '').strip().lower()
    tool = next(
        (t for t in (get_cached_tools() or [])
         if str(t.get('slug', '')).strip().lower() == slug_l),
        None,
    )
    if tool is None:
        return redirect('/tools', code=302)

    aff = affiliate_for(slug_l)
    db_aff = (str(tool.get('affiliate_url') or '').strip()) or None
    dest = (
        aff
        or db_aff
        or tool.get('link')
        or tool.get('url')
        or tool.get('website')
    )
    if not dest:
        return redirect(f'/tools/{slug_l}', code=302)

    # A click is "affiliate" if the destination is a monetised link from
    # EITHER source: the affiliates.py registry OR an admin-set
    # affiliate_url on the catalog row. Previously only registry links
    # counted, so every affiliate added via the admin panel was logged
    # as non-affiliate and silently missing from revenue analytics.
    is_aff = bool(aff or db_aff)

    try:
        current_app.logger.info(
            'outbound_click slug=%s affiliate=%s', slug_l, is_aff
        )
        from app.models import OutboundClick
        db.session.add(OutboundClick(slug=slug_l, is_affiliate=is_aff))
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass

    resp = redirect(dest, code=302)
    resp.headers['X-Robots-Tag'] = 'noindex, nofollow'
    resp.headers['Referrer-Policy'] = 'no-referrer-when-downgrade'
    return resp


# --- First-party favicon proxy --------------------------------------------
# Tool logos previously loaded straight from icons.duckduckgo.com in the
# browser. Privacy blockers (Brave Shields, uBlock, network policies)
# block that third-party request, so a large slice of users saw bland
# letter tiles instead of logos everywhere on the site. Proxying through
# our own origin makes it a first-party request (unblockable by shields),
# cached, and fast. ToolLogo points its <img> here; on a genuine miss we
# 404 so the component can still fall back to emoji/letter.
_ICON_CACHE: dict[str, bytes] = {}
_ICON_NEG_CACHE: set[str] = set()
_ICON_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _fetch_icon_bytes(domain: str) -> bytes | None:
    """Fetch a favicon for a bare domain, server-side. Tries DuckDuckGo
    then Google's s2 service. Returns image bytes or None."""
    import urllib.request

    for url in (
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        f"https://www.google.com/s2/favicons?domain={domain}&sz=64",
    ):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _ICON_UA})
            with urllib.request.urlopen(req, timeout=4) as r:
                if r.status != 200:
                    continue
                data = r.read()
            # Reject empty or implausibly tiny payloads (blank/placeholder).
            if data and len(data) >= 70:
                return data
        except Exception:
            continue
    return None


@main_bp.route('/icon/<path:domain>')
def tool_icon(domain):
    """Cached, first-party favicon proxy for a bare hostname."""
    dom = (domain or '').strip().lower().rstrip('/')
    # Accept only sane hostnames; strip scheme/path if any slipped in.
    dom = re.sub(r'^https?://', '', dom).split('/')[0].lstrip('.')
    if not dom or not re.fullmatch(r'[a-z0-9.-]{3,253}', dom) or '.' not in dom:
        return Response(status=404)

    if dom in _ICON_CACHE:
        body = _ICON_CACHE[dom]
    elif dom in _ICON_NEG_CACHE:
        return Response(status=404)
    else:
        body = _fetch_icon_bytes(dom)
        if body is None:
            if len(_ICON_NEG_CACHE) < 2000:
                _ICON_NEG_CACHE.add(dom)
            return Response(status=404)
        if len(_ICON_CACHE) < 2000:
            _ICON_CACHE[dom] = body

    resp = Response(body, mimetype='image/x-icon')
    resp.headers['Cache-Control'] = 'public, max-age=604800, immutable'
    resp.headers['X-Robots-Tag'] = 'noindex'
    return resp


_OG_CACHE: dict[str, bytes] = {}


def _og_font(size: int):
    """Scalable font with no external font-file dependency.

    Pillow >= 10.1 ships a scalable default via load_default(size=...),
    so this works identically on Render without needing system fonts.
    """
    from PIL import ImageFont
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        # Very old Pillow — fixed-size bitmap fallback (degraded but safe).
        return ImageFont.load_default()


def _wrap(draw, text, font, max_width):
    words = str(text).split()
    lines, line = [], ''
    for w in words:
        trial = f'{line} {w}'.strip()
        if draw.textlength(trial, font=font) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines[:3]


@main_bp.route('/og/<slug>.png')
def og_image(slug):
    """Branded 1200x630 social card per tool. Falls back to the static
    brand image if Pillow is unavailable or the tool is unknown."""
    slug = (slug or '').strip().lower()
    if slug in _OG_CACHE:
        return Response(_OG_CACHE[slug], mimetype='image/png')

    tool = next(
        (t for t in (get_cached_tools() or [])
         if str(t.get('slug', '')).strip().lower() == slug),
        None,
    )
    if tool is None:
        return redirect('/og-image.png', code=302)

    try:
        import io

        from PIL import Image, ImageDraw

        BG, INK, ACCENT, MUTED = (14, 19, 17), (241, 242, 238), (47, 179, 137), (148, 163, 158)
        img = Image.new('RGB', (1200, 630), BG)
        d = ImageDraw.Draw(img)

        # Accent compass ring + corner bar
        d.ellipse((84, 84, 168, 168), outline=ACCENT, width=8)
        d.line((126, 96, 126, 156), fill=ACCENT, width=8)
        d.line((96, 126, 156, 126), fill=ACCENT, width=8)
        d.rectangle((0, 0, 1200, 10), fill=ACCENT)

        d.text((196, 104), 'AI COMPASS', font=_og_font(34), fill=ACCENT)

        name = str(tool.get('name') or slug)
        f_name = _og_font(82)
        y = 250
        for ln in _wrap(d, name, f_name, 1000):
            d.text((90, y), ln, font=f_name, fill=INK)
            y += 96

        bits = [b for b in (
            tool.get('category'),
            tool.get('pricing') or tool.get('price'),
            'Student-friendly' if (tool.get('studentPerk') or tool.get('student_perk')) else None,
        ) if b]
        if bits:
            d.text((90, y + 8), '  ·  '.join(str(b) for b in bits),
                    font=_og_font(38), fill=MUTED)

        d.text((90, 548), 'ai-compass.in', font=_og_font(36), fill=ACCENT)
        d.text((860, 548), f'{_total_tools()} hand-tested AI tools', font=_og_font(30), fill=MUTED)

        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        data = buf.getvalue()
        if len(_OG_CACHE) < 600:
            _OG_CACHE[slug] = data
        return Response(data, mimetype='image/png',
                        headers={'Cache-Control': 'public, max-age=86400'})
    except Exception:
        # Pillow missing/broken — never break unfurls; serve the brand image.
        return redirect('/og-image.png', code=302)


@main_bp.route('/unsubscribe')
def unsubscribe():
    """One-click email opt-out (tokenised, no login needed).

    Handles BOTH sources of digest emails:
    * Registered users — flip User.notifications_enabled to False (kept,
      so the account profile can re-enable from the settings UI).
    * Newsletter subscribers — DELETE the NewsletterSubscriber row (no
      account = no UI to re-enable from, so a clean delete is honest
      about what we're doing).

    A single email may exist in both tables; the route handles both in
    one pass so a user who's BOTH a registered account AND a newsletter
    subscriber gets fully unsubscribed from one click.
    """
    from flask import request

    from app.email_utils import read_unsubscribe_token
    from app.models import NewsletterSubscriber, User

    def _page(msg: str) -> Response:
        html = (
            '<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>AI Compass</title></head>'
            '<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;'
            'background:#fafaf9;color:#0e1311;display:flex;min-height:100vh;'
            'align-items:center;justify-content:center;margin:0">'
            '<div style="max-width:420px;padding:32px;text-align:center">'
            '<div style="font-weight:700;font-size:18px;margin-bottom:14px">AI Compass</div>'
            f'<p style="color:#5b6b64;line-height:1.6">{msg}</p>'
            '<a href="https://ai-compass.in" style="color:#0f5f47;font-weight:600;'
            'text-decoration:none">Back to AI Compass</a></div></body></html>'
        )
        return Response(html, mimetype='text/html')

    token = request.args.get('token', '')
    email = read_unsubscribe_token(token)
    if not email:
        return _page('This unsubscribe link is invalid or has expired.')

    changed = False

    user = User.query.filter_by(email=email).first()
    if user is not None and user.notifications_enabled:
        user.notifications_enabled = False
        changed = True

    subscriber = NewsletterSubscriber.query.filter_by(email=email).first()
    if subscriber is not None:
        db.session.delete(subscriber)
        changed = True

    if changed:
        db.session.commit()
        return _page(
            'You have been unsubscribed from AI Compass updates. '
            'Registered accounts can re-enable notifications from profile '
            'settings; newsletter-only subscribers can re-subscribe from '
            'the homepage anytime.'
        )

    return _page('You are already unsubscribed.')


@main_bp.route('/tool/<slug>')
def redirect_tool_singular(slug):
    return redirect(f'/tools/{slug}', code=301)


@main_bp.route('/', defaults={'path': ''})
@main_bp.route('/<path:path>')
def serve_react(path):
    if path.startswith('api/'):
        from flask import abort
        abort(404)

    server_auth_routes = ['auth/google', 'auth/google/callback', 'login/google', 'login/github']
    if any(path == route or path.startswith(f"{route}/") for route in server_auth_routes):
        from flask import abort
        abort(404)

    # /auth/callback is a React route; let it fall through to index.html.

    file_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(file_path) and os.path.isfile(file_path):
        response = send_from_directory(DIST_DIR, path)
        # Vite content-hashes everything under /assets/ — the filename
        # itself contains a hash of the bytes, so the URL changes
        # whenever the content does. That means we can cache them
        # forever; the browser will only re-fetch when the HTML points
        # at a new hashed URL. immutable tells the browser to skip
        # revalidation entirely (no If-Modified-Since round trip),
        # which is exactly what we want for hashed assets.
        #
        # Other static files (favicon.svg, og-image.png, apple-touch-
        # icon.png, icons.svg) don't have hashes and we update them in
        # place occasionally, so a 1-day cache is the right trade — a
        # day of stale icons is fine, but they don't need a round trip
        # on every page nav either.
        if path.startswith('assets/'):
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        else:
            response.headers['Cache-Control'] = 'public, max-age=86400'
        return response

    result = _meta_for_request_path(path)
    if result is not None:
        html, status = result
        return Response(html, mimetype='text/html', status=status)

    return '<h2>Run: cd frontend && npm run build</h2>', 404
