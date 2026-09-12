"""Regenerate the favicon/app-icon set from the compass mark geometry.

frontend/public/favicon.svg is the source of truth for the mark, but the
icon set also needs raster formats the SVG can't cover: favicon.ico for the
browsers and crawlers that still request /favicon.ico by name, and the
192/512 PNGs the web manifest points at for Android home-screen installs.

There is no SVG rasteriser in requirements.txt (cairosvg pulls a native
Cairo dependency that Render's free instance does not need to carry), so
the six shapes are re-drawn here with Pillow at 8x and downsampled. Keep
these coordinates in sync with favicon.svg if the mark ever changes.

    python scripts/generate_icons.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

PUBLIC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'frontend', 'public',
)

BG = (15, 20, 17, 255)          # #0F1411
ACCENT = (47, 179, 137, 255)    # #2FB389
NEEDLE_S = (15, 95, 71, 255)    # #0F5F47 — the south half of the needle
PIVOT = (250, 250, 247, 255)    # #FAFAF7

SS = 8  # supersample factor; the mark is thin-stroked and aliases badly at 1x


def render(size: int) -> Image.Image:
    """Draw the compass mark at `size` px, from the 64-unit viewBox."""
    n = size * SS
    k = n / 64.0  # viewBox unit -> supersampled pixel
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def circle(cx, cy, r, **kw):
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], **kw)

    def poly(points, fill):
        d.polygon([(x * k, y * k) for x, y in points], fill=fill)

    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=14 * k, fill=BG)
    circle(32, 32, 22, outline=ACCENT, width=max(1, round(2.5 * k)))
    # The r=16 ring is stroked at 35% opacity in the SVG; flatten it against
    # the known background rather than compositing a second layer.
    faint = tuple(round(b + (a - b) * 0.35) for a, b in zip(ACCENT, BG))
    circle(32, 32, 16, outline=faint, width=max(1, round(1 * k)))
    poly([(32, 14), (27, 34), (32, 32), (37, 34)], ACCENT)
    poly([(32, 50), (28, 30), (32, 32), (36, 30)], NEEDLE_S)
    circle(32, 32, 2.5, fill=PIVOT)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    # A flat two-colour mark quantises to a tiny palette with no visible
    # loss, which is what keeps the 512px icon in the low tens of KB.
    for px in (192, 512):
        path = os.path.join(PUBLIC_DIR, f'icon-{px}.png')
        render(px).quantize(colors=64, method=Image.FASTOCTREE).save(
            path, optimize=True
        )
        print(f'{path}  {os.path.getsize(path):,} bytes')

    ico = os.path.join(PUBLIC_DIR, 'favicon.ico')
    render(64).save(ico, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'{ico}  {os.path.getsize(ico):,} bytes')

    atc = os.path.join(PUBLIC_DIR, 'apple-touch-icon.png')
    render(180).quantize(colors=64, method=Image.FASTOCTREE).save(
        atc, optimize=True
    )
    print(f'{atc}  {os.path.getsize(atc):,} bytes')


if __name__ == '__main__':
    main()
