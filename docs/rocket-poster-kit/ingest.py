#!/usr/bin/env python3
"""
Turn a generated rocket render into a committed, panel-legal vehicle asset.

The division of labour: a model draws the vehicle ONCE per family, this script
makes it deterministic forever. Falcon 9 has flown 624 times; Long March and
Soyuz are in the hundreds. Amortized over a family's whole flight history, one
generation per family is nothing -- and the asset is a committed file, so the
poster pipeline stays reproducible with no model at runtime.

    python3 ingest.py raw/falcon.png --family Falcon --seed 12345

Pipeline:
  1. chroma-key the magenta background out (flat key, not a matting model --
     the prompt asks for #FF00FF, which appears in no real launch vehicle)
  2. posterize what's left to TWO inks: a lit side and a shadow side, chosen
     by luminance. Six-ink legality comes free because we only ever write ink
     values.
  3. trim, normalize to a known height, save RGBA
  4. cross-check the result's aspect ratio against the REAL length/diameter
     from Launch Library 2 -- an image model that hallucinated a stubby
     Falcon 9 gets caught here rather than on the wall.

Everything is recorded in vehicles/manifest.json: prompt, seed, source file,
measured ratio, expected ratio. A poster can always be traced back to the
asset that drew it.
"""

import argparse, hashlib, json, os
from PIL import Image

from palette import INKS

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "vehicles")
MANIFEST = os.path.join(ASSETS, "manifest.json")

CHROMA = (255, 0, 255)          # what the prompt asks for
CHROMA_TOL = 90                 # generous: models rarely hit the exact value
TARGET_H = 900                  # authored tall; the poster scales down with NEAREST

# Real proportions, for the sanity check. Filled from LL2 `length`/`diameter`.
KNOWN_RATIO = {
    "Falcon": 70.0 / 3.65, "Electron": 18.0 / 1.2, "Long March": 56.97 / 5.0,
    "Soyuz": 46.3 / 2.95, "Ariane": 63.0 / 5.4, "H3": 63.0 / 5.27,
    "GSLV": 43.5 / 4.0, "Vega": 34.8 / 3.0, "Angara": 42.7 / 2.9,
    "Atlas": 58.3 / 3.81, "New Glenn": 98.0 / 7.0, "Starship": 121.0 / 9.0,
}


def key_out(img, tol=CHROMA_TOL):
    """Flat chroma key. Deliberately not a learned matting model: the point of
    specifying a background colour in the prompt is that removal becomes
    arithmetic, which is reproducible, instead of a second model's opinion."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # magenta = high red, high blue, low green
            if r > 255 - tol and b > 255 - tol and g < tol:
                px[x, y] = (0, 0, 0, 0)
    return img


def posterize_two_tone(img, lit="white", shadow="black", cut=0.52):
    """Every surviving pixel becomes one of exactly two inks, split on
    luminance. This is what keeps the asset lossless on the panel -- there is
    no third value for the quantizer to have an opinion about."""
    img = img.convert("RGBA")
    px = img.load()
    lo, hi = INKS[shadow], INKS[lit]
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            px[x, y] = (hi if lum >= cut else lo) + (255,)
    return img


def normalize(img, target_h=TARGET_H):
    bbox = img.getbbox()
    if not bbox:
        raise ValueError("nothing left after keying -- wrong background colour?")
    img = img.crop(bbox)
    scale = target_h / img.height
    return img.resize((max(1, round(img.width * scale)), target_h), Image.LANCZOS)


def ingest(src, family, seed=None, prompt=None, lit="white", shadow="black", cut=0.52):
    raw = Image.open(src)
    art = normalize(posterize_two_tone(key_out(raw), lit, shadow, cut))
    # LANCZOS above reintroduces intermediate colours at the edges; snap back.
    art = posterize_two_tone(art, lit, shadow, cut)

    os.makedirs(ASSETS, exist_ok=True)
    slug = family.lower().replace(" ", "-")
    out = os.path.join(ASSETS, f"{slug}.png")
    art.save(out)

    measured = art.height / art.width
    expected = KNOWN_RATIO.get(family)
    warn = None
    if expected:
        # A vehicle's silhouette is wider than its core (boosters, fins), so
        # the drawn ratio is always <= length/diameter. Flag only a big miss --
        # that is a hallucinated proportion, not artistic licence.
        if measured < expected * 0.35 or measured > expected * 1.25:
            warn = (f"drawn ratio {measured:.1f} vs real length/diameter "
                    f"{expected:.1f} -- proportions look wrong, consider a reroll")

    entry = {
        "family": family, "file": f"{slug}.png",
        "source": os.path.basename(src),
        "source_sha256": hashlib.sha256(open(src, "rb").read()).hexdigest()[:16],
        "seed": seed, "prompt": prompt,
        "size": list(art.size), "drawn_ratio": round(measured, 2),
        "real_ratio": round(expected, 2) if expected else None,
        "warning": warn,
    }
    man = {}
    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST))
    man[family] = entry
    json.dump(man, open(MANIFEST, "w"), indent=1, sort_keys=True)
    return out, entry


def load(family):
    """The poster's read path. Returns None when a family has no asset yet, so
    the caller falls back to the parametric renderer -- coverage never has a
    hole, it just has a lower-fidelity floor."""
    if not os.path.exists(MANIFEST):
        return None
    man = json.load(open(MANIFEST))
    e = man.get(family)
    if not e:
        return None
    p = os.path.join(ASSETS, e["file"])
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--family", required=True)
    ap.add_argument("--seed")
    ap.add_argument("--prompt")
    ap.add_argument("--lit", default="white", choices=list(INKS))
    ap.add_argument("--shadow", default="black", choices=list(INKS))
    ap.add_argument("--cut", type=float, default=0.52, help="luminance split, 0-1")
    a = ap.parse_args()
    out, e = ingest(a.source, a.family, a.seed, a.prompt, a.lit, a.shadow, a.cut)
    print(f"{e['family']:14s} -> {out}  {e['size'][0]}x{e['size'][1]}  ratio {e['drawn_ratio']}")
    if e["warning"]:
        print(f"  ! {e['warning']}")
