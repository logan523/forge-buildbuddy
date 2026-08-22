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


def vehicle_layer(rec, h):
    """Tonal render if the family has one, else the flat parametric fallback.
    Coverage never has a hole; it has a lower-fidelity floor."""
    fam = (rec.get("rocket_family") or "").strip()
    im = ingest.load_tonal(fam) if fam else None
    if im is None:
        im, _ = draw_vehicle(rec, palette_for(rec.get("destination")),
                             H=h, country=rec.get("country"))
    if im is None:
        return None
    s = h / im.height
    return im.resize((max(1, round(im.width * s)), h), Image.LANCZOS)


def dither(img):
    """Quantize background+vehicle to six inks. Type is drawn AFTER."""
    import subprocess, tempfile
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "c.png")
        img.convert("RGB").save(p)
        subprocess.run([sys.executable, os.path.join(HERE, "spectra6.py"), p,
                        "--out", os.path.join(td, "c"), "--size", f"{img.width}x{img.height}",
                        "--saturation", "1.6", "--contrast", "1.05"],
                       check=True, capture_output=True)
        return Image.open(os.path.join(td, "c.panel.png")).convert("RGB")


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
        veh = vehicle_layer(rec, H + 20)
        if veh is not None:
            img.paste(veh.convert("RGB"), (W - 250, -10), veh)
        img = dither(img)

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
