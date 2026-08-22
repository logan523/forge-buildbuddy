#!/usr/bin/env python3
"""
The poster. One Launch Library 2 record in, one 800x480 six-ink panel out.

Layout chosen from a two-round shotgun: the vehicle at full frame height on the
right, and the MISSION as the headline rather than the destination.

That second choice is the one worth defending. Leading with the orbit reads
"LOW EARTH ORBIT" four days out of five -- 81 of the next 100 launches go to
LEO, Polar or Sun-Synchronous. The mission name is the field that actually
varies and the one a person cares about: "Crew-13", "Chang'e 7", "Martian Moon
eXplorer". The destination still gets its own line directly beneath, in the
accent ink, so nothing is lost.

The rocket is a generated render, ingested once per family and composited with
its tone intact; the background and vehicle are dithered together ONCE, then
type is drawn on top in exact ink values. Run that order backwards and error
diffusion shreds the letterforms.
"""

import argparse, json, os, sys
from datetime import datetime, timezone
from PIL import Image, ImageDraw

import numpy as np

import flag
import ingest
import typeset as T
from palette import INKS, CANVAS, palette_for
from vehicle import draw_vehicle

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS
M = 44                      # margin
HORIZON = 296               # hard edge between sky and the type band
FOOTER_H = 36               # previous-launch strip
BAND_TOP = HORIZON + 6


def _lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def readable(ink, over):
    """`ink` if it separates from `over`, else white/black. Brick red on deep
    navy is a 20-point luminance gap -- two distinct inks, unreadable at 14px."""
    return ink if abs(_lum(ink) - _lum(over)) > 55 else on(over)


# A vehicle taller than this many times its own width is a slender single core
# -- Falcon, Electron, Vega. Shown whole it collapses to a ~40px sliver and all
# the generated detail is wasted. Shown cropped it reads properly, and the part
# that runs off frame is the plain lower body, not an identifying feature.
#
# The strap-on families are the opposite: their flared base IS the
# identification (Soyuz's four tapered boosters, Long March's cluster), and
# they are already 2-3x wider so they do not need the help. They stay whole.
SLENDER_RATIO = 8.0


def vehicle_layer(rec, h):
    """Returns (layer, y_offset). Tonal render if the family has one, else the
    flat parametric fallback. Coverage never has a hole, only a lower floor."""
    fam = (rec.get("rocket_family") or "").strip()
    im = ingest.load_tonal(fam) if fam else None
    if im is None:
        im, _ = draw_vehicle(rec, palette_for(rec.get("destination")),
                             H=h, country=rec.get("country"))
        if im is None:
            return None, 0
        return im, -10

    slender = im.height / im.width > SLENDER_RATIO
    target = int(h * 2.3) if slender else h
    sc = target / im.height
    out = im.resize((max(1, round(im.width * sc)), target), Image.LANCZOS)
    # Anchor the nose near the top either way; a slender vehicle's base simply
    # continues past the bottom edge.
    return out, -12


def posterize_vehicle(layer, cut=118, contrast=1.35):
    """Hard-threshold the vehicle into two flat inks. NO dithering.

    This is the fix for "why is it pixellated". The panel has six inks and none
    of them is grey, so any continuous tone must be faked -- and error
    diffusion fakes it with a checkerboard, which at 130 PPI is exactly the
    speckle that reads as pixellation. Offered the full palette it was worse
    still: green and red are arithmetically the nearest match to mid-grey, so a
    white rocket came out crawling with colour.

    A hard threshold has no in-between state to approximate, so it produces no
    noise at all. What survives is the render's real structure -- the black
    interstage, panel seams, engine bells, and the grid fins' actual crosshatch
    -- rendered as crisp shapes instead of dithered mush. Compared side by side
    at 2x, this is dramatically cleaner and loses nothing a viewer would miss.

    Contrast is applied first so the threshold falls in a sparse part of the
    histogram rather than through the middle of the fuselage, where a pixel or
    two of noise would flip large areas.
    """
    from PIL import ImageEnhance
    rgb = ImageEnhance.Contrast(layer.convert("RGB")).enhance(contrast)
    a = np.asarray(rgb).astype(np.int16)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    out = np.empty((a.shape[0], a.shape[1], 3), np.uint8)
    out[lum > cut] = INKS["white"]
    out[lum <= cut] = INKS["black"]
    return Image.fromarray(out, "RGB")


def on(ink):
    """Black or white, whichever reads on `ink`. Rec. 601 luma is plenty for a
    six-value palette and avoids pretending at precision we do not have."""
    r, g, b = ink
    return INKS["black"] if (0.299 * r + 0.587 * g + 0.114 * b) > 128 else INKS["white"]


def fmt_when(iso):
    """LL2's `net` is ISO-8601 Zulu. Rendered in UTC deliberately -- the panel
    hangs in one room but the launches are worldwide, and UTC is what every
    launch feed quotes."""
    try:
        t = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return ""
    return t.strftime("%d %b %Y · %H:%M UTC").upper()


