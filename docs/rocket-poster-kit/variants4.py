#!/usr/bin/env python3
"""
Where the type band sits: bottom, top, left or right.

The scene plate is authored 800x336 for a bottom band. A vertical band needs a
taller scene, so for left/right the plate is scaled to cover and cropped from
the side that keeps the gantry -- rather than letterboxed, which would show
field where illustration should be.

    python3 variants4.py --index 3
"""

import argparse, json, os

from PIL import Image, ImageDraw

import flag, scene, typeset as T
from palette import INKS, CANVAS, palette_for
from poster import fmt_when, outline_mask, posterize_vehicle, pt, vehicle_layer
from spectra6 import verify

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS
BAND_H, BAND_W = 144, 268


def plate_for(rec, w, h, keep="left"):
    """Scene scaled to COVER w x h. Cropped from the side that keeps the
    gantry, so a vertical band never eats the one built element in the scene."""
    p = scene.load(rec)
    if p is None:
        return None
    s = max(w / p.width, h / p.height)
    p = p.resize((max(1, round(p.width * s)), max(1, round(p.height * s))), Image.LANCZOS)
    x = 0 if keep == "left" else p.width - w
    # LANCZOS interpolates, which puts colours BETWEEN the inks back into the
    # plate -- 3,802 of them on the left variant before this line existed.
    # Re-snap after every resample, never assume a scaled plate is still legal.
    return scene.snap_to_inks(p.crop((x, 0, x + w, min(h, p.height))))


def place_vehicle(img, rec, box, h):
    """Vehicle with its keyline, standing in the scene region."""
    veh, _ = vehicle_layer(rec, h + 40)
    if veh is None:
        return
    sc = (h + 30) / veh.height
    v = veh.resize((max(1, round(veh.width * sc)), h + 30), Image.LANCZOS)
    x0, y0, x1, _ = box
    x = int(x0 + (x1 - x0) * 0.58)
    img.paste(Image.new("RGB", v.size, INKS["black"]), (x, y0 - 8), outline_mask(v))
    img.paste(posterize_vehicle(v), (x, y0 - 8),
              v.split()[3].point(lambda p: 255 if p > 140 else 0))


def band_text(img, d, rec, box, centred):
    """Destination as the headline, mission line beneath, then the metadata."""
    x0, y0, x1, y1 = box
    colw = x1 - x0 - 48
    ink, sub = INKS["black"], INKS["red"]

    def put(s, f, tr, y, col):
        w = T.tracked_width(d, s, f, tr)
        x = x0 + (x1 - x0 - w) / 2 if centred else x0 + 24
        T.tracked(img, (x, y), s, f, col, tr)
        return w

    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, fh = T.fit_wrap(d, dest, T.XCONDENSED, colw, pt(23), pt(10), 2.0,
                           1 if centred else 3)
    y = y0 + (18 if centred else 26)
    for ln in lines:
        put(ln, fh, 2.0, y, ink)
        y += fh.size + 3
    y += 10

    # Provider dropped from the line: three fields at 50 chars apiece pushed
    # the type below legibility. Mission and vehicle carry it.
    bits = [x for x in [rec.get("mission"), rec.get("rocket")] if x]
    line = "  ·  ".join(bits).upper()
    f2, t2 = T.fit_tracked(d, line, T.MEDIUM, colw,
                           [pt(8), pt(7.5), pt(7), pt(6.5)], [1.6, 0.9, 0.3])
    if centred:
        put(line, f2, t2, y, sub)
    else:
        for ln in T.wrap(d, line, f2, colw)[:3]:
            put(ln, f2, t2, y, sub); y += f2.size + 4
        y -= f2.size + 4
    y += f2.size + 10

    # Date only. The site name is 59 characters at worst and forced the whole
    # line down to 7px to fit -- below what a 128 PPI panel can render as a
    # letter. Fewer words at a legible size beats more words as texture.
    meta = fmt_when(rec.get("t0_utc"))
    f3, t3 = T.fit_tracked(d, meta, T.MEDIUM, colw,
                           [pt(6.5), pt(6), pt(5.5)], [1.2, 0.6, 0.3])
    if centred:
        put(meta, f3, t3, y, ink)
    else:
        for ln in T.wrap(d, meta, f3, colw)[:3]:
            put(ln, f3, t3, y, ink); y += f3.size + 3


def build(rec, where):
    pal = palette_for(rec.get("destination"))
    img = Image.new("RGB", (W, H), pal.field)
    d = ImageDraw.Draw(img)

    if where == "bottom":
        sbox, bbox, keep = (0, 0, W, H - BAND_H), (0, H - BAND_H, W, H), "left"
    elif where == "top":
        sbox, bbox, keep = (0, BAND_H, W, H), (0, 0, W, BAND_H), "left"
    elif where == "left":
        sbox, bbox, keep = (BAND_W, 0, W, H), (0, 0, BAND_W, H), "right"
    else:
        sbox, bbox, keep = (0, 0, W - BAND_W, H), (W - BAND_W, 0, W, H), "left"

    sw, sh = sbox[2] - sbox[0], sbox[3] - sbox[1]
    p = plate_for(rec, sw, sh, keep)
    if p is not None:
        img.paste(p, (sbox[0], sbox[1]))
    place_vehicle(img, rec, sbox, sh)

    d.rectangle(list(bbox), fill=INKS["white"])
    # a keyline on the band's inner edge, same reason the vehicle has one
    if where == "bottom":
        d.rectangle([0, bbox[1], W, bbox[1] + 4], fill=INKS["black"])
    elif where == "top":
        d.rectangle([0, bbox[3] - 4, W, bbox[3]], fill=INKS["black"])
    elif where == "left":
        d.rectangle([bbox[2] - 4, 0, bbox[2], H], fill=INKS["black"])
    else:
        d.rectangle([bbox[0], 0, bbox[0] + 4, H], fill=INKS["black"])

    band_text(img, d, rec, bbox, centred=where in ("bottom", "top"))
    if rec.get("country"):
        fx, fy = (30, H - 40) if where == "bottom" else \
                 (30, BAND_H - 40) if where == "top" else \
                 (24, H - 46) if where == "left" else (bbox[0] + 24, H - 46)
        flag.draw(d, rec["country"], fx, fy, 40, 25)
    return img


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=3)
    a = ap.parse_args()
    rec = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"][a.index]
    outs = []
    for where in ("bottom", "top", "left", "right"):
        img = build(rec, where)
        p = os.path.join(HERE, f"r4-{where}.png"); img.save(p); outs.append(p)
        print(f"  band {where:7s} off-ink {len(verify(img))}")
    sheet = Image.new("RGB", (W, (H + 14) * len(outs)), (245, 245, 243))
    for i, p in enumerate(outs):
        sheet.paste(Image.open(p), (0, i * (H + 14)))
    sheet.save(os.path.join(HERE, "round4.png"))
    print("sheet -> round4.png")
