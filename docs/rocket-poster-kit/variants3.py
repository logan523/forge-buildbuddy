#!/usr/bin/env python3
"""
Round three. Type scaled for the real object, rocket off the right edge, and
one stylistic device per variant.

The panel is 6.26 x 3.76 INCHES -- a 6x4 print, not a poster. At that size the
66px headline was 37pt, which is billboard type on a postcard. Everything here
is set from the physical size: ~24pt headline, ~11pt values, ~6pt labels.

    python3 variants3.py --index 3
"""

import argparse, json, math, os
from PIL import Image, ImageDraw

import flag, ingest, typeset as T
from palette import INKS, CANVAS, palette_for
from poster import posterize_vehicle, fmt_when, readable, vehicle_layer
from spectra6 import verify

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS
PPI = 128                       # measured: 800px / 6.26in


def pt(points):
    """Physical points -> pixels. Sizing from the real object rather than from
    what looks right in a browser tab is the whole correction here."""
    return max(6, round(points * PPI / 72))


def ground(rec, pal, right_margin=104):
    """Field + vehicle, with a real margin on the right.

    Anchoring by fraction-of-width left a ragged gap that changed with every
    vehicle's own width -- a slender Falcon floated in a sea of empty field
    while a wide Long March nearly touched the edge. Anchoring by MARGIN gives
    every poster the same optical breathing room regardless of silhouette.
    """
    img = Image.new("RGB", (W, H), pal.field)
    veh, vy = vehicle_layer(rec, H + 20)
    if veh is None:
        return img, None
    x = W - right_margin - veh.width
    img.paste(posterize_vehicle(veh), (x, vy),
              veh.split()[3].point(lambda v: 255 if v > 140 else 0))
    return img, (x, veh.width)


def stack(img, d, rec, pal, top=None, size=1.0):
    """The shared type block, in physical points."""
    acc = readable(pal.accent, pal.field)
    M, COL = 44, 380
    y = top if top is not None else 62
    T.tracked(img, (M, y), (rec.get("provider") or "").upper()[:42],
              T.font(T.MEDIUM, pt(5.5)), acc, 1.8)
    y += pt(5.5) + 12

    mission = (rec.get("mission") or "").strip()
    dest = (rec.get("destination") or "UNKNOWN").upper()
    use_mission = bool(mission) and mission.lower() not in (
        "unknown", "unknown payload", "classified", "n/a", "tbd")
    hero = (mission if use_mission else dest).upper()
    lines, fh = T.fit_wrap(d, hero, T.XCONDENSED, COL, pt(24 * size), pt(11), 1.0, 2)
    for ln in lines:
        T.tracked(img, (M, y), ln, fh, INKS["white"], 1.0)
        y += fh.size + 2
    y += 12
    d.rectangle([M, y, M + 130, y + 2], fill=acc)
    y += 16
    if use_mission:
        fd, td = T.fit_tracked(d, dest, T.MEDIUM, COL,
                               [pt(11), pt(10), pt(9), pt(8)], [0.8, 0.3])
        T.tracked(img, (M, y), dest, fd, acc, td)
        y += fd.size + 18
    for lab, val in [("VEHICLE", rec.get("rocket") or ""),
                     ("LAUNCH", fmt_when(rec.get("t0_utc"))),
                     ("SITE", (rec.get("site") or "").upper())]:
        if not val:
            continue
        T.tracked(img, (M, y), lab, T.font(T.MEDIUM, pt(4.5)), acc, 1.7)
        f, tr = T.fit_tracked(d, val, T.BOLD, COL,
                              [pt(8), pt(7.5), pt(7), pt(6.5), pt(6)], [0.2, 0.0])
        T.tracked(img, (M, y + pt(4.5) + 3), val, f, INKS["white"], tr)
        y += f.size + pt(4.5) + 13
    return y, acc


# ---- six devices -----------------------------------------------------------

def v1_plate(rec, pal):
    """Inset hairline frame -- the plate mark of a printed sheet."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    _, acc = stack(img, d, rec, pal, top=70)
    d.rectangle([18, 18, W - 19, H - 19], outline=acc, width=1)
    if rec.get("country"):
        flag.draw(d, rec["country"], W - 92, H - 66, 46, 29)
    return img


def v2_registration(rec, pal):
    """Corner tick marks -- press registration, a printer's tell."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    _, acc = stack(img, d, rec, pal)
    L = 22
    for cx, cy, sx, sy in [(20, 20, 1, 1), (W-21, 20, -1, 1), (20, H-21, 1, -1), (W-21, H-21, -1, -1)]:
        d.line([(cx, cy), (cx + sx*L, cy)], fill=acc, width=1)
        d.line([(cx, cy), (cx, cy + sy*L)], fill=acc, width=1)
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, H - 74, 46, 29)
    return img


