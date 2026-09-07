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
from datetime import datetime, timezone, timedelta
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
    # Reduce with shrink_keeping_lines, NOT LANCZOS.
    #
    # This used to LANCZOS from ~5000px straight down to `target` -- a 5.4x
    # reduction -- and only the LAST 2.36x (in _vehicle) got the line-preserving
    # treatment. So the fix ran after the damage: LANCZOS averages a 2px dark
    # seam into the surrounding white and it is gone before any threshold sees
    # it, which is exactly what shrink_keeping_lines exists to prevent.
    #
    # Measured dark pixels retained at the drawn size, before -> after:
    #     ariane      3 -> 4,567      atlas      12 -> 3,174
    #     soyuz     705 -> 2,201      falcon  2,243 -> 4,004
    # Ariane and Atlas were rendering as featureless white shapes.
    out = shrink_keeping_lines(im, target)
    # Anchor the nose near the top either way; a slender vehicle's base simply
    # continues past the bottom edge.
    return out, -12


def shrink_keeping_lines(im, h):
    """Downsample so THIN DARK LINES SURVIVE.

    This is the fix for "the rockets have no detail". The generated renders are
    full of real structure -- panel seams, stage divisions, raceways, weld
    lines -- drawn as thin dark marks a couple of pixels wide in a 384px-wide
    image. LANCZOS averages each output pixel from its neighbourhood, so a 2px
    dark line inside a 5px cell is diluted into the surrounding white and is
    simply gone before any threshold sees it. The detail was never lost by the
    palette or the panel; it was lost here, in the resize.

    Taking the MINIMUM of each cell instead means one dark pixel anywhere in
    that cell survives -- which is how a thin line should behave when a drawing
    is reduced. Measured on the Falcon asset: 3,788 dark pixels retained
    against LANCZOS's 1,180.

    Block-reduce via numpy rather than a per-pixel loop; a 384x5079 source at a
    per-cell argmin took long enough to be unusable in a batch.
    """
    w = max(1, round(im.width * h / im.height))
    # Pad up to an exact multiple so the array reshapes cleanly into blocks.
    fy, fx = max(1, im.height // h), max(1, im.width // w)
    im2 = im.resize((w * fx, h * fy), Image.LANCZOS)
    a = np.asarray(im2.convert("RGBA")).astype(np.int16)
    a = a.reshape(h, fy, w, fx, 4)
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2])
    flat = a.transpose(0, 2, 1, 3, 4).reshape(h, w, fy * fx, 4)
    fl = lum.transpose(0, 2, 1, 3).reshape(h, w, fy * fx)
    pick = fl.argmin(axis=2)
    out = np.take_along_axis(flat, pick[:, :, None, None], axis=2)[:, :, 0, :]
    # Alpha is the MAXIMUM over the cell: any coverage means the pixel exists,
    # otherwise the darkest-pixel pick erodes the silhouette edge.
    out[:, :, 3] = flat[:, :, :, 3].max(axis=2)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


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


def _is_dark_vehicle(layer, frac=0.55):
    """True when most of the vehicle is already dark.

    Electron's airframe is bare carbon fibre -- it is genuinely black. A cut
    tuned for a white rocket sends the whole body to one ink and takes every
    panel line with it, which is why it came out a featureless slab while the
    white vehicles gained detail. A dark vehicle needs its linework LIGHT.
    """
    a = np.asarray(layer.convert("RGB")).astype(int)
    alpha = np.asarray(layer.split()[3]) > 140
    if not alpha.any():
        return False
    lum = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2])[alpha]
    return float((lum < 110).mean()) > frac


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
    dark = _is_dark_vehicle(layer)
    rgb = ImageEnhance.Contrast(layer.convert("RGB")).enhance(contrast)
    a = np.asarray(rgb).astype(np.int16)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    out = np.empty((a.shape[0], a.shape[1], 3), np.uint8)
    if dark:
        # Body black, marks white, and the cut moves down into the dark end of
        # the histogram where a black vehicle's detail actually lives.
        c = max(18, np.percentile(lum[np.asarray(layer.split()[3]) > 140], 72))
        out[lum > c] = INKS["white"]
        out[lum <= c] = INKS["black"]
    else:
        out[lum > cut] = INKS["white"]
        out[lum <= cut] = INKS["black"]
    return Image.fromarray(out, "RGB")


def on(ink):
    """Black or white, whichever reads on `ink`. Rec. 601 luma is plenty for a
    six-value palette and avoids pretending at precision we do not have."""
    r, g, b = ink
    return INKS["black"] if (0.299 * r + 0.587 * g + 0.114 * b) > 128 else INKS["white"]


