#!/usr/bin/env python3
"""
Composite real Launch Library 2 data as type over poster art, for the
Spectra 6 e-ink panel.

The ordering here is the whole point, and it is NOT obvious:

    art  ->  dither to 6 inks  ->  THEN draw type in exact ink colors

Type must be composited AFTER quantization, in pure ink values. Run it the
other way and error diffusion shreds the letterforms -- an 11px label becomes
a field of speckle. Drawn after, every glyph is a solid block of one ink and
stays crisp at the panel's native resolution.

Usage:
    python3 compose.py --index 0                     # stand-in art
    python3 compose.py --index 0 --art render.png    # your Higgsfield art
    python3 compose.py --all                         # every sample record
"""

import argparse, json, math, os, subprocess, sys
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 800, 480

# The six inks, exactly as spectra6.py measures them. Type is drawn in these
# literal values so the composite stays 6-ink-legal without re-quantizing.
INK = {
    "black":  (26, 26, 24),
    "white":  (214, 211, 200),
    "red":    (168, 57, 47),
    "yellow": (212, 174, 42),
    "blue":   (53, 84, 138),
    "green":  (74, 117, 80),
}

FUT = "/System/Library/Fonts/Supplemental/Futura.ttc"
F_MED, F_BOLD, F_COND, F_XCOND = 0, 2, 3, 4


def font(index, size):
    return ImageFont.truetype(FUT, size, index=index)


def _stamp(img, mask_draw_fn, ink):
    """Render glyphs through a HARD-THRESHOLDED mask.

    PIL antialiases truetype text by default, which blends the ink with
    whatever is underneath and smuggles hundreds of off-palette colors onto a
    six-ink panel. The panel cannot show them; the driver would re-quantize
    them, and thin strokes would dissolve. So: draw to an L mask, threshold at
    128, paste solid ink through it. Every glyph pixel is exactly one ink.
    """
    mask = Image.new("L", img.size, 0)
    mask_draw_fn(ImageDraw.Draw(mask))
    img.paste(Image.new("RGB", img.size, ink), (0, 0), mask.point(lambda v: 255 if v > 127 else 0))


def stext(img, xy, text, fnt, ink):
    _stamp(img, lambda md: md.text(xy, text, font=fnt, fill=255), ink)


def tracked(img, xy, text, fnt, ink, track=0):
    """Letter-spaced text. PIL has no tracking, so step the pen manually."""
    measure = ImageDraw.Draw(img)

    def draw_all(md):
        x, y = xy
        for ch in text:
            md.text((x, y), ch, font=fnt, fill=255)
            x += measure.textlength(ch, font=fnt) + track

    _stamp(img, draw_all, ink)


def tracked_width(draw, text, fnt, track=0):
    return sum(draw.textlength(c, font=fnt) for c in text) + track * max(0, len(text) - 1)


def fit_font(draw, text, index, max_w, start, floor=20, track=0):
    """Largest size at which `text` fits `max_w`."""
    size = start
    while size > floor:
        f = font(index, size)
        if tracked_width(draw, text, f, track) <= max_w:
            return f
        size -= 2
    return font(index, floor)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# --- stand-in art ------------------------------------------------------------
# Only used when you have not supplied real art. Deliberately a shaded cylinder
# with a specular highlight: that is the exact shape proven to survive 6-ink
# dithering, so the layout preview also demonstrates the tonal claim.

