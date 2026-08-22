#!/usr/bin/env python3
"""
The poster. One Launch Library 2 record in, one 800x480 six-ink panel out.

Style is the 1930s alpine travel poster -- Roger Broders, Emil Cardinaux --
transposed to spaceflight: two or three flat color fields, one bold subject,
the destination set huge across the bottom the way ZERMATT was. That reference
is not decoration. Those posters were screen-printed with a handful of flat
spot inks, which is almost exactly what a 6-color e-ink panel imposes.

It is also, measurably, the only style this panel renders perfectly. An image
whose every fill is already an exact ink passes through the quantizer
UNCHANGED -- six colors in, six colors out, pixel for pixel, no dithering
anywhere. Introduce one off-palette fill and that region immediately fragments
into dithered noise. So `verify()` returning an empty set is not a nicety here;
it is the whole design thesis, enforced.

The destination is the headline. `DESIGN-PROMPT.md` argued the opposite -- 81
of the next 100 launches go to Low Earth / Polar / Sun-Synchronous orbit, so
leading with the orbit is dull four days in five. That was right when the
destination was the only thing that varied. It no longer is: the palette, the
silhouette and the mission line all move with it, so the repeated word reads as
series identity rather than monotony. The reversal is deliberate, not drift.
"""

import argparse, json, os, sys
from datetime import datetime, timezone
from PIL import Image, ImageDraw

import typeset as T
from palette import INKS, CANVAS, palette_for
from vehicle import draw_flat

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = CANVAS
M = 44                      # margin
HORIZON = 262               # hard edge between sky and the type band
FOOTER_H = 36               # previous-launch strip
BAND_TOP = HORIZON + 6


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
    d = ImageDraw.Draw(img)

    # --- sky -----------------------------------------------------------------
    if art:
        # The one path where dithering is wanted: a generated painting has tone
        # to preserve. Flat template art never takes this branch.
        import subprocess, tempfile
        src = Image.open(art).convert("RGB")
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "a.png")
            src.save(p)
            subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), p,
                            "--out", os.path.join(td, "a"), "--size", f"{W}x{HORIZON}"],
                           check=True, capture_output=True)
            img.paste(Image.open(os.path.join(td, "a.panel.png")).convert("RGB"), (0, 0))
    else:
        # A second flat band gives the sky depth without a gradient. Two hard
        # steps read as atmosphere; a smooth ramp reads as dither noise.
        d.rectangle([0, 0, W, int(HORIZON * 0.42)], fill=on(pal.field))
        d.rectangle([0, 0, W, int(HORIZON * 0.42)], fill=pal.field)  # keep it plain
        veh, _ = draw_flat(rec, pal, w=250, h=400)
        # NEAREST, always: any interpolating resample invents in-between colors
        # and would put off-palette pixels straight onto the panel.
        veh = veh.rotate(-20, expand=True, resample=Image.NEAREST)
        # Size to the space that exists, rather than to a fixed number that
        # happened to look right once -- an unbounded thumbnail ran the nose
        # straight off the top of the canvas.
        OVERLAP, TOP_MARGIN, MAX_W = 34, 16, 430
        # Scale to HEIGHT first so every vehicle stands the same tall in the
        # frame -- fitting to a width box instead made the wide strap-on
        # families (H3, GSLV) render visibly smaller than a bare Falcon, which
        # read as an inconsistent series rather than a design choice.
        target_h = HORIZON + OVERLAP - TOP_MARGIN
        scale = target_h / veh.height
        if veh.width * scale > MAX_W:
            scale = MAX_W / veh.width
        veh = veh.resize((max(1, int(veh.width * scale)), max(1, int(veh.height * scale))),
                         Image.NEAREST)
        # Overlapping the horizon is the point: the vehicle rises OUT of the
        # band rather than sitting politely above it.
        img.paste(veh, (W - veh.width - 30, HORIZON + OVERLAP - veh.height), veh)

    d.rectangle([0, HORIZON, W, BAND_TOP], fill=pal.accent)
    d.rectangle([0, BAND_TOP, W, H - FOOTER_H], fill=INKS["black"])

    # --- type band -----------------------------------------------------------
    # Measured, then vertically centered. Setting each line from a running
    # cursor let the last one fall off the bottom of the band when the headline
    # came back tall -- the meta line simply vanished, silently, which is the
    # failure mode this whole kit is supposed to make impossible.
    dest = (rec.get("destination") or "UNKNOWN").upper()
    lines, f_dest = T.fit_headline(d, dest, (rec.get("destination_abbrev") or "").upper(),
                                   T.XCONDENSED, W - M * 2, 72, 34, track=1.5)
    head = lines[0]

    vehicle_line = " · ".join(x for x in [rec.get("rocket"), rec.get("mission"),
                                          rec.get("provider")] if x)
    f_v, tr_v = T.fit_tracked(d, vehicle_line, T.MEDIUM, W - M * 2,
                              [19, 18, 17, 16, 15, 14, 13], [0.8, 0.4, 0.0])

    meta = " · ".join(x for x in [fmt_when(rec.get("t0_utc")),
                                  (rec.get("purpose") or "").upper(),
                                  (rec.get("site") or "").upper()] if x)
    f_m, tr_m = T.fit_tracked(d, meta, T.MEDIUM, W - M * 2,
                              [13, 12, 11, 10, 9], [0.6, 0.3, 0.0])

    GAP_H, GAP_V = 12, 9
    stack = f_dest.size + GAP_H + f_v.size + GAP_V + f_m.size
    band_h = (H - FOOTER_H) - BAND_TOP
    y = BAND_TOP + max(8, (band_h - stack) // 2) - 6

    T.tracked(img, (M, y), head, f_dest, INKS["white"], 1.5)
    y += f_dest.size + GAP_H
    T.tracked(img, (M, y), vehicle_line, f_v, pal.accent, tr_v)
    y += f_v.size + GAP_V
    T.tracked(img, (M, y), meta, f_m, INKS["white"], tr_m)

    # --- previous-launch footer ---------------------------------------------
    d.rectangle([0, H - FOOTER_H, W, H], fill=pal.accent)
    if previous:
        prev = "LAST · " + " · ".join(x for x in [
            (previous.get("rocket_short") or previous.get("rocket") or "").upper(),
            previous.get("mission"),
            fmt_when(previous.get("t0_utc")).split(" · ")[0]] if x)
        f_p, tr_p = T.fit_tracked(d, prev, T.MEDIUM, W - M * 2,
                                  [12, 11, 10, 9], [1.4, 0.8, 0.3, 0.0])
        T.tracked(img, (M, H - FOOTER_H + 11), prev, f_p, on(pal.accent), tr_p)
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
