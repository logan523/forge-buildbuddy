"""
The vehicle drawn on the poster. Three tiers, in order of fidelity.

1. **An ingested asset**, if one exists for this rocket family
   (`ingest.load`). A model drew it once; the file is committed. Highest
   fidelity, and it costs nothing at render time.
2. **A parametric schematic** built from the family's real geometry --
   Launch Library 2 ships `length`, `diameter` and `max_stage` for ~86% of
   configurations, so the proportions are the vehicle's own rather than
   something authored. Falcon 9 is slender because it is 70m x 3.65m.
3. **A generic slender single-core**, for the ~14% with no dimensions and no
   family. Honest rather than a placeholder box: the vehicles that fall here
   are mostly small commercial launchers that really do look like this.

Coverage therefore never has a hole; it only has a lower-fidelity floor.

Everything is drawn from exact ink values, which is what keeps a finished
poster lossless on the panel -- see `spectra6.verify`.

What is NOT derivable from the API, and so lives in FAMILY below: strap-on
count and arrangement, fairing profile, livery bands, and identity features
like Falcon's grid fins or Electron's black carbon-fibre body. That table is
keyed on FAMILY, not configuration, which is why it stays small -- roughly 35
families actually fly, against 532 configurations, and a new variant inherits
its family's row automatically.
"""

import math
from PIL import Image, ImageDraw

import flag
from palette import INKS

W_INK, K_INK, R_INK, Y_INK = (INKS[n] for n in ("white", "black", "red", "yellow"))

# bands are (start, end, ink) as a fraction of core height, measured from the base.
FAMILY = {
    "Falcon": dict(boosters=0, fairing="ogive", body="white", dims=(70.0, 3.65), stages=2,
                   bands=[(0.62, 0.70, "black")], gridfins=True, legs=True,
                   octaweb=True, engines=9),
    "Electron": dict(boosters=0, fairing="cone", body="black", dims=(18.0, 1.2), stages=2,
                     bands=[(0.00, 0.05, "white")], engines=9, outline="white"),
    "Long March": dict(boosters=4, fairing="ogive", body="white", dims=(56.97, 5.0), stages=2,
                       booster_nose="cone", bands=[(0.44, 0.48, "red")],
                       engines=2, booster_engines=2),
    "Soyuz": dict(boosters=4, fairing="bullet", body="white", dims=(46.3, 2.95), stages=3,
                  booster="cone", bands=[(0.30, 0.34, "black")],
                  engines=4, booster_engines=4, hug=True, booster_scale=1.45),
    "Ariane": dict(boosters=2, fairing="ogive", body="white", dims=(63.0, 5.4), stages=2,
                   booster_nose="cone", bands=[(0.50, 0.56, "black")],
                   engines=1, booster_engines=1),
    "H3": dict(boosters=2, fairing="ogive", body="white", dims=(63.0, 5.27), stages=2,
               booster_nose="cone", bands=[(0.48, 0.54, "red")], engines=2, booster_engines=1),
    "GSLV": dict(boosters=2, fairing="ogive", body="white", dims=(43.5, 4.0), stages=3,
                 booster_nose="cone", bands=[(0.40, 0.46, "red")], engines=1, booster_engines=1),
    "Atlas": dict(boosters=0, fairing="ogive", body="white", dims=(58.3, 3.81), stages=2,
                  bands=[(0.55, 0.60, "red")], engines=1),
    "Vega": dict(boosters=0, fairing="cone", body="white", dims=(34.8, 3.0), stages=4,
                 bands=[(0.30, 0.35, "green")], engines=1),
    "Angara": dict(boosters=0, fairing="cone", body="white", dims=(42.7, 2.9), stages=2,
                   bands=[(0.40, 0.45, "blue")], engines=1),
    "Epsilon": dict(boosters=0, fairing="cone", body="white", dims=(26.0, 2.6), stages=3,
                    bands=[(0.35, 0.40, "blue")], engines=1),
    "New Glenn": dict(boosters=0, fairing="ogive", body="white", dims=(98.0, 7.0), stages=2,
                      bands=[(0.55, 0.62, "black")], legs=True, engines=7),
    "Starship": dict(boosters=0, fairing="cone", body="white", dims=(121.0, 9.0), stages=2,
                     bands=[(0.55, 0.58, "black")], engines=6),
}
GENERIC = dict(boosters=0, fairing="ogive", body="white", dims=(45.0, 3.5), stages=2,
               bands=[], engines=1)


