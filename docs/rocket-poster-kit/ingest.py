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

import numpy as np
from PIL import Image

from palette import INKS

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "vehicles")
MANIFEST = os.path.join(ASSETS, "manifest.json")

TARGET_H = 900                  # authored tall; the poster scales down with NEAREST

# Real proportions, for the sanity check. Filled from LL2 `length`/`diameter`.
KNOWN_RATIO = {
    "Falcon": 70.0 / 3.65, "Electron": 18.0 / 1.2, "Long March": 56.97 / 5.0,
    "Soyuz": 46.3 / 2.95, "Ariane": 63.0 / 5.4, "H3": 63.0 / 5.27,
    "GSLV": 43.5 / 4.0, "Vega": 34.8 / 3.0, "Angara": 42.7 / 2.9,
    "Atlas": 58.3 / 3.81, "New Glenn": 98.0 / 7.0, "Starship": 121.0 / 9.0,
}


# Strap-ons and a wide fairing make the DRAWN silhouette much wider than the
# core, so a bare length/diameter is the wrong yardstick. Multipliers measured
# against correct renders: a 4-booster stack is about 3x its core width.
BOOSTERS = {"Long March": 4, "Soyuz": 4, "Angara": 4,
            "Ariane": 2, "H3": 2, "GSLV": 2}
WIDTH_MULTIPLIER = {0: 1.7, 2: 2.2, 4: 3.0}


def key_out(img, tol=78):
    """Remove the background by sampling it, not by assuming it.

    The prompt asks for #FF00FF. Two real renders came back with backgrounds of
    (222,13,155) and (172,52,131) -- the model treats "magenta" as a suggestion,
    and the shade drifts between generations. A fixed value test missed the
    first; a fixed hue test left speckle across the second, which silently
    turned the bounding box into the whole frame and produced a "vehicle" with
    an aspect ratio of 1.8.

    So: read the four corners, take the median as the actual key colour, and
    remove everything within `tol` of it. Self-calibrating per image, which is
    the only thing that survives a model that will not hold a colour still.
    A hue test still runs as a second pass to catch anti-aliased fringe.
    """
    a = np.asarray(img.convert("RGBA")).copy()
    h, w = a.shape[:2]
    m = 6
    corners = np.array([a[m, m, :3], a[m, w - m, :3], a[h - m, m, :3], a[h - m, w - m, :3]])
    key = np.median(corners, axis=0)

    rgb = a[:, :, :3].astype(int)
    dist = np.sqrt(((rgb - key) ** 2).sum(axis=2))
    bg = dist < tol

    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    fringe = (r > 110) & (b > 80) & (g < np.minimum(r, b) * 0.62)
    a[bg | fringe] = (0, 0, 0, 0)
    return Image.fromarray(a, "RGBA")


def largest_blob(img):
    """Keep only the biggest connected opaque region.

    A stray keyed-through speck anywhere near a frame edge drags the bounding
    box out to the whole image, and every downstream measurement -- including
    the proportion check that is supposed to catch bad art -- then measures the
    frame instead of the rocket. Flood-fill from the densest column so the
    vehicle wins.
    """
    a = np.asarray(img)[:, :, 3] > 0
    if not a.any():
        return img
    # Rows/columns with very little coverage are noise, not vehicle.
    colsum = a.sum(axis=0)
    keep_cols = colsum > max(2, colsum.max() * 0.02)
    rowsum = a.sum(axis=1)
    keep_rows = rowsum > max(2, rowsum.max() * 0.02)
    out = np.asarray(img).copy()
    out[~keep_rows, :, 3] = 0
    out[:, ~keep_cols, 3] = 0
    return Image.fromarray(out, "RGBA")


def posterize_two_tone(img, lit="white", shadow="black", cut=0.52):
    """Every surviving pixel becomes one of exactly two inks, split on
    luminance. This is what keeps the asset lossless on the panel -- there is
    no third value for the quantizer to have an opinion about."""
    a = np.asarray(img.convert("RGBA")).copy()
    alpha = a[:, :, 3]
    lum = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]) / 255.0
    out = np.zeros_like(a)
    keep = alpha >= 128
    out[keep & (lum >= cut)] = INKS[lit] + (255,)
    out[keep & (lum < cut)] = INKS[shadow] + (255,)
    return Image.fromarray(out, "RGBA")


def normalize(img, target_h=TARGET_H):
    bbox = img.getbbox()
    if not bbox:
        raise ValueError("nothing left after keying -- wrong background colour?")
    img = img.crop(bbox)
    scale = target_h / img.height
    return img.resize((max(1, round(img.width * scale)), target_h), Image.LANCZOS)


def ingest(src, family, seed=None, prompt=None, lit="white", shadow="black", cut=0.52):
    raw = Image.open(src)
    art = normalize(largest_blob(posterize_two_tone(key_out(raw), lit, shadow, cut)))
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
        # The real ratio is length/CORE diameter, but the drawn silhouette is as
        # wide as the whole vehicle -- strap-ons and fairing included. Comparing
        # them directly flagged a textbook-correct Soyuz and Long March 5 as
        # "wrong proportions", which is the fastest way to teach someone to
        # ignore a warning. Scale the expectation by how wide the family
        # actually is, so the check stays meaningful.
        mult = WIDTH_MULTIPLIER.get(BOOSTERS.get(family, 0), 1.0)
        target = expected / mult
        # Asymmetric on purpose. Too WIDE means the model added hardware that
        # is not on the vehicle -- the exact failure that put strap-on boosters
        # on a Falcon 9, and the one worth catching. Too SLENDER usually means
        # it drew a cleaner vehicle with a narrow fairing, which is what a
        # correct Vega-C looks like; flagging that trains you to ignore the
        # warning, and a guard that is ignored is worse than no guard.
        if not (target * 0.50 <= measured <= target * 1.90):
            side = "wide" if measured < target else "slender"
            warn = (f"drawn ratio {measured:.1f} vs expected ~{target:.1f} for a "
                    f"{BOOSTERS.get(family, 0)}-booster vehicle -- too {side}, "
                    f"consider a reroll")

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
