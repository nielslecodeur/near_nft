"""Samples the theme colours from the visual reference images (no guessing).

Run: python -I scripts/sample-reference-colors.py <full-mockup.png> <card-strip.png>

Prints:
- background: median of the darkest, least saturated corners of the mockup;
- surfaces: card info panels (bottom band of each card in the strip), split in 3 levels;
- accent: the saturated cyan-blue pixels of the price text ("↑ 1.900 EHT");
- text / muted: the bright and mid-grey text pixels of the info panels.
"""
import sys
from collections import Counter

from PIL import Image


def hexc(c):
    return "#%02X%02X%02X" % tuple(int(round(v)) for v in c[:3])


def median(pixels):
    if not pixels:
        return (0, 0, 0)
    cols = list(zip(*pixels))
    return tuple(sorted(c)[len(c) // 2] for c in cols)


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def region(im, box):
    x0, y0, x1, y1 = box
    return [im.getpixel((x, y)) for x in range(x0, x1) for y in range(y0, y1)]


full = Image.open(sys.argv[1]).convert("RGB")
strip = Image.open(sys.argv[2]).convert("RGB")
W, H = full.size

# Background: the room itself (left and right of the cards, above and below them),
# dark pixels only (no grid lines), pure black corners excluded.
room = []
for box in [(0, 0, W, int(H * 0.3)), (0, int(H * 0.8), W, H)]:
    room += region(full, box)
dark = [p for p in room if 3 < lum(p) < 40 and max(p) - min(p) < 45]
bg = median(dark)

# Card info panels: lower 38% of the strip, excluding bright text and saturated accent pixels.
sw, sh = strip.size
panel = region(strip, (0, int(sh * 0.62), sw, sh))
panel_bg = [p for p in panel if lum(p) < 60 and max(p) - min(p) < 60]
panel_bg.sort(key=lum)
n = len(panel_bg)
levels = [median(panel_bg[int(n * a): int(n * b)]) for a, b in [(0.15, 0.45), (0.45, 0.75), (0.75, 0.97)]]

# Accent: saturated blue/cyan pixels (b high, r low) in the bottom-right price area of the cards.
price = region(strip, (0, int(sh * 0.8), sw, sh))
accent_px = [p for p in price if p[2] > 150 and p[2] - p[0] > 70 and lum(p) > 90]
# The text is tiny and anti-aliased: the core of each glyph is its brightest quarter.
accent_px.sort(key=lum)
accent = median(accent_px[int(len(accent_px) * 0.75):])

# Text: brightest neutral pixels in the panels; muted: mid-luminance neutral ones.
text_px = [p for p in panel if lum(p) > 200 and max(p) - min(p) < 40]
muted_px = [p for p in panel if 110 < lum(p) < 170 and max(p) - min(p) < 50]

print("background      ", hexc(bg), f"(from {len(dark)} px)")
for i, c in enumerate(levels, 1):
    print(f"surface {i}       ", hexc(c))
print("accent          ", hexc(accent), f"(from {len(accent_px)} px)")
print("text primary    ", hexc(median(text_px)), f"(from {len(text_px)} px)")
print("text muted      ", hexc(median(muted_px)), f"(from {len(muted_px)} px)")
top = Counter(tuple(v // 8 * 8 for v in p) for p in accent_px).most_common(3)
print("accent clusters ", ", ".join(hexc(c) for c, _ in top))
