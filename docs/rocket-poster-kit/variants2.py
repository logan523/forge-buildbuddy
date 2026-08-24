#!/usr/bin/env python3
"""
Round two: only the two directions that survived -- full-height and centered.

The rocket treatment is settled and untouched. What failed was the type. In
full-height the sub-lines sat at near-identical size, so a designed block read
as a list. In centered the data floated bottom-right with nothing anchoring it
and no scale contrast at all.

Three refinements of each, varying ONE thing: how the data is set.

    python3 variants2.py --index 3
"""

import argparse, json, os
from PIL import Image, ImageDraw

import flag, typeset as T
from palette import INKS, CANVAS, palette_for
from spectra6 import verify
from variants import base, rocket, when, on, readable

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS


def label(img, xy, s, ink, size=9):
    T.tracked(img, xy, s, T.font(T.MEDIUM, size), ink, 1.9)


def value(d, img, xy, s, maxw, ink, sizes=(17, 16, 15, 14, 13, 12, 11)):
    f, tr = T.fit_tracked(d, s, T.BOLD, maxw, list(sizes), [0.3, 0.0])
    T.tracked(img, xy, s, f, ink, tr)
    return f.size


# ---- full-height refinements ----------------------------------------------

def a1_label_pairs(rec, pal):
    """Tiny caps label over a bold value, hairline between rows. Hierarchy by
    scale AND weight, so the block reads as a table rather than a paragraph."""
    img = base(rec, pal, (W - 250, -10, H + 20))
    d = ImageDraw.Draw(img)
    M, COL = 46, 440
    acc = readable(pal.accent, pal.field)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, f = T.fit_headline(d, dest, "", T.XCONDENSED, COL, 62, 28, track=1.5)
    T.tracked(img, (M, 62), lines[0], f, INKS["white"], 1.5)
    y = 62 + f.size + 20
    d.rectangle([M, y, M + COL, y + 3], fill=acc); y += 20
    for lab, val in [("VEHICLE", rec["rocket"]), ("MISSION", rec["mission"]),
                     ("OPERATOR", rec["provider"]), ("LAUNCH", when(rec["t0_utc"])),
                     ("SITE", (rec.get("site") or "").upper())]:
        label(img, (M, y), lab, acc)
        sz = value(d, img, (M, y + 12), val, COL, INKS["white"])
        y += sz + 24
        d.rectangle([M, y - 10, M + COL, y - 9], fill=INKS["blue"] if pal.field != INKS["blue"] else INKS["black"])
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 76, 52, 33)
    return img


def a2_mission_hero(rec, pal):
    """Mission name promoted to co-hero. It is the human-interesting field --
    'Crew-13' means more to a viewer than the orbit it is going to."""
    img = base(rec, pal, (W - 250, -10, H + 20))
    d = ImageDraw.Draw(img)
    M, COL = 46, 450
    acc = readable(pal.accent, pal.field)
    label(img, (M, 56), (rec.get("provider") or "").upper()[:40], acc, 10)
    mis = rec["mission"].upper()
    fm = T.fit(d, mis, T.XCONDENSED, COL, 66, 26, track=1.2)
    y = 76
    for ln in T.wrap(d, mis, fm, COL)[:2]:
        T.tracked(img, (M, y), ln, fm, INKS["white"], 1.2); y += fm.size + 2
    y += 16
    d.rectangle([M, y, M + 190, y + 4], fill=acc); y += 22
    dest = (rec.get("destination") or "UNKNOWN").upper()
    fd, td = T.fit_tracked(d, dest, T.MEDIUM, COL, [26, 24, 22, 20, 18], [1.0, 0.4])
    T.tracked(img, (M, y), dest, fd, acc, td); y += fd.size + 22
    for lab, val in [("VEHICLE", rec["rocket"]), ("LAUNCH", when(rec["t0_utc"])),
                     ("SITE", (rec.get("site") or "").upper())]:
        label(img, (M, y), lab, acc, 8)
        sz = value(d, img, (M, y + 11), val, COL, INKS["white"], (14, 13, 12, 11, 10))
        y += sz + 20
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 74, 50, 32)
    return img