def spec_for(record):
    fam = (record.get("rocket_family") or "").strip()
    return dict(FAMILY.get(fam, GENERIC)), (fam or None)


def proportions(record, spec):
    """Height-to-width ratio. Prefers the API's own numbers over the family
    default so a variant with real dimensions gets its own shape.

    The clamp is not cosmetic. LL2's `diameter` is semantically inconsistent --
    Angara A5 reports 8.86m, which is the span across its strap-ons, not the
    core -- and the config list also contains non-launchers (an Apollo LM row
    yields a ratio of 0.7). Clamping keeps one bad record from drawing a
    pancake.
    """
    L = record.get("length") or spec["dims"][0]
    D = record.get("diameter") or spec["dims"][1]
    try:
        ratio = float(L) / float(D)
    except (TypeError, ValueError, ZeroDivisionError):
        ratio = spec["dims"][0] / spec["dims"][1]
    return max(5.0, min(24.0, ratio))


def _edge(d, pts, ink, width):
    d.line(list(pts) + [pts[0]], fill=ink, width=width, joint="curve")


def _nose(cx, half, y, h, kind):
    if kind == "ogive":
        return ([(cx - half * math.cos(t * math.pi / 2) ** 0.5, y - h * t)
                 for t in [i / 16 for i in range(17)]]
                + [(cx + half * math.cos(t * math.pi / 2) ** 0.5, y - h * t)
                   for t in [i / 16 for i in range(16, -1, -1)]])
    if kind == "bullet":
        return ([(cx - half, y)]
                + [(cx - half * math.cos(t * math.pi / 2), y - h * math.sin(t * math.pi / 2))
                   for t in [i / 12 for i in range(13)]]
                + [(cx + half, y)])
    return [(cx - half, y), (cx, y - h), (cx + half, y)]


