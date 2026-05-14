#!/usr/bin/env python3
"""One-shot script to populate the icon field for tools that lack one.

For each tool with an empty/missing icon, derive a domain from the tool's
URL field (`link` in the live schema; `url`/`website` are legacy aliases)
and set icon to Clearbit's logo CDN URL for that domain. The React
components handle the case where Clearbit doesn't have a logo for a given
domain (HTTP 404 -> img.onError fires -> chained fallback to favicon
services and finally to an initial-letter circle).

Skips tools whose URL points to a generic multi-tenant host (github.com,
huggingface.co, etc.) where Clearbit would return the parent site's logo,
not the tool's. Those tools keep icon: "" and fall back in the UI.

Committed for traceability of how icon URLs were populated in bulk.
"""
import json
from pathlib import Path
from urllib.parse import urlparse


# Clearbit returns the parent site's logo for these generic hosts, not the
# specific tool's logo. Leave their icon empty; UI falls back to initial.
SKIP_HOSTS = {
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'huggingface.co',
    'replicate.com',
}


def get_logo_domain(url):
    """Extract the domain for Clearbit lookup, or None if we should skip."""
    if not url:
        return None
    try:
        parsed = urlparse(url if '://' in url else f'https://{url}')
        host = (parsed.hostname or '').lower()
        if not host:
            return None
        if host.startswith('www.'):
            host = host[4:]
        if host in SKIP_HOSTS:
            return None
        return host
    except Exception:
        return None


def main():
    tools_path = Path('data/tools.json')
    with open(tools_path, encoding='utf-8') as f:
        tools = json.load(f)

    populated = []
    skipped_generic = []
    skipped_no_url = []
    already_has_icon = 0

    for tool in tools:
        if (tool.get('icon') or '').strip():
            already_has_icon += 1
            continue

        # tools.json uses `link` as the canonical URL field; `url` and `website`
        # are legacy aliases that still appear on a handful of older entries.
        url = tool.get('link') or tool.get('url') or tool.get('website') or ''
        if not url:
            skipped_no_url.append(tool.get('name'))
            continue

        domain = get_logo_domain(url)
        if not domain:
            skipped_generic.append((tool.get('name'), url))
            continue

        tool['icon'] = f'https://logo.clearbit.com/{domain}'
        populated.append((tool.get('name'), domain))

    with open(tools_path, 'w', encoding='utf-8') as f:
        json.dump(tools, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f'Already had icons: {already_has_icon}')
    print(f'Populated: {len(populated)}')
    for name, domain in populated:
        print(f'  + {name}: logo.clearbit.com/{domain}')
    print(f'Skipped (generic host): {len(skipped_generic)}')
    for name, url in skipped_generic:
        print(f'  - {name}: {url}')
    print(f'Skipped (no URL): {len(skipped_no_url)}')
    for name in skipped_no_url:
        print(f'  - {name}')


if __name__ == '__main__':
    main()