def standin_art(w, h):
    img = Image.new("RGB", (w, h), (8, 10, 20))
    d = ImageDraw.Draw(img)
    for i, y in enumerate(range(0, h, 1)):          # flat bands, never a gradient
        pass
    d.rectangle([0, int(h * 0.72), w, h], fill=(18, 26, 48))
    for sx, sy, r in [(40, 60, 2), (120, 30, 1), (200, 100, 2), (70, 180, 1),
                      (240, 210, 1), (150, 300, 2), (55, 340, 1), (215, 380, 1)]:
        if sx < w and sy < h:
            d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(190, 190, 180))

    cx = w * 0.52
    body_w, top, bot = w * 0.20, h * 0.14, h * 0.70
    # cylinder: lambertian across the width + a hot specular stripe upper-left
    for i in range(int(body_w)):
        t = i / body_w
        n = math.sin(math.pi * t)
        shade = 0.22 + 0.72 * (n ** 0.7)
        if 0.24 < t < 0.36:
            shade = min(1.0, shade + 0.42)          # specular highlight
        v = int(235 * shade)
        x = cx - body_w / 2 + i
        d.line([(x, top), (x, bot)], fill=(v, v, int(v * 0.94)))
    for ry in (0.30, 0.46, 0.60):                    # stage rings / panel lines
        y = top + (bot - top) * ry
        d.line([(cx - body_w / 2, y), (cx + body_w / 2, y)], fill=(40, 40, 44), width=2)
    d.polygon([(cx, top - h * 0.11), (cx - body_w / 2, top), (cx + body_w / 2, top)],
              fill=(198, 196, 186))
    d.polygon([(cx - body_w / 2, bot), (cx - body_w * 1.05, bot + h * 0.10),
               (cx - body_w / 2, bot - h * 0.10)], fill=(150, 148, 140))
    d.polygon([(cx + body_w / 2, bot), (cx + body_w * 1.05, bot + h * 0.10),
               (cx + body_w / 2, bot - h * 0.10)], fill=(120, 118, 112))
    # plume with shock diamonds
    for i in range(int(h * 0.26)):
        t = i / (h * 0.26)
        half = body_w * 0.42 * (1 - t * 0.55) * (1 + 0.22 * math.sin(t * 13))
        y = bot + i
        c = (255, int(228 - 120 * t), int(90 - 70 * t))
        d.line([(cx - half, y), (cx + half, y)], fill=c)
    return img


# --- the poster --------------------------------------------------------------

