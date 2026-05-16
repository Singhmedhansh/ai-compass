import html as html_module
import os
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from flask import Blueprint, Response, jsonify, redirect, send_from_directory
from sqlalchemy import text

from app import db
from app.tool_cache import TOOL_CACHE, get_cached_tools

main_bp = Blueprint('main', __name__)

DIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'static', 'dist'
)

# Per-route static meta (title, description). /tools/<slug> is handled
# dynamically against the tool catalog below.
_ROUTE_META = {
    'tools': ('AI Tools Directory — AI Compass', 'Browse 399 curated AI tools by category, rating, and pricing. Find the right tool for writing, coding, research, and more.'),
    'ai-tool-finder': ('AI Tool Finder Wizard — AI Compass', 'Answer 4 questions and get 5-6 AI tools picked for you. Free, no login, no ranking tricks.'),
    'compare': ('Compare AI Tools — AI Compass', 'Side-by-side comparison of AI tools — pricing, features, platforms, and ratings.'),
    'collections': ('AI Tool Collections — AI Compass', 'Curated collections — best free, best for students, best for coding, and more.'),
    'best-ai-tools-for-students': ('Best AI Tools for Students — AI Compass', 'Hand-picked AI tools for studying, writing essays, coding, and research. Student-friendly pricing and perks.'),
    'best-free-ai-tools': ('Best Free AI Tools — AI Compass', 'The best AI tools you can use without paying. Curated and ranked by quality, not popularity.'),
    'best-coding-tools-for-students': ('Best Coding Tools for Students — AI Compass', 'The 10 best AI coding tools for student developers — Cursor, GitHub Copilot, Claude Code, Supabase, v0, Netlify. Free tiers and student plans, hand-tested.'),
    'best-jasper-alternatives': ('10 Best Jasper AI Alternatives in 2026 — AI Compass', 'Jasper is $39+/mo and built for marketing teams. These 10 alternatives are cheaper, better suited to fiction, academic, and student workflows — most with usable free tiers.'),
    'best-murf-alternatives': ('10 Best Murf AI Alternatives in 2026 — AI Compass', "Murf is no longer the voice-quality leader. These 10 alternatives — led by ElevenLabs — have better voices, usable free tiers, and pricing that doesn't feel like a 2022 SaaS quote."),
    'best-synthesia-alternatives': ('10 Best Synthesia Alternatives in 2026 — AI Compass', "Synthesia is $22+/mo for AI avatar videos most creators don't need. These 10 alternatives — led by Pictory — split into cheaper avatar tools and 'AI video without avatars' for explainers, training, and social shorts."),
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


def _inject_meta(base_html: str, *, title: str, description: str, canonical_path: str | None = None) -> str:
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
    replaced, count = re.subn(
        r'<div id="root">\s*</div>',
        f'<div id="root">{hidden}</div>',
        out_html,
        count=1,
    )
    return replaced if count else out_html


def _seo_body(normalized: str, tool: dict | None = None) -> str:
    """Build a minimal semantic HTML block for crawlers, per route."""
    if tool is not None:
        name = _esc(tool.get('name'))
        desc = _esc(tool.get('shortDescription') or tool.get('description'))
        category = _esc(tool.get('category'))
        pricing = _esc(tool.get('pricing') or tool.get('price'))
        link = _esc(tool.get('url') or tool.get('website') or tool.get('link'))
        parts = [f'<h1>{name}</h1>']
        if desc:
            parts.append(f'<p>{desc}</p>')
        meta_bits = []
        if category:
            meta_bits.append(f'Category: {category}')
        if pricing:
            meta_bits.append(f'Pricing: {pricing}')
        if meta_bits:
            parts.append(f'<p>{" · ".join(meta_bits)}</p>')
        if link:
            parts.append(f'<p><a href="{link}" rel="nofollow noopener">Visit {name}</a></p>')
        parts.append('<p><a href="/tools">Browse all 399 curated AI tools on AI Compass</a></p>')
        return ''.join(parts)

    if normalized in ('', 'tools'):
        tools = get_cached_tools() or []
        heading = (
            'AI Compass — 399 Hand-Tested AI Tools for Students'
            if normalized == ''
            else 'AI Tools Directory — AI Compass'
        )
        items = []
        for t in tools:
            slug = _esc(t.get('slug'))
            tname = _esc(t.get('name'))
            tdesc = _esc(t.get('shortDescription') or t.get('description'))
            if not slug or not tname:
                continue
            items.append(
                f'<li><a href="/tools/{slug}">{tname}</a>'
                + (f' — {tdesc}' if tdesc else '')
                + '</li>'
            )
        return (
            f'<h1>{heading}</h1>'
            '<p>Hand-curated, hand-tested AI tools for students — writing, coding, '
            'research, design, image, video, audio, and study tools. Free to browse, '
            'no login required.</p>'
            f'<ul>{"".join(items)}</ul>'
        )

    if normalized in _ROUTE_META:
        title, desc = _ROUTE_META[normalized]
        return f'<h1>{_esc(title)}</h1><p>{_esc(desc)}</p><p><a href="/tools">Browse all 399 curated AI tools</a></p>'

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
        '<a href="/tools">Browse all 399 curated AI tools</a></p>'
    )


