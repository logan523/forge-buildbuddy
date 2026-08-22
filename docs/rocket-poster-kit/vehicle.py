"""
Flat launch-vehicle silhouettes, keyed to Launch Library 2's `rocket_family`.

Two decisions worth stating, because both were reversals:

**Parametric, not an asset library.** `rocket_family` is null on 5 of the 24
real sample records (Electron, Spectrum, Pallas-1, Themis, one other), so any
lookup table needs a fallback anyway. A spec table plus a renderer gives one
code path for both, and the fallback is a real slender single-core vehicle
rather than a placeholder box. A search for permissively-licensed SVG
silhouettes of real launch vehicles found nothing maintained -- the ecosystem
is game mods, icons and diagrams with unclear provenance.

**Flat, not shaded.** An earlier pass rendered these with a lambertian falloff
and a specular stripe, which does survive quantization -- a shaded cylinder
keeps its roundness through six-ink dithering. But flat fills whose every color
is already an exact ink survive it *perfectly*: the panel shows them pixel-for-
pixel with no dithering at all. Two tones -- a lit side and a shadow side --
is also what Broders and Cardinaux actually did on the alpine posters this
series is modelled on. Realism lives in the silhouette being correct for the
vehicle, not in airbrushed metal.

Not a technical illustration. Stage counts, engine counts and liveries are
impressionistic. What has to be right is the recognizable proportion: Falcon's
slender single core, Soyuz's four tapered conical strap-ons, Long March's
cylindrical boosters.
"""

import math
from PIL import Image, ImageDraw

from palette import INKS

# fairing: nose profile. booster_style "cone" is the Soyuz/R-7 taper; "cyl" is
# a plain cylindrical strap-on (Long March, Ariane, H3, GSLV).
FAMILIES = {
    "Falcon":     dict(core_w=0.30, fairing="ogive",  boosters=0, slender=1.00),
    "Long March": dict(core_w=0.28, fairing="ogive",  boosters=4, booster_style="cyl",
                       booster_h=0.52, slender=0.95),
    "Soyuz":      dict(core_w=0.24, fairing="bullet", boosters=4, booster_style="cone",
                       booster_h=0.62, slender=0.92, booster_scale=1.30),
    "GSLV":       dict(core_w=0.32, fairing="ogive",  boosters=2, booster_style="cyl",
                       booster_h=0.58, slender=0.88),
    "Ariane":     dict(core_w=0.27, fairing="ogive",  boosters=2, booster_style="cyl",
                       booster_h=0.50, slender=1.02),
    "H3":         dict(core_w=0.28, fairing="ogive",  boosters=2, booster_style="cyl",
                       booster_h=0.48, slender=1.00),
    "Angara":     dict(core_w=0.27, fairing="cone",   boosters=0, slender=1.00),
    "Vega":       dict(core_w=0.22, fairing="cone",   boosters=0, slender=1.06),
    "Epsilon":    dict(core_w=0.22, fairing="cone",   boosters=0, slender=1.06),
}

# No family in the record -- real for 5 of 24 samples. Those are all small
# commercial launchers that genuinely are slender single cores, so this is an
# honest default rather than a shrug.
GENERIC = dict(core_w=0.25, fairing="ogive", boosters=0, slender=1.02)

LIT = INKS["white"]
SHADOW = INKS["black"]


def spec_for(record):
    fam = (record.get("rocket_family") or "").strip()
    return dict(FAMILIES.get(fam, GENERIC)), (fam or None)


def _column(d, cx, half, top, bot):
    d.rectangle([cx - half, top, cx + half, bot], fill=LIT)


def _cone(d, cx, b_half, top, bot):
    """Soyuz/R-7 strap-on: narrow at the nose, wide at the base."""
    tw = b_half * 0.34
    d.polygon([(cx - tw, top), (cx + tw, top), (cx + b_half, bot), (cx - b_half, bot)],
              fill=LIT)


def _plume(d, cx, half, top, length, accent):
    """One tapered flat shape -- a stylized snow spray. No gradient: a gradient
    is the one thing that dithers badly, and this is meant to stay lossless."""
    d.polygon([(cx - half, top), (cx + half, top),
               (cx + half * 0.30, top + length), (cx - half * 0.30, top + length)],
              fill=accent)