def compose(rec, art_path=None, dither="atkinson", out=None):
    art_w = 330
    if art_path:
        art = Image.open(art_path).convert("RGB")
    else:
        art = standin_art(art_w, H)

    # 1. art only -- the type panel is painted solid, after dithering
    base = Image.new("RGB", (W, H), (14, 20, 42))
    if art.size != (art_w, H):
        s = max(art_w / art.width, H / art.height)
        art = art.resize((max(1, int(art.width * s)), max(1, int(art.height * s))), Image.LANCZOS)
        art = art.crop(((art.width - art_w) // 2, (art.height - H) // 2,
                        (art.width - art_w) // 2 + art_w, (art.height - H) // 2 + H))
    base.paste(art, (W - art_w, 0))

    # 2. dither EVERYTHING first
    tmp = os.path.join(HERE, ".compose_tmp.png")
    base.save(tmp)
    stem = tmp[:-4]
    subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), tmp,
                    "--dither", dither, "--out", stem],
                   check=True, capture_output=True)
    img = Image.open(stem + ".panel.png").convert("RGB")
    d = ImageDraw.Draw(img)

    # Solid black type panel. Dithering a large flat field buys nothing (no
    # tone to preserve) and costs a visible speckle behind small type, so this
    # region is painted in one ink instead.
    d.rectangle([0, 0, W - art_w - 1, H], fill=INK["black"])
    d.rectangle([W - art_w - 3, 0, W - art_w - 1, H], fill=INK["red"])

    # 3. type, in exact ink colors, on top
    M, COL = 40, 400
    y = 46

    # Provider eyebrow. Real values run to 50 chars ("China Aerospace Science
    # and Technology Corporation"), so give up tracking before size -- letter-
    # spacing is the first thing worth losing, legibility the last.
    prov = rec["provider"].upper()
    f_eb, eb_track = font(F_MED, 13), 2.2
    for size in (13, 12, 11, 10, 9):
        for tr in (2.2, 1.6, 1.0, 0.6):
            f = font(F_MED, size)
            if tracked_width(d, prov, f, tr) <= COL:
                f_eb, eb_track = f, tr
                break
        else:
            continue
        break
    tracked(img, (M, y), prov, f_eb, INK["yellow"], eb_track)
    y += 30

    # Rocket name. The API's longest real value is 35 chars ("Launch Vehicle
    # Mark-3 (GSLV Mk III)"), which cannot be set on one line at a size worth
    # calling a headline. Ladder: full name -> LL2's own rocket_short -> wrap
    # to two lines. Never silently clip -- a clipped rocket name is worse than
    # a smaller one.
    MIN_HEAD = 44
    lines, f_name = None, None
    for cand in (rec["rocket"].upper(), rec.get("rocket_short", "").upper()):
        if not cand:
            continue
        f = fit_font(d, cand, F_XCOND, COL, 86, MIN_HEAD, track=1)
        if tracked_width(d, cand, f, 1) <= COL:
            lines, f_name = [cand], f
            break
    if lines is None:
        short = (rec.get("rocket_short") or rec["rocket"]).upper()
        for size in range(64, MIN_HEAD - 1, -2):
            f = font(F_XCOND, size)
            w2 = wrap(d, short, f, COL)
            if len(w2) <= 2 and all(tracked_width(d, l, f, 1) <= COL for l in w2):
                lines, f_name = w2, f
                break
        if lines is None:
            f_name = font(F_XCOND, MIN_HEAD)
            lines = wrap(d, short, f_name, COL)[:2]
    for ln in lines:
        tracked(img, (M, y), ln, f_name, INK["white"], 1)
        y += f_name.size + 4
    y += 10

    f_mis = font(F_MED, 21)
    for line in wrap(d, rec["mission"], f_mis, COL)[:2]:
        stext(img, (M, y), line, f_mis, INK["white"])
        y += 27
    y += 16

    d.rectangle([M, y, M + COL, y + 2], fill=INK["red"])
    y += 22

    t0 = datetime.strptime(rec["t0_utc"], "%Y-%m-%dT%H:%M:%SZ")
    rows = [("DESTINATION", rec["destination"]),
            ("PURPOSE",     rec["purpose"]),
            ("LAUNCH",      t0.strftime("%d %b %Y   %H:%M UTC").upper())]
    f_lab, f_val = font(F_MED, 10), font(F_BOLD, 17)
    for lab, val in rows:
        tracked(img, (M, y + 3), lab, f_lab, INK["yellow"], 1.8)
        vf = f_val
        while d.textlength(val, font=vf) > COL - 118 and vf.size > 11:
            vf = font(F_BOLD, vf.size - 1)
        stext(img, (M + 118, y), val, vf, INK["white"])
        y += 30

    f_site = font(F_MED, 12)
    site = rec["site"]
    while d.textlength(site, font=f_site) > COL and f_site.size > 9:
        f_site = font(F_MED, f_site.size - 1)
    stext(img, (M, H - 58), site, f_site, INK["white"])

    status = rec["status_full"].upper()
    f_st = font(F_MED, 10)
    sw = tracked_width(d, status, f_st, 1.8)
    good = rec["status"].lower() in ("go", "success")
    d.rectangle([M, H - 34, M + sw + 20, H - 14],
                fill=INK["green"] if good else INK["red"])
    tracked(img, (M + 10, H - 30), status, f_st, INK["white"], 1.8)

    # 4. prove the composite is still 6-ink legal
    allowed = set(INK.values())
    used = {c for _, c in img.getcolors(W * H)}
    illegal = used - allowed
    out = out or os.path.join(HERE, f"poster-{rec['rocket_short'].replace('/', '-')}.png")
    img.save(out)
    os.remove(tmp); os.remove(stem + ".panel.png")
    return out, illegal


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--art")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dither", default="atkinson")
    ap.add_argument("--out")
    a = ap.parse_args()
    samples = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
    picks = samples if a.all else [samples[a.index]]
    for r in picks:
        p, bad = compose(r, a.art, a.dither, a.out if not a.all else None)
        print(f"{os.path.basename(p):38s} {r['rocket'][:28]:30s} {'OK' if not bad else 'NON-INK:' + str(bad)}")
