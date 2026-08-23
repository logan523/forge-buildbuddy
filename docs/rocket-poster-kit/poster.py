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
import scene
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


def outline_mask(layer, weight=3):
    """A black keyline around the vehicle.

    Without it the white fuselage dissolves wherever it crosses a light sky
    band -- the silhouette simply stops existing against cream. Every one of
    the reference posters outlines its subject for exactly this reason: flat
    colour has no tonal separation to fall back on, so the edge has to be
    drawn. Dilating the alpha and painting under the vehicle keeps the outline
    outside the artwork rather than eating into it.
    """
    from PIL import ImageFilter
    a = layer.split()[3].point(lambda v: 255 if v > 140 else 0)
    return a.filter(ImageFilter.MaxFilter(weight * 2 + 1))


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


PPI = 128                  # 800px across a 6.26in panel


def pt(points):
    """Physical points -> pixels. The panel is a 6x4 print, not a poster, so
    type is sized from the real object rather than from how it looks in a
    browser tab -- which is how the headline ended up at 37pt."""
    return max(6, round(points * PPI / 72))


def render(rec, previous=None, art=None):
    """Scene on top, type in a band below -- the structure of the alpine travel
    posters this is modelled on. The scene is generated; the vehicle, the type,
    the palette and the band are not.
    """
    pal = palette_for(rec.get("destination"))
    BAND = H - scene.SCENE_H          # 144px

    plate = None if art else scene.load(rec)
    img = Image.new("RGB", (W, H), pal.field)
    if plate is not None:
        img.paste(plate, (0, 0))
    elif art:
        import subprocess, tempfile
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "a.png")
            Image.open(art).convert("RGB").save(p)
            subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), p,
                            "--out", os.path.join(td, "a"), "--size", f"{W}x{scene.SCENE_H}"],
                           check=True, capture_output=True)
            img.paste(Image.open(os.path.join(td, "a.panel.png")).convert("RGB"), (0, 0))

    # The vehicle stands IN the scene, its base meeting the band.
    veh, _ = vehicle_layer(rec, scene.SCENE_H + 40)
    if veh is not None:
        sc = (scene.SCENE_H + 34) / veh.height
        v = veh.resize((max(1, round(veh.width * sc)), scene.SCENE_H + 34), Image.LANCZOS)
        x = int(W * 0.56)
        img.paste(Image.new("RGB", v.size, INKS["black"]), (x, -8), outline_mask(v))
        img.paste(posterize_vehicle(v), (x, -8),
                  v.split()[3].point(lambda p: 255 if p > 140 else 0))

    # The band is painted regardless of what the model did down there -- the
    # prompt asks for it to be left plain, but it is never trusted to comply.
    d = ImageDraw.Draw(img)
    band_ink = INKS["white"] if plate is None else INKS["white"]
    d.rectangle([0, scene.SCENE_H, W, H], fill=band_ink)
    d.rectangle([0, scene.SCENE_H, W, scene.SCENE_H + 4], fill=INKS["black"])
    ink, sub = INKS["black"], INKS["red"]

    # Destination is the headline in the band, the way the resort name is on a
    # ski poster; the mission carries the line beneath it.
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, fh = T.fit_wrap(d, dest, T.XCONDENSED, W - 120, pt(23), pt(11), 2.0, 1)
    hw = T.tracked_width(d, lines[0], fh, 2.0)
    T.tracked(img, ((W - hw) / 2, scene.SCENE_H + 22), lines[0], fh, ink, 2.0)
    y = scene.SCENE_H + 22 + fh.size + 12

    mission = (rec.get("mission") or "").strip()
    bits = [x for x in [mission, rec.get("rocket"), rec.get("provider")] if x]
    line = "  ·  ".join(bits).upper()
    f2, t2 = T.fit_tracked(d, line, T.MEDIUM, W - 150,
                           [pt(7), pt(6.5), pt(6), pt(5.5), pt(5)], [1.6, 0.9, 0.4])
    lw = T.tracked_width(d, line, f2, t2)
    d.rectangle([(W - lw) / 2 - 28, y + f2.size / 2, (W - lw) / 2 - 10,
                 y + f2.size / 2 + 2], fill=sub)
    d.rectangle([(W + lw) / 2 + 10, y + f2.size / 2, (W + lw) / 2 + 28,
                 y + f2.size / 2 + 2], fill=sub)
    T.tracked(img, ((W - lw) / 2, y), line, f2, sub, t2)
    y += f2.size + 10

    meta = "  ·  ".join(x for x in [fmt_when(rec.get("t0_utc")),
                                    (rec.get("site") or "").upper()] if x)
    f3, t3 = T.fit_tracked(d, meta, T.MEDIUM, W - 170,
                           [pt(5), pt(4.6), pt(4.2)], [1.0, 0.5, 0.2])
    mw = T.tracked_width(d, meta, f3, t3)
    T.tracked(img, ((W - mw) / 2, y), meta, f3, ink, t3)

    if rec.get("country"):
        flag.draw(d, rec["country"], 30, H - 40, 40, 25)
    if previous:
        prev = "LAST · " + " · ".join(x for x in [
            (previous.get("rocket_short") or previous.get("rocket") or "").upper(),
            fmt_when(previous.get("t0_utc")).split(" · ")[0]] if x)
        f4, t4 = T.fit_tracked(d, prev, T.MEDIUM, 300, [pt(4.2), pt(4)], [0.9, 0.4])
        pw = T.tracked_width(d, prev, f4, t4)
        T.tracked(img, (W - 30 - pw, H - 34), prev, f4, sub, t4)
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