def v3_starfield(rec, pal):
    """Sparse flat stars. Deterministic from the launch id, so the same launch
    always gets the same sky -- and single pixels, so nothing dithers."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    seed = sum(ord(c) for c in (rec.get("mission") or "x")) or 7
    ink = readable(INKS["white"], pal.field)
    for i in range(150):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        x = 20 + (seed >> 5) % (W - 40)
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        y = 16 + (seed >> 5) % (H - 32)
        if x < 440 and y < 300:          # keep the type field clear
            continue
        d.point((x, y), fill=ink)
        if i % 5 == 0:                    # a few brighter ones for depth
            d.point((x+1, y), fill=ink); d.point((x, y+1), fill=ink)
            d.point((x+1, y+1), fill=ink)
    stack(img, d, rec, pal)
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, H - 74, 46, 29)
    return img


def v4_trajectory(rec, pal):
    """A thin ascent arc sweeping up behind the vehicle."""
    img, geo = ground(rec, pal, right_margin=124)
    d = ImageDraw.Draw(img)
    _, acc = stack(img, d, rec, pal)
    pts = [(40 + t*(W-80), H - 30 - (H-120) * (t ** 1.9)) for t in [i/60 for i in range(61)]]
    for i in range(0, len(pts)-1, 2):     # dashed
        d.line([pts[i], pts[i+1]], fill=acc, width=1)
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, H - 74, 46, 29)
    return img


def v5_datarules(rec, pal):
    """Hairlines under each data row -- a technical sheet."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    y, acc = stack(img, d, rec, pal)
    yy = 232
    for _ in range(3):
        d.rectangle([44, yy, 44 + 380, yy + 1], fill=acc)
        yy += pt(8) + pt(4.5) + 13
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, H - 74, 46, 29)
    return img


def v6_horizon(rec, pal):
    """A flat ground band the vehicle rises out of."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    band = H - 54
    d.rectangle([0, band, W, H], fill=INKS["black"])
    d.rectangle([0, band - 3, W, band], fill=readable(pal.accent, pal.field))
    _, acc = stack(img, d, rec, pal, top=54)
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, band + 12, 44, 28)
    prev = "LAST · FALCON 9 · Starlink Group 10-39"
    f, tr = T.fit_tracked(d, prev, T.MEDIUM, 480, [pt(5), pt(4.5)], [1.2, 0.5])
    T.tracked(img, (100, band + 20), prev, f, INKS["white"], tr)
    return img


def v7_combined(rec, pal):
    """The three devices that actually earned their place, together:
    registration ticks (printer's tell), a dashed ascent arc (motion), and the
    horizon band carrying the previous launch (context, kept quiet)."""
    img, _ = ground(rec, pal)
    d = ImageDraw.Draw(img)
    band = H - 50
    acc = readable(pal.accent, pal.field)
    pts = [(30 + t*(W-60), band - 14 - (band-150) * (t ** 2.0)) for t in [i/60 for i in range(61)]]
    for i in range(0, len(pts)-1, 2):
        d.line([pts[i], pts[i+1]], fill=acc, width=1)
    d.rectangle([0, band, W, H], fill=INKS["black"])
    d.rectangle([0, band - 2, W, band], fill=acc)
    stack(img, d, rec, pal, top=52)
    L = 18
    for cx, cy, sx, sy in [(18, 18, 1, 1), (W-19, 18, -1, 1)]:
        d.line([(cx, cy), (cx + sx*L, cy)], fill=acc, width=1)
        d.line([(cx, cy), (cx, cy + sy*L)], fill=acc, width=1)
    if rec.get("country"):
        flag.draw(d, rec["country"], 44, band + 11, 42, 27)
    prev = "LAST · FALCON 9 · Starlink Group 10-39 · 21 AUG 2026"
    f, tr = T.fit_tracked(d, prev, T.MEDIUM, 520, [pt(5), pt(4.5), pt(4)], [1.2, 0.6, 0.2])
    T.tracked(img, (98, band + 17), prev, f, INKS["white"], tr)
    return img


VARIANTS = [("plate-frame", v1_plate), ("registration", v2_registration),
            ("starfield", v3_starfield), ("trajectory", v4_trajectory),
            ("data-rules", v5_datarules), ("horizon", v6_horizon),
            ("combined", v7_combined)]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=3)
    a = ap.parse_args()
    rec = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"][a.index]
    pal = palette_for(rec["destination"])
    print(f"{rec['rocket']} · {rec['mission']}   headline now {pt(24)}px = 24pt on a 6.26in panel")
    outs = []
    for name, fn in VARIANTS:
        img = fn(rec, pal)
        p = os.path.join(HERE, f"r3-{name}.png"); img.save(p); outs.append(p)
        print(f"  {name:14s} off-ink {len(verify(img))}")
    sheet = Image.new("RGB", (W + 24, (H + 12) * len(outs) + 12), (245, 245, 243))
    for i, p in enumerate(outs):
        sheet.paste(Image.open(p), (12, 12 + i * (H + 12)))
    sheet.save(os.path.join(HERE, "round3.png"))
    print("sheet -> round3.png")