def a3_baseline_anchored(rec, pal):
    """Everything hangs off the bottom edge instead of floating mid-field.
    A block with a baseline reads as placed; a block in the middle reads as
    dropped."""
    img = base(rec, pal, (W - 250, -10, H + 20))
    d = ImageDraw.Draw(img)
    M, COL = 46, 450
    acc = readable(pal.accent, pal.field)
    meta = " · ".join(x for x in [when(rec["t0_utc"]), (rec.get("site") or "").upper()] if x)
    fmeta, tmeta = T.fit_tracked(d, meta, T.MEDIUM, COL, [12, 11, 10, 9], [0.6, 0.2])
    sub = " · ".join(x for x in [rec["rocket"], rec["mission"]] if x)
    fsub, tsub = T.fit_tracked(d, sub, T.MEDIUM, COL, [19, 18, 17, 16, 15, 14], [0.4, 0.0])
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, fd = T.fit_headline(d, dest, "", T.XCONDENSED, COL, 70, 28, track=1.5)

    bottom = H - 54
    y = bottom - fmeta.size
    T.tracked(img, (M, y), meta, fmeta, INKS["white"], tmeta)
    y -= fsub.size + 14
    T.tracked(img, (M, y), sub, fsub, acc, tsub)
    y -= 20
    d.rectangle([M, y, M + COL, y + 3], fill=acc)
    y -= fd.size + 18
    T.tracked(img, (M, y), lines[0], fd, INKS["white"], 1.5)
    label(img, (M, y - 26), (rec.get("provider") or "").upper()[:40], acc, 10)
    if rec.get("country"):
        flag.draw(d, rec["country"], W - 250 - 70, H - 74, 50, 32)
    return img


# ---- centered refinements --------------------------------------------------

def b1_symmetric_band(rec, pal):
    """Centre the rocket, centre the type. Symmetry is the whole idea, so
    commit to it rather than scattering data to two ragged margins."""
    r = rocket(rec, H - 150)
    w = r.width if r is not None else 120
    img = base(rec, pal, ((W - w) / 2, 10, H - 150))
    d = ImageDraw.Draw(img)
    acc = readable(pal.accent, pal.field)

    def ctr(s, f, ink, y, tr=0.0):
        wpx = T.tracked_width(d, s, f, tr)
        T.tracked(img, ((W - wpx) / 2, y), s, f, ink, tr)

    # Measure the stack, THEN size the band to it. Hard-coding the band height
    # ran the meta line off the bottom edge of the canvas -- invisible in the
    # thumbnail, fatal on the panel.
    dest = (rec.get("destination") or "UNKNOWN").upper()
    fd = T.fit(d, dest, T.XCONDENSED, W - 120, 46, 22, track=2)
    sub = " · ".join(x for x in [rec["rocket"], rec["mission"], rec["provider"]] if x)
    fs, ts = T.fit_tracked(d, sub, T.MEDIUM, W - 90, [16, 15, 14, 13, 12], [0.4, 0.0])
    meta = " · ".join(x for x in [when(rec["t0_utc"]), (rec.get("site") or "").upper()] if x)
    fm, tm = T.fit_tracked(d, meta, T.MEDIUM, W - 90, [11, 10, 9], [0.5, 0.1])

    PAD_T, RULE, GAP1, GAP2, PAD_B = 22, 16, 20, 10, 20
    band = PAD_T + fd.size + RULE + GAP1 + fs.size + GAP2 + fm.size + PAD_B
    top = H - band
    d.rectangle([0, top, W, H], fill=INKS["black"])

    y = top + PAD_T
    ctr(dest, fd, INKS["white"], y, 2); y += fd.size + 8
    d.rectangle([(W - 150) / 2, y, (W + 150) / 2, y + 3], fill=acc); y += GAP1
    ctr(sub, fs, acc, y, ts); y += fs.size + GAP2
    ctr(meta, fm, INKS["white"], y, tm)

    if rec.get("country"):
        flag.draw(d, rec["country"], 30, 26, 52, 33)
    return img