def draw_flat(record, palette, w=260, h=420):
    """Vertical vehicle on a transparent ground; the poster rotates and places
    it. Built in two passes -- the whole silhouette in the lit ink, then ONE
    shadow band masked to that silhouette. Shading the nose, core and boosters
    separately (an earlier attempt) made the light read as three different
    light sources, which is exactly what a flat poster cannot get away with.
    """
    sp, fam = spec_for(record)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = w * 0.5
    core_half = w * sp["core_w"] / 2 * sp["slender"]
    top, bot = h * 0.16, h * 0.74
    accent = palette.accent
    # A white accent would make the plume vanish into the vehicle; the plume is
    # the one element that must always separate from it.
    plume_ink = accent if accent != LIT else INKS["yellow"]

    plumes = [(cx, core_half * 0.84, h * 0.24)]

    # Outer strap-on pair only. A rear pair reads as clutter at poster scale --
    # two flanking shapes is what makes a Long March look like a Long March.
    n = sp.get("boosters", 0)
    if n:
        b_half = core_half * 0.62 * sp.get("booster_scale", 1.0)
        b_top = bot - (bot - top) * sp["booster_h"]
        for o in (-1, 1):
            bx = cx + o * (core_half + b_half * 0.94)
            if sp.get("booster_style") == "cone":
                _cone(d, bx, b_half, b_top, bot)
            else:
                _column(d, bx, b_half, b_top, bot)
                d.polygon([(bx, b_top - h * 0.05), (bx - b_half, b_top),
                           (bx + b_half, b_top)], fill=LIT)
            plumes.append((bx, b_half * 0.74, h * 0.16))

    _column(d, cx, core_half, top, bot)

    fh = h * (0.15 if sp["fairing"] != "cone" else 0.17)
    if sp["fairing"] == "ogive":
        left = [(cx - core_half * math.cos(t * math.pi / 2) ** 0.55, top - fh * t)
                for t in [i / 20 for i in range(21)]]
        right = [(cx + core_half * math.cos(t * math.pi / 2) ** 0.55, top - fh * t)
                 for t in [i / 20 for i in range(20, -1, -1)]]
        d.polygon(left + right, fill=LIT)
    elif sp["fairing"] == "bullet":
        d.pieslice([cx - core_half, top - fh, cx + core_half, top + fh], 180, 360, fill=LIT)
    else:
        d.polygon([(cx, top - fh), (cx - core_half, top), (cx + core_half, top)], fill=LIT)

    # ONE shadow band, masked to whatever silhouette we just built. Light comes
    # from the left, so the right third of the VEHICLE falls away -- measured
    # off the silhouette's own bounding box, not the canvas. (Positioning it
    # against the canvas made the shadow miss the core entirely on every
    # single-stack family and land only on the right booster.)
    alpha = img.split()[3]
    bbox = alpha.getbbox()
    if bbox:
        x0, _, x1, _ = bbox
        seam = x0 + (x1 - x0) * 0.68
        shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(shade).rectangle([seam, 0, w, h], fill=SHADOW + (255,))
        img.paste(shade, (0, 0), Image.composite(
            shade.split()[3], Image.new("L", (w, h), 0), alpha))

    # livery band, drawn after the shadow so it stays one solid color
    by = top + (bot - top) * 0.30
    d.rectangle([cx - core_half, by, cx + core_half, by + h * 0.035], fill=accent)

    for px, phalf, plen in plumes:
        _plume(d, px, phalf, bot, plen, plume_ink)
    return img, fam


if __name__ == "__main__":
    import json, os
    from palette import palette_for
    HERE = os.path.dirname(os.path.abspath(__file__))
    recs = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
    seen, tiles = set(), []
    for r in recs:
        key = r.get("rocket_family") or "(none)"
        if key in seen:
            continue
        seen.add(key)
        im, fam = draw_flat(r, palette_for(r["destination"]))
        tiles.append((im, fam or "none"))
    sheet = Image.new("RGB", (260 * len(tiles), 420), INKS["blue"])
    for i, (im, _) in enumerate(tiles):
        sheet.paste(im, (260 * i, 0), im)
    sheet.save(os.path.join(HERE, "vehicles.png"))
    print("families:", ", ".join(f for _, f in tiles))
