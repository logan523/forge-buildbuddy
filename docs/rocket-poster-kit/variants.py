#!/usr/bin/env python3
"""
Layout shotgun: one launch record, six compositions, rocket at full size.

The earlier layout shrank a detailed render into a corner and flattened it to
two inks. That is the right call when the vehicle is a small graphic element
and the wrong one when it is the subject: it discards every panel line and
highlight the generation produced.

Here the rocket is the hero. It is composited at height, with its tone intact,
and the whole background+vehicle is dithered ONCE before type goes on. Error
diffusion is doing what it is good at -- carrying a shaded metal cylinder's
roundness onto a six-ink panel -- rather than being avoided.

    python3 variants.py --index 3
"""

import argparse, json, os, subprocess, sys, tempfile
from datetime import datetime, timezone
from PIL import Image, ImageDraw

import flag, ingest, typeset as T
from palette import INKS, CANVAS, palette_for
from spectra6 import verify

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS


def on(ink):
    r, g, b = ink
    return INKS["black"] if (0.299*r + 0.587*g + 0.114*b) > 128 else INKS["white"]


def _lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def readable(ink, over):
    """`ink` if it separates from `over`, else the best of white/black.

    Brick red on deep navy is a 20-point luminance gap -- technically two
    different inks, practically unreadable at 15px. The accent has to earn its
    place on each ground rather than being applied because it is 'the accent'."""
    return ink if abs(_lum(ink) - _lum(over)) > 55 else on(over)


def when(iso, short=False):
    try:
        t = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return ""
    return t.strftime("%d %b %Y" if short else "%d %b %Y · %H:%M UTC").upper()


def rocket(rec, h):
    """Tonal render, scaled to `h` px tall. Falls back to the flat asset, then
    to nothing -- callers draw the field regardless, so a missing family
    degrades to a typographic poster rather than an error."""
    fam = (rec.get("rocket_family") or "").strip()
    im = ingest.load_tonal(fam) if fam else None
    if im is None:
        im = ingest.load(fam) if fam else None
    if im is None:
        return None
    s = h / im.height
    return im.resize((max(1, round(im.width * s)), h), Image.LANCZOS)


def dither_in_place(img):
    """Quantize the composed background+vehicle to six inks. Type is drawn
    AFTER this returns -- run the other way and error diffusion shreds it."""
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "c.png")
        img.convert("RGB").save(p)
        subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), p,
                        "--out", os.path.join(td, "c"), "--size", f"{img.width}x{img.height}",
                        "--saturation", "1.6", "--contrast", "1.05"],
                       check=True, capture_output=True)
        return Image.open(os.path.join(td, "c.panel.png")).convert("RGB")


def base(rec, pal, place):
    """Field + rocket, dithered. `place` returns (x, y, height) for the vehicle."""
    img = Image.new("RGB", (W, H), pal.field)
    x, y, rh = place
    r = rocket(rec, rh)
    if r is not None:
        img.paste(r.convert("RGB"), (int(x), int(y)), r)
    return dither_in_place(img)


# ---- the six ---------------------------------------------------------------

def v1_full_height(rec, pal):
    """Rocket at full frame height, right third. Data stacked left, no band."""
    img = base(rec, pal, (W - 250, -10, H + 20))
    d = ImageDraw.Draw(img)
    M, COL = 46, 470
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, f = T.fit_headline(d, dest, "", T.XCONDENSED, COL, 66, 30, track=1.5)
    T.tracked(img, (M, 92), lines[0], f, INKS["white"], 1.5)
    y = 92 + f.size + 16
    d.rectangle([M, y, M + 150, y + 3], fill=pal.accent); y += 20
    for label, val, ink in [("", rec["rocket"], readable(pal.accent, pal.field)),
                            ("", rec["mission"], INKS["white"]),
                            ("", rec["provider"], INKS["white"])]:
        ff, tr = T.fit_tracked(d, val, T.MEDIUM, COL, [21, 19, 17, 15, 13], [0.5, 0.0])
        T.tracked(img, (M, y), val, ff, ink, tr); y += ff.size + 7
    y += 14
    for val in [when(rec["t0_utc"]), (rec.get("purpose") or "").upper(),
                (rec.get("site") or "").upper()]:
        ff, tr = T.fit_tracked(d, val, T.MEDIUM, COL, [12, 11, 10, 9], [0.6, 0.2])
        T.tracked(img, (M, y), val, ff, INKS["white"], tr); y += ff.size + 6
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 84, 54, 34)
    return img