def b2_left_only(rec, pal):
    """Rocket centred, ALL type in one left column. Splitting it across two
    margins was the actual failure -- the eye had no single place to land."""
    r = rocket(rec, H - 24)
    w = r.width if r is not None else 120
    img = base(rec, pal, ((W - w) / 2 + 110, 12, H - 24))
    d = ImageDraw.Draw(img)
    M, COL = 44, 280
    acc = readable(pal.accent, pal.field)
    label(img, (M, 60), (rec.get("provider") or "").upper()[:34], acc, 9)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    fd = T.fit(d, dest, T.XCONDENSED, COL, 48, 22, track=1.0)
    y = 80
    for ln in T.wrap(d, dest, fd, COL)[:3]:
        T.tracked(img, (M, y), ln, fd, INKS["white"], 1.0); y += fd.size + 2
    y += 16
    d.rectangle([M, y, M + 120, y + 3], fill=acc); y += 20
    for lab, val in [("VEHICLE", rec["rocket"]), ("MISSION", rec["mission"]),
                     ("LAUNCH", when(rec["t0_utc"])), ("SITE", (rec.get("site") or "").upper())]:
        label(img, (M, y), lab, acc, 8)
        f = T.fit(d, val, T.BOLD, COL, 14, 9)
        for ln in T.wrap(d, val, f, COL)[:2]:
            T.text(img, (M, y + 11), ln, f, INKS["white"]); y += f.size + 1
        y += 22
    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 76, 50, 32)
    return img


def b3_corner_scale(rec, pal):
    """L-shape: destination huge top-left, everything else tiny bottom-left.
    Maximum scale contrast, maximum empty space -- the two things the original
    centred layout had none of."""
    r = rocket(rec, H - 20)
    w = r.width if r is not None else 120
    img = base(rec, pal, ((W - w) / 2 + 130, 10, H - 20))
    d = ImageDraw.Draw(img)
    M = 40
    acc = readable(pal.accent, pal.field)
    dest = (rec.get("destination") or "UNKNOWN").upper()
    fd = T.fit(d, dest, T.XCONDENSED, 300, 58, 24, track=1.0)
    y = 54
    for ln in T.wrap(d, dest, fd, 300)[:3]:
        T.tracked(img, (M, y), ln, fd, INKS["white"], 1.0); y += fd.size + 1
    rows = [(rec["rocket"], 15, acc), (rec["mission"], 13, INKS["white"]),
            (rec["provider"], 11, INKS["white"]), (when(rec["t0_utc"]), 11, INKS["white"]),
            ((rec.get("site") or "").upper(), 10, INKS["white"])]
    total = sum(s + 6 for _, s, _ in rows)
    yy = H - 46 - total
    d.rectangle([M, yy - 16, M + 110, yy - 13], fill=acc)
    for val, size, ink in rows:
        f = T.fit(d, val, T.MEDIUM, 300, size, 8)
        T.text(img, (M, yy), T.wrap(d, val, f, 300)[0], f, ink)
        yy += f.size + 6
    if rec.get("country"):
        flag.draw(d, rec["country"], W - 84, H - 70, 50, 32)
    return img


VARIANTS = [("A1-label-pairs", a1_label_pairs), ("A2-mission-hero", a2_mission_hero),
            ("A3-baseline", a3_baseline_anchored), ("B1-symmetric", b1_symmetric_band),
            ("B2-left-only", b2_left_only), ("B3-corner-scale", b3_corner_scale)]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=3)
    ap.add_argument("--tag", default="")
    a = ap.parse_args()
    rec = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"][a.index]
    pal = palette_for(rec["destination"])
    print(f"{rec['rocket']} · {rec['mission']} -> {rec['destination']}")
    outs = []
    for name, fn in VARIANTS:
        img = fn(rec, pal)
        p = os.path.join(HERE, f"r2-{name}.png"); img.save(p); outs.append(p)
        print(f"  {name:16s} off-ink: {len(verify(img))}")
    sheet = Image.new("RGB", (W * 2 + 36, H * 3 + 48), (245, 245, 243))
    for i, p in enumerate(outs):
        r, c = divmod(i, 2)
        sheet.paste(Image.open(p), (12 + c * (W + 12), 12 + r * (H + 12)))
    sheet.save(os.path.join(HERE, f"round2{a.tag}.png"))
    print(f"sheet -> round2{a.tag}.png")
