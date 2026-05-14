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
    'tools': ('AI Tools Directory — AI Compass', 'Browse 400+ curated AI tools by category, rating, and pricing. Find the right tool for writing, coding, research, and more.'),
    'ai-tool-finder': ('AI Tool Finder Wizard — AI Compass', 'Answer 4 questions and get 5-6 AI tools picked for you. Free, no login, no ranking tricks.'),
    'compare': ('Compare AI Tools — AI Compass', 'Side-by-side comparison of AI tools — pricing, features, platforms, and ratings.'),
    'collections': ('AI Tool Collections — AI Compass', 'Curated collections — best free, best for students, best for coding, and more.'),
    'best-ai-tools-for-students': ('Best AI Tools for Students — AI Compass', 'Hand-picked AI tools for studying, writing essays, coding, and research. Student-friendly pricing and perks.'),
    'best-free-ai-tools': ('Best Free AI Tools — AI Compass', 'The best AI tools you can use without paying. Curated and ranked by quality, not popularity.'),
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
            return _inject_meta(
                base,
                title=f'{name} — AI Compass',
                description=desc,
                canonical_path=f'/tools/{slug}',
            )

    # Static route meta
    if normalized in _ROUTE_META:
        title, desc = _ROUTE_META[normalized]
        return _inject_meta(base, title=title, description=desc, canonical_path=f'/{normalized}')

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