def _us_eastern_offset_hours(t):
    """-5 (EST) or -4 (EDT) for a UTC datetime.

    US Eastern DST runs from the 2nd Sunday in March at 02:00 local (07:00 UTC)
    to the 1st Sunday in November at 02:00 local (06:00 UTC). Both boundaries
    are expressed in UTC here so the test is a plain comparison against the
    instant we already have, with no local-time chicken-and-egg.

    Hard-coded rather than read from a tz database: the device has no tzdata,
    and a rule the C can reproduce exactly is worth more than generality this
    frame will never use.
    """
    y = t.year
    # 2nd Sunday in March: the 8th is the earliest possible, then forward to Sunday
    d = datetime(y, 3, 8, tzinfo=timezone.utc)
    start = d + timedelta(days=(6 - d.weekday()) % 7)      # Monday=0 .. Sunday=6
    start = start.replace(hour=7)
    # 1st Sunday in November
    d = datetime(y, 11, 1, tzinfo=timezone.utc)
    end = d + timedelta(days=(6 - d.weekday()) % 7)
    end = end.replace(hour=6)
    return -4 if start <= t < end else -5


def fmt_when(iso, precision=""):
    """LL2's `net` is ISO-8601 Zulu; the panel shows US Eastern.

    The frame hangs in one room, so it reads in the time of that room -- not
    the time every launch feed happens to quote. The zone label is printed
    (EST/EDT) so it can never be mistaken for UTC.

    `precision` is how much of that timestamp LL2 actually knows. A Month
    record still ships a full stamp -- 2026-09-30T00:00:00Z -- and that
    midnight is a PLACEHOLDER. Printing it as a launch time asserts a fact
    nobody has; roughly 4 of any 10 upcoming launches are Month precision.
    So the format is cut to what is known, and no further.

    Note the ordering: the UTC->Eastern shift happens FIRST, so a launch at
    00:05 UTC correctly reads as the previous evening in New York. Cutting the
    format for a coarse precision happens after, on the shifted date.
    """
    try:
        t = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return ""
    off = _us_eastern_offset_hours(t)
    local = t + timedelta(hours=off)
    zone = "EDT" if off == -4 else "EST"
    p = (precision or "").strip().lower()
    if p == "year":
        return local.strftime("%Y")
    if p == "month":
        return local.strftime("%b %Y").upper()
    if p == "day":
        return local.strftime("%d %b %Y").upper()
    return local.strftime(f"%d %b %Y · %H:%M {zone}").upper()


PPI = 128                  # 800px across a 6.26in panel


def pt(points):
    """Physical points -> pixels. The panel is a 6x4 print, not a poster, so
    type is sized from the real object rather than from how it looks in a
    browser tab -- which is how the headline ended up at 37pt."""
    return max(6, round(points * PPI / 72))


BAND_H, BAND_W = 144, 268
BANDS = ("bottom", "left", "right")     # `top` was cut: the eye hits data
                                        # before image, which inverts the
                                        # poster's own logic.


def _plate(rec, w, h, keep):
    """Scene scaled to COVER w x h, cropped from the side that keeps the
    gantry. Re-snapped after resampling: LANCZOS interpolates, which puts
    colours BETWEEN the inks back into the plate -- that leaked thousands of
    off-ink pixels before this existed. A scaled plate is never assumed legal.
    """
    p = scene.load(rec)
    if p is None:
        return None
    sc = max(w / p.width, h / p.height)
    p = p.resize((max(1, round(p.width * sc)), max(1, round(p.height * sc))), Image.LANCZOS)
    x = 0 if keep == "left" else p.width - w
    return scene.snap_to_inks(p.crop((x, 0, x + w, min(h, p.height))))


def _vehicle(img, rec, box, h):
    veh, _ = vehicle_layer(rec, h + 40)
    if veh is None:
        return
    v = shrink_keeping_lines(veh, h + 30)
    x0, y0, x1, _ = box
    x = int(x0 + (x1 - x0) * 0.58)
    # Keyline first, vehicle over it: the fuselage dissolves against a cream
    # band without one, and flat colour has no tonal separation to fall back on.
    # A dark vehicle needs a LIGHT keyline; a black outline round a black body
    # is invisible and the silhouette dissolves into a night sky.
    key = INKS["white"] if _is_dark_vehicle(v) else INKS["black"]
    img.paste(Image.new("RGB", v.size, key), (x, y0 - 8), outline_mask(v))
    img.paste(posterize_vehicle(v), (x, y0 - 8),
              v.split()[3].point(lambda p: 255 if p > 140 else 0))