def render(rec, previous=None, art=None):
    pal = palette_for(rec.get("destination"))
    img = Image.new("RGB", (W, H), pal.field)

    if art:
        # The one path where the background itself is a painting.
        import subprocess, tempfile
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "a.png")
            Image.open(art).convert("RGB").save(p)
            subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), p,
                            "--out", os.path.join(td, "a"), "--size", f"{W}x{H}"],
                           check=True, capture_output=True)
            img = Image.open(os.path.join(td, "a.panel.png")).convert("RGB")
    else:
        # The field is already an exact ink and needs no quantization at all.
        # The vehicle is thresholded ALONE and composited through a hard alpha,
        # so no edge picks up a dithered fringe.
        veh, vy = vehicle_layer(rec, H + 20)
        if veh is not None:
            img.paste(posterize_vehicle(veh), (W - veh.width - 34, vy),
                      veh.split()[3].point(lambda v: 255 if v > 140 else 0))

    d = ImageDraw.Draw(img)
    acc = readable(pal.accent, pal.field)
    M, COL = 46, 450

    T.tracked(img, (M, 54), (rec.get("provider") or "").upper()[:44],
              T.font(T.MEDIUM, 10), acc, 1.9)

    # Mission is the hero -- but only when there IS one. Real records carry
    # "Unknown Payload", empty strings, and classified entries; promoting those
    # to a headline would put "UNKNOWN PAYLOAD" in 66pt on the wall. In that
    # case the destination takes the headline back and the mission line is
    # dropped rather than shown empty.
    mission = (rec.get("mission") or "").strip()
    dest = (rec.get("destination") or "UNKNOWN").upper()
    hero_is_mission = bool(mission) and mission.lower() not in (
        "unknown", "unknown payload", "classified", "n/a", "tbd")

    hero = (mission if hero_is_mission else dest).upper()
    hero_lines, fh = T.fit_wrap(d, hero, T.XCONDENSED, COL, 66, 24, track=1.2, max_lines=2)
    y = 74
    for ln in hero_lines:
        T.tracked(img, (M, y), ln, fh, INKS["white"], 1.2)
        y += fh.size + 2
    y += 16
    d.rectangle([M, y, M + 190, y + 4], fill=acc)
    y += 22

    if hero_is_mission:
        fd, td = T.fit_tracked(d, dest, T.MEDIUM, COL, [26, 24, 22, 20, 18, 16], [1.0, 0.4])
        T.tracked(img, (M, y), dest, fd, acc, td)
        y += fd.size + 22

    rows = [("VEHICLE", rec.get("rocket") or ""),
            ("LAUNCH", fmt_when(rec.get("t0_utc"))),
            ("SITE", (rec.get("site") or "").upper())]
    for lab, val in rows:
        if not val:
            continue
        T.tracked(img, (M, y), lab, T.font(T.MEDIUM, 8), acc, 1.8)
        f, tr = T.fit_tracked(d, val, T.BOLD, COL, [14, 13, 12, 11, 10], [0.3, 0.0])
        T.tracked(img, (M, y + 11), val, f, INKS["white"], tr)
        y += f.size + 20

    if rec.get("country"):
        flag.draw(d, rec["country"], M, H - 78, 50, 32)

    # The previous launch, kept deliberately quiet at the very bottom -- it is
    # context, not the subject.
    if previous:
        prev = " · ".join(x for x in [
            "LAST",
            (previous.get("rocket_short") or previous.get("rocket") or "").upper(),
            previous.get("mission") or "",
            fmt_when(previous.get("t0_utc")).split(" · ")[0]] if x)
        f, tr = T.fit_tracked(d, prev, T.MEDIUM, W - M - 250, [10, 9, 8], [1.2, 0.6, 0.2])
        T.tracked(img, (M + 62, H - 62), prev, f, acc, tr)
    return img


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--index", type=int, default=3)
    p.add_argument("--all", action="store_true")
    p.add_argument("--art", help="use a generated painting as the sky (dithered)")
    p.add_argument("--out")
    p.add_argument("--bin", action="store_true", help="also write the packed panel bytes")
    a = p.parse_args()

    from spectra6 import verify
    samples = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
    picks = list(enumerate(samples)) if a.all else [(a.index, samples[a.index])]
    for i, rec in picks:
        prev = samples[(i - 1) % len(samples)]      # stand-in until launch.py runs
        img = render(rec, previous=prev, art=a.art)
        out = a.out if (a.out and not a.all) else os.path.join(
            HERE, f"poster-{i:02d}-{(rec['rocket_short'] or 'x').replace('/', '-')}.png")
        img.save(out)
        bad = verify(img)
        print(f"{os.path.basename(out):44s} {str(palette_for(rec['destination']))[8:-1]:16s}"
              f" {'OK' if not bad else 'OFF-INK ' + str(list(bad)[:3])}")
        if a.bin:
            from spectra6 import pack, index_map
            open(out.rsplit(".", 1)[0] + ".bin", "wb").write(pack(index_map(img)))


if __name__ == "__main__":
    main()
