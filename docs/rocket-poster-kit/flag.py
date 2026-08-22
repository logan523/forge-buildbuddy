"""
Country flags, simplified to what survives at rocket-body scale.

`country_code` is 100% populated on Launch Library 2's agency object -- the one
identity field with no gaps at all -- so this needs no fallback table and no
manual per-launch work.

Flags are also an unusually good fit for this panel: they are flat geometry in
saturated primaries, which is exactly what six inks render losslessly. The
catch is size. On the vehicle body a flag is ~30px wide, where 50 stars, a
Union Jack's diagonals or a Korean trigram are indistinguishable mush. So each
flag is reduced to the two or three shapes that actually identify it at
distance -- which is how markings read on a real launch vehicle anyway.

Specified as fractions of the flag rect, so one definition serves both the
small body marking and a large design block.
"""

from palette import INKS

K, W, R, Y, B, G = (INKS[n] for n in ("black", "white", "red", "yellow", "blue", "green"))

# bars: (x0, y0, x1, y1, ink) as fractions. disc: (cx, cy, r, ink).
# India's saffron and Korea's trigrams have no ink; yellow and omission are the
# honest approximations rather than a wrong-but-confident colour.
FLAGS = {
    "USA": dict(bars=[(0, 0, 1, 1, W), (0, .14, 1, .29, R), (0, .43, 1, .57, R),
                      (0, .71, 1, .86, R), (0, 0, .42, .54, B)]),
    "CHN": dict(bars=[(0, 0, 1, 1, R), (.08, .14, .30, .44, Y)]),
    "RUS": dict(bars=[(0, 0, 1, .34, W), (0, .34, 1, .67, B), (0, .67, 1, 1, R)]),
    "IND": dict(bars=[(0, 0, 1, .34, Y), (0, .34, 1, .67, W), (0, .67, 1, 1, G)],
                disc=(.5, .5, .13, B)),
    "JPN": dict(bars=[(0, 0, 1, 1, W)], disc=(.5, .5, .30, R)),
    "FRA": dict(bars=[(0, 0, .34, 1, B), (.34, 0, .67, 1, W), (.67, 0, 1, 1, R)]),
    "GUF": dict(bars=[(0, 0, .34, 1, B), (.34, 0, .67, 1, W), (.67, 0, 1, 1, R)]),
    # The diagonals are the Union Jack's identity; without them it reads as an
    # Iceland cross. Drawn as explicit corner-to-corner bands.
    "GBR": dict(bars=[(0, 0, 1, 1, B)],
                diagonals=[(W, .22), (R, .10)],
                bars2=[(0, .38, 1, .62, W), (0, .43, 1, .57, R),
                       (.40, 0, .60, 1, W), (.44, 0, .56, 1, R)]),
    "NZL": dict(bars=[(0, 0, 1, 1, B), (0, 0, .45, .5, B), (.60, .30, .74, .48, R),
                      (.76, .55, .90, .73, R)]),
    "KOR": dict(bars=[(0, 0, 1, 1, W), (0, 0, 1, .5, R)], disc=(.5, .5, .22, B)),
    "PRK": dict(bars=[(0, 0, 1, 1, R), (0, 0, 1, .22, B), (0, .78, 1, 1, B)],
                disc=(.33, .5, .16, W)),
    "IRN": dict(bars=[(0, 0, 1, .34, G), (0, .34, 1, .67, W), (0, .67, 1, 1, R)]),
    "ISR": dict(bars=[(0, 0, 1, 1, W), (0, .12, 1, .26, B), (0, .74, 1, .88, B)]),
    "CAN": dict(bars=[(0, 0, .28, 1, R), (.28, 0, .72, 1, W), (.72, 0, 1, 1, R)],
                disc=(.5, .5, .20, R)),
    "KAZ": dict(bars=[(0, 0, 1, 1, B)], disc=(.5, .45, .20, Y)),
    "AUS": dict(bars=[(0, 0, 1, 1, B), (.62, .28, .74, .44, W), (.78, .58, .90, .74, W)]),
    "ITA": dict(bars=[(0, 0, .34, 1, G), (.34, 0, .67, 1, W), (.67, 0, 1, 1, R)]),
    "BRA": dict(bars=[(0, 0, 1, 1, G)], disc=(.5, .5, .28, Y)),
    # Nordic crosses: the vertical bar sits toward the hoist, not centred.
    # Norway and Sweden are in the fixture set (Andoya, Esrange) -- the flag
    # coverage test caught their absence.
    "NOR": dict(bars=[(0, 0, 1, 1, R), (0, .36, 1, .64, W), (.24, 0, .46, 1, W),
                      (0, .43, 1, .57, B), (.30, 0, .40, 1, B)]),
    "SWE": dict(bars=[(0, 0, 1, 1, B), (0, .40, 1, .60, Y), (.26, 0, .44, 1, Y)]),
    "DNK": dict(bars=[(0, 0, 1, 1, R), (0, .40, 1, .60, W), (.26, 0, .44, 1, W)]),
    "FIN": dict(bars=[(0, 0, 1, 1, W), (0, .38, 1, .62, B), (.24, 0, .46, 1, B)]),
    "DEU": dict(bars=[(0, 0, 1, .34, K), (0, .34, 1, .67, R), (0, .67, 1, 1, Y)]),
    "ESP": dict(bars=[(0, 0, 1, .26, R), (0, .26, 1, .74, Y), (0, .74, 1, 1, R)]),
    "UKR": dict(bars=[(0, 0, 1, .5, B), (0, .5, 1, 1, Y)]),
    "TWN": dict(bars=[(0, 0, 1, 1, R), (0, 0, .5, .5, B)]),
    "ESA": dict(bars=[(0, 0, 1, 1, B)], disc=(.5, .5, .22, Y)),
    "EU":  dict(bars=[(0, 0, 1, 1, B)], disc=(.5, .5, .22, Y)),
}
# No ink is right for every nation, and inventing one would be worse than
# saying so: an unknown code renders as a plain neutral block.
UNKNOWN = dict(bars=[(0, 0, 1, 1, W), (0, .40, 1, .60, K)])


