#!/usr/bin/env python3
"""
The vehicle as explicit LINE ART, not a thresholded photograph.

The failure this replaces: a photorealistic render hard-thresholded to two
inks. The silhouette survived and every interior mark died, because a
luminance threshold cannot draw a thin line -- a raceway one shade darker than
the fuselage is simply gone. The information was never clearly represented in
the render, so no better threshold recovers it.

Here every mark is a deliberate design element drawn at a width chosen to
survive the panel. Line weights follow measured guidance for a 127 PPI panel
with a 0.200mm pixel pitch:

    1px = 0.198mm = 0.56pt      too thin to rely on
    2px = 0.397mm = 1.13pt      the working line
    3px = 0.595mm = 1.69pt      reversed gaps in dark areas
    3x3px                        smallest isolated mark
    4-6px                        engine bell openings

Drawn directly in pixels rather than rasterised from SVG. An SVG renderer
antialiases curves, and an antialiased black edge against white produces
intermediate values that become arbitrary colours when snapped to six inks --
the exact class of bug that has bitten this kit twice already. Drawing at final
resolution means every pixel is chosen, not interpolated.

The detail set is deliberately SHORT. At 150px wide a Falcon 9's raceway is
about 4 pixels; most real surface detail is below what the panel can show. What
earns a mark: it identifies the vehicle, separates two major masses, or
explains a distinctive mechanism. Everything else is noise that reads as a
smudge.
"""

import math

from PIL import Image, ImageDraw

from palette import INKS

LINE = 2          # the working stroke
HEAVY = 3         # separations that must not close up
BODY, INK = INKS["white"], INKS["black"]


def _v(d, x, y0, y1, w=LINE, ink=INK):
    d.rectangle([x - w / 2, y0, x + w / 2, y1], fill=ink)


def _h(d, x0, x1, y, w=LINE, ink=INK):
    d.rectangle([x0, y - w / 2, x1, y + w / 2], fill=ink)


def poster_ratio(real, floor=7.0, ceiling=13.0):
    """Compress a true height:width ratio into a DRAWABLE one.

    Falcon 9 is 70m x 3.66m -- a ratio of 19.2. At 340px tall that puts the
    body 18px across, and two 2px outlines already eat 4 of them. A raceway, a
    grid fin and an interstage band do not fit in what is left. True proportion
    and legible linework are in direct conflict at 128 PPI.

    Vintage travel posters resolve this the same way every time: they
    exaggerate. Broders' funiculars are stubbier than the real thing because a
    true-proportion cable car would be a hairline. So ratios are compressed
    toward a drawable band, preserving ORDER -- a Falcon still reads as slimmer
    than a Long March -- while giving every vehicle room for its marks.
    """
    return max(floor, min(ceiling, math.sqrt(real) * 2.6))


def falcon9(W=150, H=340, ratio=None, accent=None):
    """Falcon 9 Block 5. Marks kept, in order of what identifies it:
    the black interstage band, the nine-engine octaweb, four grid fins, four
    landing legs, and the two raceways running the core. Everything else --
    weld beads, panel seams, fasteners -- is dropped as sub-pixel."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = W / 2
    body_h = H - 46
    bw = body_h / (ratio or poster_ratio(70.0 / 3.66))
    x0, x1 = cx - bw / 2, cx + bw / 2
    nose_h = bw * 1.9
    top, bot = nose_h + 6, H - 26

    # --- fairing: ogive, filled then outlined -------------------------------
    pts = [(cx - bw / 2 * math.cos(t * math.pi / 2) ** 0.55, top - nose_h * t)
           for t in [i / 24 for i in range(25)]]
    pts += [(cx + bw / 2 * math.cos(t * math.pi / 2) ** 0.55, top - nose_h * t)
            for t in [i / 24 for i in range(24, -1, -1)]]
    d.polygon(pts, fill=BODY)
    d.line(pts + [pts[0]], fill=INK, width=LINE, joint="curve")

    # --- core body ----------------------------------------------------------
    d.rectangle([x0, top, x1, bot], fill=BODY)
    _v(d, x0, top, bot); _v(d, x1, top, bot)

    # --- interstage: the single most identifying mark -----------------------
    iy0, iy1 = top + (bot - top) * 0.30, top + (bot - top) * 0.38
    d.rectangle([x0, iy0, x1, iy1], fill=INK)
    _h(d, x0, x1, top + (bot - top) * 0.30, HEAVY)

    # --- stage separation ---------------------------------------------------
    _h(d, x0, x1, top + (bot - top) * 0.14)

    # --- raceways: two, because one reads as an error -----------------------
    for f in (0.36, 0.64):
        _v(d, x0 + bw * f, iy1 + 6, bot - 4)

    # --- grid fins: 3x3 minimum, drawn as filled squares with a gap ---------
    for side in (-1, 1):
        gx = cx + side * (bw / 2)
        gy = iy1 + 10
        gw, gh = bw * 0.22, bw * 0.30
        box = [min(gx, gx + side * gw), gy, max(gx, gx + side * gw), gy + gh]
        d.rectangle(box, fill=BODY)
        d.rectangle(box, outline=INK, width=LINE)

    # --- landing legs: stowed, as tapered wedges ----------------------------
    for side in (-1, 1):
        lx = cx + side * (bw / 2)
        d.polygon([(lx, bot - bw * 1.5), (lx + side * bw * 0.18, bot),
                   (lx, bot)], fill=BODY)
        d.line([(lx, bot - bw * 1.5), (lx + side * bw * 0.18, bot)],
               fill=INK, width=LINE)

    # --- octaweb + engine bells --------------------------------------------
    ow = bw * 1.14
    d.polygon([(cx - bw / 2, bot), (cx + bw / 2, bot),
               (cx + ow / 2, bot + 10), (cx - ow / 2, bot + 10)], fill=BODY)
    d.line([(cx - bw / 2, bot), (cx - ow / 2, bot + 10)], fill=INK, width=LINE)
    d.line([(cx + bw / 2, bot), (cx + ow / 2, bot + 10)], fill=INK, width=LINE)
    _h(d, cx - ow / 2, cx + ow / 2, bot + 10)
    # Nine engines is the identity, but nine bells at 150px is 5px each and
    # merges into a bar. Three drawn at a legible 6px reads as "a cluster",
    # which is the honest simplification.
    for i in range(3):
        ex = cx - ow * 0.32 + ow * 0.32 * i
        d.polygon([(ex - 3, bot + 10), (ex + 3, bot + 10),
                   (ex + 5, bot + 20), (ex - 5, bot + 20)], fill=BODY)
        d.line([(ex - 3, bot + 10), (ex - 5, bot + 20)], fill=INK, width=LINE)
        d.line([(ex + 3, bot + 10), (ex + 5, bot + 20)], fill=INK, width=LINE)
        _h(d, ex - 5, ex + 5, bot + 20)
    return img


if __name__ == "__main__":
    from spectra6 import verify
    a = falcon9()
    bg = Image.new("RGB", (a.width, a.height), INKS["blue"])
    bg.paste(a.convert("RGB"), (0, 0), a)
    print("line-art vehicle:", a.size, "off-ink:", verify(bg))
    bg.save("_lineart.png")
    bg.resize((a.width * 3, a.height * 3), Image.NEAREST).save("_lineart_3x.png")
