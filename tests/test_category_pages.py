"""Category landing pages: /categories, /category/<slug>, and their API.

The thing most worth locking down here isn't the happy path — it's that an
unknown slug 404s rather than serving a plausible-looking empty category,
and that paid placement cannot pick which comparison pages get submitted to
Google. Both have quiet failure modes: the first shows up as junk in Search
Console weeks later, the second as a promise on /how-we-rank that the
sitemap no longer keeps.
"""

import re

from app import categories as category_index


def test_categories_api_lists_every_visible_category(client):
    response = client.get('/api/v1/categories')
    assert response.status_code == 200
    data = response.get_json()
    assert data['categories'], 'catalog should yield at least one category'
    for entry in data['categories']:
        assert entry['slug'] and entry['name']
        assert entry['count'] >= 1
        assert entry['description']
        assert isinstance(entry['indexable'], bool)
    # Biggest first — the hub grid relies on this order.
    counts = [c['count'] for c in data['categories']]
    assert counts == sorted(counts, reverse=True)


def test_category_api_returns_tools_and_related(client):
    slug = category_index.build_index()[0]['slug']
    response = client.get(f'/api/v1/categories/{slug}')
    assert response.status_code == 200
    data = response.get_json()
    assert data['slug'] == slug
    assert len(data['tools']) == data['count']
    assert all(t.get('slug') for t in data['tools'])
    assert slug not in {c['slug'] for c in data['related']}
    # Cards only: the heaviest catalog field must not ride along.
    assert all('pricing_tiers' not in t for t in data['tools'])


def test_category_api_404s_for_unknown_slug(client):
    response = client.get('/api/v1/categories/not-a-real-category')
    assert response.status_code == 404
    assert 'error' in response.get_json()


def test_category_page_serves_its_own_canonical_and_title(client):
    slug = category_index.build_index()[0]['slug']
    html = client.get(f'/category/{slug}').get_data(as_text=True)
    assert f'https://ai-compass.in/category/{slug}' in html
    # The crawler shell must carry the tool links, not just the SPA mount.
    assert '/tools/' in html


def test_unknown_category_page_is_a_real_404(client):
    response = client.get('/category/not-a-real-category')
    assert response.status_code == 404
    assert 'Page not found' in response.get_data(as_text=True)


def test_thin_categories_are_noindex_and_absent_from_sitemap(client, monkeypatch):
    """A category under MIN_INDEXABLE still renders, but isn't advertised."""
    index = category_index.build_index()
    assert index, 'need at least one category to exercise the threshold'
    smallest = min(index, key=lambda c: c['count'])

    # Push the bar above the smallest real category so it becomes "thin"
    # without needing a fixture category that the catalog doesn't have.
    monkeypatch.setattr(category_index, 'MIN_INDEXABLE', smallest['count'] + 1)

    response = client.get(f'/category/{smallest["slug"]}')
    assert response.status_code == 200, 'a thin category still serves a page'
    assert 'noindex, follow' in response.get_data(as_text=True)

    sitemap = client.get('/sitemap.xml').get_data(as_text=True)
    assert f'/category/{smallest["slug"]}<' not in sitemap


def test_sitemap_carries_categories_and_unique_compare_pairs(client):
    sitemap = client.get('/sitemap.xml').get_data(as_text=True)
    locs = re.findall(r'<loc>([^<]+)</loc>', sitemap)

    assert len(locs) == len(set(locs)), 'sitemap must not repeat a URL'
    assert 'https://ai-compass.in/categories' in locs

    indexable = set(category_index.indexable_slugs())
    assert indexable, 'expected at least one indexable category'
    for slug in indexable:
        assert f'https://ai-compass.in/category/{slug}' in locs

    pairs = [l for l in locs if '/compare/' in l and '-vs-' in l]
    assert pairs, 'expected comparison pairs in the sitemap'
    # Each pair is emitted in one direction only — (a, b) and (b, a) are two
    # URLs for one page and would be duplicate content.
    normalised = {tuple(sorted(l.rsplit('/', 1)[-1].split('-vs-'))) for l in pairs}
    assert len(normalised) == len(pairs)


def test_sponsorship_cannot_pick_indexed_compare_pairs(monkeypatch):
    """Paid placement reorders a labelled card, not the sitemap.

    A sponsored tool with a rock-bottom curation score must not be dragged
    into the indexed top-8 of its category.
    """
    slug = category_index.build_index()[0]['slug']
    baseline = [t['slug'] for t in category_index.tools_for(
        slug, limit=8, sponsored_first=False,
    )]

    # Make the worst-ranked tool in the category "sponsored".
    everything = category_index.tools_for(slug, sponsored_first=False)
    worst = everything[-1]['slug']
    # Patched on api_routes, not tool_cache: api_routes binds the name at
    # import time (`from app.tool_cache import _sponsored_active`), so
    # patching the source module leaves _placement_rank on the original.
    monkeypatch.setattr(
        'app.api_routes._sponsored_active',
        lambda tool: tool.get('slug') == worst,
    )

    assert [t['slug'] for t in category_index.tools_for(
        slug, limit=8, sponsored_first=False,
    )] == baseline, 'sitemap selection must ignore sponsorship'

    # …while the page itself does surface it, where it renders labelled.
    on_page = [t['slug'] for t in category_index.tools_for(slug, limit=8)]
    assert on_page[0] == worst