def draw(d, code, x, y, w, h, border=True):
    """Paint a flag into an existing ImageDraw at a pixel rect."""
    spec = FLAGS.get((code or "").upper(), UNKNOWN)
    for x0, y0, x1, y1, ink in spec["bars"]:
        d.rectangle([x + x0 * w, y + y0 * h, x + x1 * w, y + y1 * h], fill=ink)
    for ink, thick in spec.get("diagonals", []):
        t = max(1, int(thick * min(w, h)))
        d.line([(x, y), (x + w, y + h)], fill=ink, width=t)
        d.line([(x + w, y), (x, y + h)], fill=ink, width=t)
    for x0, y0, x1, y1, ink in spec.get("bars2", []):
        d.rectangle([x + x0 * w, y + y0 * h, x + x1 * w, y + y1 * h], fill=ink)
    if "disc" in spec:
        cx, cy, r, ink = spec["disc"]
        rr = r * min(w, h)
        d.ellipse([x + cx * w - rr, y + cy * h - rr, x + cx * w + rr, y + cy * h + rr], fill=ink)
    if border:
        d.rectangle([x, y, x + w, y + h], outline=INKS["black"], width=1)


def known(code):
    return (code or "").upper() in FLAGS


if __name__ == "__main__":
    from PIL import Image, ImageDraw
    codes = list(FLAGS) + ["ZZZ"]
    cw, ch, pad = 96, 64, 14
    cols = 7
    rows = (len(codes) + cols - 1) // cols
    im = Image.new("RGB", (cols * (cw + pad) + pad, rows * (ch + pad + 16) + pad), INKS["black"])
    d = ImageDraw.Draw(im)
    for i, c in enumerate(codes):
        r, col = divmod(i, cols)
        x, y = pad + col * (cw + pad), pad + r * (ch + pad + 16)
        draw(d, c, x, y, cw, ch)
        d.text((x, y + ch + 3), c, fill=INKS["white"])
    im.save("flags.png")
    print(f"{len(FLAGS)} flags + unknown fallback -> flags.png")