def v2_centered(rec, pal):
    """Rocket dead centre, full height. Data split to the two margins."""
    r = rocket(rec, H - 40)
    w = r.width if r is not None else 120
    img = base(rec, pal, ((W - w) / 2, 20, H - 40))
    d = ImageDraw.Draw(img)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, f = T.fit_headline(d, dest, "", T.XCONDENSED, 300, 46, 24, track=1.2)
    T.tracked(img, (40, 60), lines[0], f, INKS["white"], 1.2)
    d.rectangle([40, 60 + f.size + 12, 40 + 120, 60 + f.size + 15], fill=pal.accent)
    ff, tr = T.fit_tracked(d, rec["rocket"], T.MEDIUM, 300, [20, 18, 16, 14], [0.4, 0.0])
    T.tracked(img, (40, 60 + f.size + 30), rec["rocket"], ff, readable(pal.accent, pal.field), tr)
    right = []
    for v in [rec["mission"], rec["provider"], when(rec["t0_utc"]),
              (rec.get("site") or "").upper()]:
        gg, gt = T.fit_tracked(d, v, T.MEDIUM, 290, [14, 13, 12, 11, 10], [0.5, 0.1])
        right.append((v, gg, gt))
    y = H - 40 - sum(g.size + 8 for _, g, _ in right)
    for v, gg, gt in right:
        wpx = T.tracked_width(d, v, gg, gt)
        T.tracked(img, (W - 40 - wpx, y), v, gg, INKS["white"], gt); y += gg.size + 8
    if rec.get("country"):
        flag.draw(d, rec["country"], W - 40 - 50, 58, 50, 32)
    return img


def v3_half_bleed(rec, pal):
    """Rocket full-bleed on the left half, everything else on a flat right."""
    img = base(rec, pal, (30, -20, H + 40))
    d = ImageDraw.Draw(img)
    d.rectangle([W // 2 - 10, 0, W, H], fill=INKS["black"])
    M = W // 2 + 30
    COL = W - M - 40
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, f = T.fit_headline(d, dest, "", T.XCONDENSED, COL, 54, 24, track=1.2)
    y = 78
    for ln in lines[:2]:
        T.tracked(img, (M, y), ln, f, INKS["white"], 1.2); y += f.size + 4
    y += 18
    d.rectangle([M, y, M + COL, y + 3], fill=pal.accent); y += 22
    for lab, val in [("VEHICLE", rec["rocket"]), ("MISSION", rec["mission"]),
                     ("OPERATOR", rec["provider"]), ("LAUNCH", when(rec["t0_utc"])),
                     ("SITE", (rec.get("site") or "").upper())]:
        T.tracked(img, (M, y), lab, T.font(T.MEDIUM, 9), pal.accent, 1.8)
        ff, tr = T.fit_tracked(d, val, T.MEDIUM, COL, [15, 14, 13, 12, 11, 10], [0.3, 0.0])
        T.tracked(img, (M, y + 13), val, ff, INKS["white"], tr)
        y += ff.size + 24
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 70, 52, 33)
    return img


def v4_side_rail(rec, pal):
    """Rocket right of centre; data as a narrow vertical rail on the far left."""
    img = base(rec, pal, (W - 300, -10, H + 20))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 232, H], fill=INKS["black"])
    d.rectangle([232, 0, 235, H], fill=pal.accent)
    M, COL = 26, 186
    dest = (rec.get("destination") or "UNKNOWN").upper()
    f = T.fit(d, dest, T.XCONDENSED, COL, 34, 15, track=0.8)
    y = 40
    for ln in T.wrap(d, dest, f, COL)[:3]:
        T.tracked(img, (M, y), ln, f, INKS["white"], 0.8); y += f.size + 2
    y += 20
    for val, ink in [(rec["rocket"], pal.accent), (rec["mission"], INKS["white"]),
                     (rec["provider"], INKS["white"])]:
        ff = T.fit(d, val, T.MEDIUM, COL, 14, 9)
        for ln in T.wrap(d, val, ff, COL)[:2]:
            T.text(img, (M, y), ln, ff, ink); y += ff.size + 3
        y += 9
    y += 8
    for val in [when(rec["t0_utc"], short=True), (rec.get("purpose") or "").upper()]:
        ff = T.fit(d, val, T.MEDIUM, COL, 11, 8)
        T.text(img, (M, y), val, ff, INKS["white"]); y += ff.size + 6
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 70, 48, 30)
    return img