_ASCII_FOLD = {"\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"',
               "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " "}


def _first_sentence(t):
    """Opening sentence of an LL2 description, folded to ASCII.

    The atlas is printable ASCII plus U+00B7, and a glyph with no entry is
    skipped -- so a curly apostrophe ("CASC/SAST's") would lose a character on
    the panel and nowhere else. Folded here, once, at the source.
    """
    import re as _re
    t = (t or "").strip()
    for a, b in _ASCII_FOLD.items():
        t = t.replace(a, b)
    return _re.split(r"(?<=[.!?])\s+", t)[0].strip() if t else ""


def _ordinal(n):
    """1 -> 1ST, 11 -> 11TH, 121 -> 121ST. Uppercase, because the band is."""
    if not n or n <= 0:
        return ""
    suf = "TH" if 10 <= n % 100 <= 20 else {1: "ST", 2: "ND", 3: "RD"}.get(n % 10, "TH")
    return f"{n}{suf}"


def _stats_parts(rec):
    """Programme, then this launch's ordinals, MOST interesting first.

    Returned as a list because the caller drops whole facts from the end
    until the line fits. Truncating the string instead leaves a fragment
    like "344TH FOR THIS ..." on the wall.

    LL2's *_launch_attempt_count fields are inclusive of this flight -- 138 when
    the pad has hosted 137 before -- so they read as "the 138th launch from this
    pad", not as a total. A zero means the API did not supply it, and that fact
    is dropped rather than printed as "0TH".

    "THIS PAD" / "THIS SITE" / "THIS AGENCY" instead of repeating names that the
    provider line directly above already spells out.
    """
    year = (rec.get("t0_utc") or "")[:4]
    parts = list(rec.get("program") or [])
    if rec.get("n_year") and year:
        parts.append(f"{_ordinal(rec['n_year'])} ORBITAL ATTEMPT OF {year}")
    if rec.get("n_pad"):
        parts.append(f"{_ordinal(rec['n_pad'])} FROM THIS PAD")
    if rec.get("n_site"):
        parts.append(f"{_ordinal(rec['n_site'])} FROM THIS SITE")
    if rec.get("n_agency"):
        parts.append(f"{_ordinal(rec['n_agency'])} FOR THIS AGENCY")
    return [x.upper() for x in parts]


def _short_site(v):
    """First segment of a site string.

    LL2 sites carry a country tail ("Jiuquan Satellite Launch Center, People's
    Republic of China" is 59 chars). The segment before the first comma is the
    part a reader needs; the rest is the flag's job.
    """
    return (v or "").split(",")[0].strip()


def _band_text(img, d, rec, box, centred, previous=None):
    x0, y0, x1, y1 = box
    colw = x1 - x0 - 48
    ink, sub = INKS["black"], INKS["red"]

    def put(t, f, tr, y, col):
        w = T.tracked_width(d, t, f, tr)
        x = x0 + (x1 - x0 - w) / 2 if centred else x0 + 24
        T.tracked(img, (x, y), t, f, col, tr)

    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, fh = T.fit_wrap(d, dest, T.XCONDENSED, colw, pt(21), pt(10), 2.0,
                           1 if centred else 3)
    y = y0 + (14 if centred else 26)
    for ln in lines:
        put(ln, fh, 2.0, y, ink)
        y += fh.size + 3
    y += 5

    # Mission and vehicle only. Adding provider (50 chars) and site (59) forced
    # this line to 7px, which is about five pixels of letterform on a 128 PPI
    # panel -- fewer words at a legible size beats more words as texture.
    line = "  ·  ".join(x for x in [rec.get("mission"), rec.get("rocket")] if x).upper()
    f2, t2, line = T.fit_tracked(d, line, T.MEDIUM, colw,
                           [pt(7.5), pt(7), pt(6.5)], [1.6, 0.9, 0.3])
    if centred:
        put(line, f2, t2, y, sub); y += f2.size + 5
    else:
        for ln in T.wrap(d, line, f2, colw)[:3]:
            put(ln, f2, t2, y, sub); y += f2.size + 4
        y += 6

    meta = fmt_when(rec.get("t0_utc"), rec.get("net_precision"))
    f3, t3, meta = T.fit_tracked(d, meta, T.MEDIUM, colw,
                           [pt(6), pt(5.5)], [1.2, 0.6, 0.3])
    put(meta, f3, t3, y, ink)
    y += f3.size + 4

    # Provider and launch site. The first draft tried to append these to line 2
    # and drove it to 7px; on their own line they fit at a legible size.
    # Fitted against 620px, NOT colw: `put` centres on the full 800 box, and a
    # line wider than ~660 would start left of x=70 and run under the flag
    # (x=30..70, y=436..461). Capping the fit width is what keeps them apart.
    who = " · ".join(x for x in [rec.get("provider"),
                                 _short_site(rec.get("site"))] if x).upper()
    if who:
        f5, t5, who = T.fit_tracked(d, who, T.MEDIUM, 620,
                                    [pt(5.5), pt(5)], [0.6, 0.3])
        put(who, f5, t5, y, ink)
        y += f5.size + 5

    # Counters LL2 always sends and nothing rendered until now. Same 620px cap
    # as the provider line, for the same reason: a wider centred line starts
    # left of x=70 and runs under the flag.
    parts = _stats_parts(rec)
    while parts:
        st = " · ".join(parts)
        f6 = T.font(T.MEDIUM, pt(5))          # the floor of the ladder below
        if T.string_width(d, st, f6, 0) <= 620:
            break
        parts.pop()                            # drop the least interesting fact
    if parts:
        st = " · ".join(parts)
        f6, t6, st = T.fit_tracked(d, st, T.MEDIUM, 620,
                                   [pt(5)], [1.0, 0.5])
        put(st, f6, t6, y, ink)
        y += f6.size + 4

    # Mission description, one line. Falls back to the mission TYPE (a short
    # noun like "Resupply") when the sentence will not fit, so the line either
    # says something whole or says something shorter -- never a clipped
    # fragment. Both come straight from LL2 and neither is invented.
    f7 = T.font(T.MEDIUM, pt(5))
    blurb = _first_sentence(rec.get("description")).upper()
    if blurb in ("DETAILS TBD.", "TBD."):
        blurb = ""
    if blurb and T.string_width(d, blurb, f7, 0) > 620:
        blurb = (rec.get("purpose") or "").upper()
        if blurb == "UNKNOWN":
            blurb = ""
    if blurb and T.string_width(d, blurb, f7, 0) <= 620:
        put(blurb, f7, 0, y, ink)
        y += f7.size + 4

    if previous:
        prev = "LAST · " + " · ".join(x for x in [
            (previous.get("rocket_short") or previous.get("rocket") or "").upper(),
            fmt_when(previous.get("t0_utc"), previous.get("net_precision")).split(" · ")[0]] if x)
        f4, t4, prev = T.fit_tracked(d, prev, T.MEDIUM, colw, [pt(5.5), pt(5)], [1.0, 0.5])
        put(prev, f4, t4, y, sub)


def render(rec, previous=None, art=None, band="bottom"):
    """Scene above, type in a band -- the structure of the alpine travel
    posters this is modelled on. The scene is generated; the vehicle, the type,
    the palette and the band are not.
    """
    if band not in BANDS:
        raise ValueError(f"band must be one of {BANDS}, got {band!r}")
    pal = palette_for(rec.get("destination"))
    img = Image.new("RGB", (W, H), pal.field)
    d = ImageDraw.Draw(img)

    if band == "bottom":
        sbox, bbox, keep = (0, 0, W, H - BAND_H), (0, H - BAND_H, W, H), "left"
    elif band == "left":
        sbox, bbox, keep = (BAND_W, 0, W, H), (0, 0, BAND_W, H), "right"
    else:
        sbox, bbox, keep = (0, 0, W - BAND_W, H), (W - BAND_W, 0, W, H), "left"

    sw, sh = sbox[2] - sbox[0], sbox[3] - sbox[1]
    p = _plate(rec, sw, sh, keep)
    if p is not None:
        img.paste(p, (sbox[0], sbox[1]))
    _vehicle(img, rec, sbox, sh)

    # The band is painted regardless of what the model drew there. The prompt
    # asks for that region to be left plain; it is never trusted to comply.
    d.rectangle(list(bbox), fill=INKS["white"])
    if band == "bottom":
        d.rectangle([0, bbox[1], W, bbox[1] + 4], fill=INKS["black"])
    elif band == "left":
        d.rectangle([bbox[2] - 4, 0, bbox[2], H], fill=INKS["black"])
    else:
        d.rectangle([bbox[0], 0, bbox[0] + 4, H], fill=INKS["black"])

    _band_text(img, d, rec, bbox, centred=(band == "bottom"), previous=previous)
    if rec.get("country"):
        fx, fy = (30, H - 44) if band == "bottom" else \
                 (24, H - 48) if band == "left" else (bbox[0] + 24, H - 48)
        flag.draw(d, rec["country"], fx, fy, 40, 25)
    return img


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--index", type=int, default=3)
    p.add_argument("--all", action="store_true")
    p.add_argument("--art", help="use a generated painting as the sky (dithered)")
    p.add_argument("--out")
    p.add_argument("--bin", action="store_true", help="also write the packed panel bytes")
    p.add_argument("--band", default="bottom", choices=BANDS)
    a = p.parse_args()

    from spectra6 import verify
    samples = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
    picks = list(enumerate(samples)) if a.all else [(a.index, samples[a.index])]
    for i, rec in picks:
        prev = samples[(i - 1) % len(samples)]      # stand-in until launch.py runs
        img = render(rec, previous=prev, art=a.art, band=a.band)
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
