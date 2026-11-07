"""Imports Characters artwork into public/nft-art/<slug>.webp.

Each source is a card capture: artwork on top, card text baked into the lower
part. We keep the artwork, upscale it, and fade the lower part into the card's
night colour so our own card text is the only text shown.

Run: python -I scripts/import-nft-art.py angel=path.png galaxy-soldier=path.png ...
Options (env): ART_KEEP=0.52 (share of the height kept as-is), ART_TRIM=3, ART_TOP=0.05, ART_WIDTH=600
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "nft-art"
KEEP = float(os.environ.get("ART_KEEP", "0.52"))
WIDTH = int(os.environ.get("ART_WIDTH", "600"))
NIGHT = (6, 10, 20)


def convert(src: Path, slug: str):
    im = Image.open(src).convert("RGB")
    # Trim the capture's card border (a few pixels on each side).
    m = int(os.environ.get("ART_TRIM", "3"))
    top = int(im.height * float(os.environ.get("ART_TOP", "0.05")))  # stray UI above the art
    im = im.crop((m, max(m, top), im.width - m, im.height - m))
    scale = WIDTH / im.width
    im = im.resize((WIDTH, round(im.height * scale)), Image.LANCZOS)
    # A touch of sharpening after the upscale.
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    w, h = im.size
    start = int(h * KEEP)
    fade = int(h * 0.08)
    # The art under the baked text, blurred heavily, keeps the colours while hiding the letters.
    blurred = im.filter(ImageFilter.GaussianBlur(28))
    night = Image.new("RGB", (w, h), NIGHT)
    under = Image.blend(blurred, night, 0.72)
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    for y in range(start, h):
        a = min(255, int(255 * (y - start) / max(1, fade)))
        for x in range(w):
            px[x, y] = a
    out = Image.composite(under, im, mask)
    out.save(OUT / f"{slug}.webp", "WEBP", quality=88, method=6)
    print("wrote", OUT / f"{slug}.webp", out.size)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[1:]:
        slug, path = arg.split("=", 1)
        convert(Path(path), slug)
