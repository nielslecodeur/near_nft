"""Generates PLACEHOLDER art for public/nft-art/ (abstract glow portraits).

These are stand-ins until the real artwork is dropped in under the same file
names; nothing in the code changes when the files are replaced.

Run: python -I scripts/make-placeholder-art.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "nft-art"
W, H = 600, 1100

# slug -> (name, two glow colours) loosely echoing each reference card's mood
ART = {
    "angel": ("Angel", (235, 240, 255), (150, 120, 255)),
    "galaxy-soldier": ("Galaxy Soldier", (255, 214, 150), (120, 140, 190)),
    "space-warrior": ("Space Warrior", (120, 200, 255), (40, 90, 255)),
    "galaxy-princess": ("Galaxy Princess", (255, 170, 230), (140, 220, 255)),
    "fate": ("Fate", (160, 120, 255), (90, 200, 255)),
}


def glow(size, centre, radius, colour, strength):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = centre
    for i in range(24, 0, -1):
        r = radius * i / 24
        a = int(strength * (1 - i / 24) ** 1.6)
        d.ellipse((cx - r, cy - r * 1.25, cx + r, cy + r * 1.25), fill=(*colour, a))
    return layer.filter(ImageFilter.GaussianBlur(radius / 6))


def make(slug, name, c1, c2):
    rnd = random.Random(slug)
    img = Image.new("RGBA", (W, H), (5, 8, 16, 255))
    # vertical navy gradient
    grad = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / H
        gd.line([(0, y), (W, y)], fill=(int(8 + 10 * (1 - t)), int(12 + 18 * (1 - t)), int(28 + 40 * (1 - t)), 255))
    img = Image.alpha_composite(img, grad)
    # head-and-shoulders glow, offset per card
    head = (W * (0.42 + rnd.random() * 0.16), H * 0.36)
    img = Image.alpha_composite(img, glow((W, H), head, 230, c2, 150))
    img = Image.alpha_composite(img, glow((W, H), (head[0] + 30, head[1] - 20), 140, c1, 210))
    img = Image.alpha_composite(img, glow((W, H), (W * 0.5, H * 0.8), 320, c2, 90))
    # light filaments
    fl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fl)
    for _ in range(70):
        a0 = rnd.random() * math.tau
        r0 = 120 + rnd.random() * 200
        pts = [
            (head[0] + math.cos(a0 + k * 0.05) * (r0 + k * 3), head[1] + math.sin(a0 + k * 0.05) * (r0 * 1.2 + k * 2))
            for k in range(40)
        ]
        fd.line(pts, fill=(*c1, rnd.randint(20, 70)), width=1)
    img = Image.alpha_composite(img, fl.filter(ImageFilter.GaussianBlur(0.6)))
    # grain
    noise = Image.effect_noise((W, H), 18).convert("L")
    img = Image.blend(img, Image.merge("RGBA", (noise, noise, noise, Image.new("L", (W, H), 255))), 0.05)
    # label so nobody mistakes it for the final art
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    d.text((24, 24), f"PLACEHOLDER · {name}", fill=(255, 255, 255, 150), font=font)
    img.convert("RGB").save(OUT / f"{slug}.webp", "WEBP", quality=82, method=6)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, (name, c1, c2) in ART.items():
        make(slug, name, c1, c2)
        print("wrote", OUT / f"{slug}.webp")