def _meta_for_request_path(path: str):
    base = _get_base_index_html()
    if base is None:
        return None

    normalized = (path or '').strip('/')

    # Tool detail: /tools/<slug>
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
                or tool.get('description')
                or f'{name} — pricing, features, platforms, and student-friendly alternatives on AI Compass.'
            )
            html = _inject_meta(
                base,
                title=f'{name} — AI Compass',
                description=desc,
                canonical_path=f'/tools/{slug}',
            )
            return _inject_seo_root(html, _seo_body(normalized, tool=tool))

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
            )
            return _inject_seo_root(html, _seo_alternatives(tool, alts))

    # Homepage — keep server title/description identical to the client
    # (HomePage.jsx <Helmet>) so crawlers and users never see a mismatch.
    if normalized == '':
        title = 'AI Compass — 399 Hand-Tested AI Tools for Students'
        desc = (
            'Curated AI tools directory for students. 399 tools hand-tested, '
            'with a one-line reason each. Free to browse, updated weekly.'
        )
        html = _inject_meta(base, title=title, description=desc, canonical_path='/')
        return _inject_seo_root(html, _seo_body(''))

    # Static route meta
    if normalized in _ROUTE_META:
        title, desc = _ROUTE_META[normalized]
        html = _inject_meta(base, title=title, description=desc, canonical_path=f'/{normalized}')
        return _inject_seo_root(html, _seo_body(normalized))

    return base


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

    static = [
        ('/', '1.0', 'weekly', '2026-04-23'),
        ('/tools', '0.9', 'weekly', '2026-04-18'),
        ('/ai-tool-finder', '0.8', 'monthly', '2026-04-29'),
        ('/best-ai-tools-for-students', '0.9', 'weekly', '2026-04-19'),
        ('/best-free-ai-tools', '0.9', 'weekly', '2026-04-20'),
        ('/best-coding-tools-for-students', '0.9', 'weekly', '2026-05-14'),
        ('/best-jasper-alternatives', '0.9', 'weekly', '2026-05-14'),
        ('/best-murf-alternatives', '0.9', 'weekly', '2026-05-14'),
        ('/best-synthesia-alternatives', '0.9', 'weekly', '2026-05-14'),
        ('/collections', '0.7', 'weekly', '2026-04-16'),
    ]
    for path, priority, freq, lastmod in static:
        safe_path = escape(str(path))
        safe_priority = escape(str(priority))
        safe_freq = escape(str(freq))
        safe_lastmod = escape(str(lastmod))
        urls.append(
            f'<url><loc>{base}{safe_path}</loc><lastmod>{safe_lastmod}</lastmod><changefreq>{safe_freq}</changefreq><priority>{safe_priority}</priority></url>'
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
    content = 'User-agent: *\nAllow: /\nSitemap: https://ai-compass.in/sitemap.xml'
    return Response(content, mimetype='text/plain')


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
        return send_from_directory(DIST_DIR, path)

    html_with_meta = _meta_for_request_path(path)
    if html_with_meta is not None:
        return Response(html_with_meta, mimetype='text/html')

    return '<h2>Run: cd frontend && npm run build</h2>', 404