def draw_parametric(record, palette, H=520, stroke=2, country=None):
    sp, _ = spec_for(record)
    ratio = proportions(record, sp)
    stages = int(record.get("max_stage") or sp.get("stages") or 2)
    body_ink = INKS[sp["body"]]
    line = INKS[sp.get("outline", "black")]

    body_h = H * 0.74
    bw = body_h / ratio
    nose = bw * (2.0 if sp["fairing"] == "ogive" else 2.8)
    nb = sp.get("boosters", 0)
    sw = bw * (0.60 if nb == 4 else 0.72) * sp.get("booster_scale", 1.0)
    hug = 0.80 if sp.get("hug") else 1.02
    Wpx = int(bw + (2 * sw * hug + 10 if nb else 0) + 54)

    img = Image.new("RGBA", (Wpx, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, y0, y1 = Wpx / 2, H - body_h - 10, H - 34

    if nb:
        bt = y1 - body_h * (0.46 if sp.get("booster") == "cone" else 0.52)
        for o in (-1, 1):
            bx = cx + o * (bw / 2 + sw / 2 * hug)
            if sp.get("booster") == "cone":
                tw, nh = sw * 0.26, sw * 1.5      # Soyuz's taper is its signature
                poly = [(bx - tw, bt), (bx, bt - nh), (bx + tw, bt),
                        (bx + sw / 2, y1), (bx - sw / 2, y1)]
            else:
                nh = sw * 1.7
                poly = [(bx - sw / 2, bt), (bx, bt - nh), (bx + sw / 2, bt),
                        (bx + sw / 2, y1), (bx - sw / 2, y1)]
            d.polygon(poly, fill=body_ink)
            _edge(d, poly, line, stroke)
            n = sp.get("booster_engines", 1)
            for i in range(n):
                ex = bx - sw * 0.30 + sw * 0.60 * ((i + 0.5) / n)
                bell = [(ex - sw * .12, y1), (ex + sw * .12, y1),
                        (ex + sw * .19, y1 + 12), (ex - sw * .19, y1 + 12)]
                d.polygon(bell, fill=body_ink); _edge(d, bell, line, 1)

    d.rectangle([cx - bw / 2, y0, cx + bw / 2, y1], fill=body_ink)
    for lo, hi, ink in sp.get("bands", []):
        d.rectangle([cx - bw / 2, y1 - body_h * hi, cx + bw / 2, y1 - body_h * lo],
                    fill=INKS[ink])
    _edge(d, [(cx - bw / 2, y0), (cx + bw / 2, y0), (cx + bw / 2, y1), (cx - bw / 2, y1)],
          line, stroke)

    pts = _nose(cx, bw / 2, y0, nose, sp["fairing"])
    d.polygon(pts, fill=body_ink); _edge(d, pts, line, stroke)

    for i in range(1, max(1, stages)):
        y = y0 + (y1 - y0) * i / stages
        d.line([(cx - bw / 2, y), (cx + bw / 2, y)], fill=line, width=1)

    # National marking, low on the core where real vehicles carry it.
    if country and bw >= 22:
        fw = bw * 0.62
        fh = fw * 0.62
        flag.draw(d, country, cx - fw / 2, y1 - body_h * 0.20, fw, fh)

    if sp.get("gridfins"):
        for o in (-1, 1):
            x = cx + o * bw / 2
            box = [min(x, x + o * bw * 0.40), y0 + nose * 0.10,
                   max(x, x + o * bw * 0.40), y0 + nose * 0.10 + bw * 0.32]
            d.rectangle(box, fill=body_ink); d.rectangle(box, outline=line, width=1)
    if sp.get("legs"):
        for o in (-1, 1):
            d.line([(cx + o * bw * 0.40, y1 - bw * 1.6), (cx + o * (bw / 2 + bw * 0.55), y1)],
                   fill=line, width=stroke + 1)
    base = y1
    if sp.get("octaweb"):
        ow = [(cx - bw / 2, y1), (cx + bw / 2, y1),
              (cx + bw * .60, y1 + 14), (cx - bw * .60, y1 + 14)]
        d.polygon(ow, fill=body_ink); _edge(d, ow, line, stroke)
        base = y1 + 14
    n = sp.get("engines", 1)
    span = bw * (1.10 if sp.get("octaweb") else 0.74)
    for i in range(n):
        ex = cx - span / 2 + span * ((i + 0.5) / n)
        w = span / n * 0.40
        bell = [(ex - w, base), (ex + w, base), (ex + w * 1.5, base + 10), (ex - w * 1.5, base + 10)]
        d.polygon(bell, fill=body_ink); _edge(d, bell, line, 1)
    return img


def draw_vehicle(record, palette, H=520, country=None):
    """Asset first, parametric second. Returns (image, tier) so callers -- and
    tests -- can see which path drew it."""
    import ingest
    fam = (record.get("rocket_family") or "").strip()
    if fam:
        asset = ingest.load(fam)
        if asset is not None:
            s = H / asset.height
            asset = asset.resize((max(1, round(asset.width * s)), H), Image.NEAREST)
            return asset, "asset"
    return draw_parametric(record, palette, H=H, country=country), \
           ("parametric" if fam in FAMILY else "generic")


if __name__ == "__main__":
    import json, os
    from palette import palette_for
    HERE = os.path.dirname(os.path.abspath(__file__))
    demo = [("Falcon", "USA"), ("Electron", "NZL"), ("Long March", "CHN"),
            ("Soyuz", "RUS"), ("Ariane", "FRA"), ("H3", "JPN"),
            ("GSLV", "IND"), ("Starship", "USA")]
    ims = []
    for famname, cc in demo:
        im, tier = draw_vehicle({"rocket_family": famname},
                                palette_for("Low Earth Orbit"), country=cc)
        ims.append((im, famname, tier))
    pad = 26
    sheet = Image.new("RGB", (sum(i.width + pad for i, _, _ in ims) + pad, 560), INKS["blue"])
    x = pad
    for im, _, _ in ims:
        sheet.paste(im, (x, 20), im); x += im.width + pad
    sheet.save(os.path.join(HERE, "vehicles.png"))
    print(" ".join(f"{n}:{t}" for _, n, t in ims))