def v5_overlap(rec, pal):
    """Huge destination type running UNDER the rocket -- they share the frame."""
    img = base(rec, pal, (W - 300, -14, H + 28))
    d = ImageDraw.Draw(img)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    f = T.fit(d, dest, T.XCONDENSED, W - 60, 108, 40, track=2)
    lines = T.wrap(d, dest, f, W - 60)[:2]
    y = H - 200 - (len(lines) - 1) * (f.size + 4)
    for ln in lines:
        T.tracked(img, (34, y), ln, f, INKS["white"], 2); y += f.size + 4
    d.rectangle([34, y + 12, 34 + 320, y + 16], fill=readable(pal.accent, pal.field))
    y += 34
    line = " · ".join(x for x in [rec["rocket"], rec["mission"], rec["provider"]] if x)
    ff, tr = T.fit_tracked(d, line, T.MEDIUM, 500, [17, 16, 15, 14, 13, 12], [0.4, 0.0])
    T.tracked(img, (34, y), line, ff, readable(pal.accent, pal.field), tr); y += ff.size + 8
    meta = " · ".join(x for x in [when(rec["t0_utc"]), (rec.get("site") or "").upper()] if x)
    gg, gt = T.fit_tracked(d, meta, T.MEDIUM, 520, [12, 11, 10, 9], [0.5, 0.1])
    T.tracked(img, (34, y), meta, gg, INKS["white"], gt)
    if rec.get("country"):
        flag.draw(d, rec["country"], 34, 40, 56, 35)
    return img


def v6_ticket(rec, pal):
    """Boarding-pass logic: a hairline grid of labelled cells, rocket at right."""
    img = base(rec, pal, (W - 270, 0, H))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 520, H], fill=INKS["black"])
    M = 34
    T.tracked(img, (M, 34), (rec.get("provider") or "").upper()[:38],
              T.font(T.MEDIUM, 11), pal.accent, 2.0)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    f = T.fit(d, dest, T.XCONDENSED, 460, 62, 26, track=1.2)
    T.tracked(img, (M, 58), dest, f, INKS["white"], 1.2)
    y = 58 + f.size + 18
    d.rectangle([M, y, M + 460, y + 2], fill=pal.accent)
    y += 16
    cells = [("VEHICLE", rec["rocket"]), ("MISSION", rec["mission"]),
             ("PURPOSE", rec.get("purpose") or ""), ("LAUNCH", when(rec["t0_utc"])),
             ("SITE", (rec.get("site") or "").upper()),
             ("STATUS", (rec.get("status_full") or "").upper())]
    for i, (lab, val) in enumerate(cells):
        cx = M + (i % 2) * 236
        cy = y + (i // 2) * 62
        T.tracked(img, (cx, cy), lab, T.font(T.MEDIUM, 8), pal.accent, 1.6)
        ff = T.fit(d, val, T.BOLD, 216, 15, 9)
        for j, ln in enumerate(T.wrap(d, val, ff, 216)[:2]):
            T.text(img, (cx, cy + 13 + j * (ff.size + 2)), ln, ff, INKS["white"])
        d.rectangle([cx, cy + 52, cx + 216, cy + 53], fill=INKS["blue"])
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 64, 50, 32)
    return img


VARIANTS = [("full-height", v1_full_height), ("centered", v2_centered),
            ("half-bleed", v3_half_bleed), ("side-rail", v4_side_rail),
            ("overlap", v5_overlap), ("ticket", v6_ticket)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=3)
    a = ap.parse_args()
    rec = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"][a.index]
    pal = palette_for(rec["destination"])
    print(f"{rec['rocket']} · {rec['mission']} -> {rec['destination']}  [{pal}]")
    outs = []
    for name, fn in VARIANTS:
        img = fn(rec, pal)
        p = os.path.join(HERE, f"variant-{name}.png")
        img.save(p); outs.append(p)
        print(f"  {name:12s} off-ink: {len(verify(img))}")
    sheet = Image.new("RGB", (W * 2 + 36, H * 3 + 48), (245, 245, 243))
    for i, p in enumerate(outs):
        r, c = divmod(i, 2)
        sheet.paste(Image.open(p), (12 + c * (W + 12), 12 + r * (H + 12)))
    sheet.save(os.path.join(HERE, "variants-sheet.png"))
    print("sheet -> variants-sheet.png")
