#!/usr/bin/env python3
"""Advisory duplicate checker for data/tools.json.

Reports possible duplicates by three criteria — exact slug, normalized name,
and URL hostname — so a human can decide whether each pair is a real duplicate
or a legitimate variant (e.g., 'Notion' and 'Notion AI' as distinct entries).

Unlike scripts/validate_tools.py (which is a strict CI gate), this script is
advisory: it exits 0 with a report and only exits 1 if --strict is passed and
exact-slug duplicates exist (slug collisions ARE always bugs).

Run manually before adding new tools, or after bulk imports. Wire into CI later
if the catalog grows beyond manual review.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse


# Common suffixes that don't disambiguate — flagged for review, not auto-merged
# (e.g., "Notion" vs "Notion AI" can be legitimately separate entries).
NAME_SUFFIXES_TO_STRIP = [
    ' ai', ' app', ' (beta)', ' (alpha)', '.io', '.com', '.dev', '.app',
    ' by google', ' by openai', ' by anthropic', ' by microsoft',
]

# Hosts where many independent products live under unique path prefixes
# (github.com/foo, github.com/bar). Host-only matching here produces false
# positives; require the first path segment to also match before flagging.
MULTI_TENANT_HOSTS = {
    'github.com', 'gitlab.com', 'huggingface.co', 'replicate.com',
    'colab.research.google.com', 'aws.amazon.com', 'cloud.google.com',
}


def normalize_name(name: str) -> str:
    if not name:
        return ''
    n = name.lower().strip()
    for suffix in NAME_SUFFIXES_TO_STRIP:
        if n.endswith(suffix):
            n = n[:-len(suffix)].strip()
    return n


def normalize_url(url: str) -> str:
    if not url:
        return ''
    try:
        parsed = urlparse(url if '://' in url else f'https://{url}')
        host = (parsed.hostname or '').lower()
        if host.startswith('www.'):
            host = host[4:]
        if host in MULTI_TENANT_HOSTS:
            first_seg = parsed.path.strip('/').split('/', 1)[0].lower()
            if first_seg:
                return f'{host}/{first_seg}'
        return host
    except Exception:
        return url.lower().strip()


def find_duplicates(tools):
    """Return three lists: slug collisions, name collisions, url collisions."""
    by_slug = {}
    by_name = {}
    by_url = {}

    slug_collisions = []
    name_collisions = []
    url_collisions = []

    for i, t in enumerate(tools):
        slug = (t.get('slug') or '').strip().lower()
        name = normalize_name(t.get('name') or '')
        # tools.json uses `link` as the canonical URL field; `url` and `website` are legacy aliases.
        url = normalize_url(t.get('link') or t.get('url') or t.get('website') or '')

        if slug:
            if slug in by_slug:
                slug_collisions.append((slug, by_slug[slug], i,
                                        tools[by_slug[slug]].get('name'),
                                        t.get('name')))
            else:
                by_slug[slug] = i

        if name:
            if name in by_name:
                name_collisions.append((name, by_name[name], i,
                                        tools[by_name[name]].get('name'),
                                        t.get('name')))
            else:
                by_name[name] = i

        if url:
            if url in by_url:
                url_collisions.append((url, by_url[url], i,
                                       tools[by_url[url]].get('name'),
                                       t.get('name')))
            else:
                by_url[url] = i

    return slug_collisions, name_collisions, url_collisions


def main():
    parser = argparse.ArgumentParser(description='Advisory dedup check for tools.json')
    parser.add_argument('--path', default='data/tools.json',
                        help='Path to tools.json (default: data/tools.json)')
    parser.add_argument('--strict', action='store_true',
                        help='Exit 1 if slug collisions are found (always bugs)')
    args = parser.parse_args()

    tools_path = Path(args.path)
    if not tools_path.exists():
        print(f'ERROR: {tools_path} not found', file=sys.stderr)
        sys.exit(2)

    with open(tools_path, encoding='utf-8') as f:
        tools = json.load(f)

    slug_col, name_col, url_col = find_duplicates(tools)

    print(f'Scanned {len(tools)} tools.\n')

    if slug_col:
        print(f'SLUG COLLISIONS (HARD ERRORS — {len(slug_col)}):')
        for slug, i, j, n1, n2 in slug_col:
            print(f"  slug='{slug}': indices {i} ({n1!r}) and {j} ({n2!r})")
        print()
    else:
        print('No slug collisions.\n')

    if name_col:
        print(f'NORMALIZED-NAME COLLISIONS (review — {len(name_col)}):')
        for name, i, j, n1, n2 in name_col:
            print(f"  name~='{name}': {n1!r} (#{i}) <-> {n2!r} (#{j})")
        print()
    else:
        print('No normalized-name collisions.\n')

    if url_col:
        print(f'URL HOSTNAME COLLISIONS (review — {len(url_col)}):')
        for url, i, j, n1, n2 in url_col:
            print(f"  host='{url}': {n1!r} (#{i}) <-> {n2!r} (#{j})")
        print()
    else:
        print('No URL hostname collisions.\n')

    if args.strict and slug_col:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
