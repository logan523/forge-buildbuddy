#!/usr/bin/env python3
"""
Structural QA for generated plates.

The first drift metric measured palette-histogram distance and reported the
series was getting WORSE as it got better. That metric was wrong: the palette
is keyed to destination on purpose, so a blue lunar plate and a red Mars plate
SHOULD have different ink mixes. Penalising that penalised the design.

What must actually stay constant is structure -- the thing that makes two
posters look like the same illustrator even in different colours, which is
exactly the relationship between the Zermatt and Dolomiti references. So:

* horizontal banding (a layered sky, not a flat void)
* a horizon in the lower third
* ground silhouettes along the bottom
* gantry mass in the left third
* neither collapsed to one ink

Anything failing these is regenerated with a new seed and the SAME template.
"""

import glob, json, os, sys

import numpy as np
from PIL import Image

from palette import CANVAS, INKS

HERE = os.path.dirname(os.path.abspath(__file__))
PAL = np.array(list(INKS.values()))


def _idx(img):
    a = np.asarray(img.convert("RGB")).astype(int)
    return ((a[:, :, None, :] - PAL[None, None]) ** 2).sum(3).argmin(2)


def measure(img):
    idx = _idx(img)
    h, w = idx.shape
    counts = np.bincount(idx.ravel(), minlength=6) / idx.size

    # bands: how many times the dominant ink of a row changes going down
    row_mode = [np.bincount(r, minlength=6).argmax() for r in idx]
    bands = 1 + sum(1 for a, b in zip(row_mode, row_mode[1:]) if a != b)

    # horizon proxy: last row-change in the lower half
    changes = [y for y in range(h // 2, h) if row_mode[y] != row_mode[y - 1]]
    horizon = changes[-1] if changes else h - 1

    # gantry mass: dark ink concentrated in the left third, lower half
    left = idx[h // 2:, : w // 3]
    gantry = float((left == 0).mean())

    return {"bands": bands, "horizon": horizon, "gantry_left": round(gantry, 3),
            "dominant_ink_share": round(float(counts.max()), 3)}


def check(img):
    """Returns a list of failure strings; empty means the plate is usable."""
    m = measure(img)
    h = img.height
    bad = []
    if m["dominant_ink_share"] > 0.72:
        bad.append(f"collapsed: {m['dominant_ink_share']:.0%} of the plate is one ink")
    if m["bands"] < 4:
        bad.append(f"only {m['bands']} bands -- sky is not layered")
    # Lower bound only. The first version also rejected a horizon below 97% of
    # the height, which flagged three perfectly good plates whose ground simply
    # meets the bottom edge -- correct, since a band sits under it. The real
    # risk is the opposite: a horizon too HIGH means a sky-only plate with no
    # ground at all.
    if m["horizon"] < h * 0.55:
        bad.append(f"horizon at y={m['horizon']} is too high -- no ground band")
    if m["gantry_left"] < 0.04:
        bad.append("no gantry mass in the left third")
    return bad, m


if __name__ == "__main__":
    plates = sorted(glob.glob(os.path.join(HERE, "scenes", "*.png")))
    print(f"{'plate':32s} {'bands':>6s} {'horiz':>6s} {'gantry':>7s} {'domin':>6s}  verdict")
    horizons, ok = [], 0
    for p in plates:
        bad, m = check(Image.open(p))
        horizons.append(m["horizon"])
        ok += not bad
        print(f"{os.path.basename(p)[:32]:32s} {m['bands']:6d} {m['horizon']:6d} "
              f"{m['gantry_left']:7.3f} {m['dominant_ink_share']:6.2f}  "
              f"{'PASS' if not bad else 'FAIL: ' + '; '.join(bad)}")
    if horizons:
        print(f"\n{ok}/{len(plates)} pass · horizon stdev {np.std(horizons):.1f}px "
              f"(under ~30 means the composition is holding)")
