#!/usr/bin/env python3
"""
Export a finished poster as the 24-bit BMP the PhotoPainter firmware reads.

The panel is fed from a microSD card, not over the wire: FAT32, a `pic/` folder
in the root (`06_user_Foundation_img/` on the ESP32-S3 build), 24-bit
uncompressed BMP at exactly 800x480.

The load-bearing step is the palette swap. We design and quantize against
MEASURED ink values, because that is what the panel really reflects and what
makes the nearest-ink decision honest. But the firmware's BMP reader compares
each pixel against six EXACT nominal triples, with no else clause and with its
`color` variable declared outside the pixel loop -- so any pixel that matches
none of them inherits the previous pixel's colour and smears horizontally.
Shipping measured values would have missed all six and produced coloured
streaks across every row.

    python3 export_bmp.py next-launch.png --out pic/001.bmp
"""

import argparse, os

import numpy as np
from PIL import Image

from palette import CANVAS, INKS, MEASURED_TO_NOMINAL, NOMINAL


def to_panel_bmp(img):
    """Measured-ink RGB -> nominal-ink RGB, and assert nothing is left over."""
    rgb = img.convert("RGB")
    if rgb.size != CANVAS:
        raise ValueError(f"panel expects {CANVAS[0]}x{CANVAS[1]}, got {rgb.size}")
    a = np.asarray(rgb)
    out = np.zeros_like(a)
    seen = np.zeros(a.shape[:2], bool)
    for measured, nominal in MEASURED_TO_NOMINAL.items():
        m = (a[:, :, 0] == measured[0]) & (a[:, :, 1] == measured[1]) & (a[:, :, 2] == measured[2])
        out[m] = nominal
        seen |= m
    if not seen.all():
        stray = {tuple(c) for c in a[~seen].reshape(-1, 3)[:5]}
        raise ValueError(
            f"{(~seen).sum()} pixels are not measured inks, e.g. {stray}. "
            "The firmware would smear these across the row -- fix upstream.")
    return Image.fromarray(out, "RGB")


def verify_bmp(path):
    """Re-read the written file and prove every pixel is a nominal ink. Cheap
    insurance against a save-time colour conversion undoing the whole thing."""
    a = np.asarray(Image.open(path).convert("RGB"))
    allowed = set(NOMINAL.values())
    used = {tuple(c) for c in np.unique(a.reshape(-1, 3), axis=0)}
    return used - allowed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out")
    a = ap.parse_args()
    src = Image.open(a.image)
    out = a.out or a.image.rsplit(".", 1)[0] + ".bmp"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    to_panel_bmp(src).save(out, "BMP")          # Pillow writes 24-bit uncompressed
    bad = verify_bmp(out)
    size = os.path.getsize(out)
    print(f"{out}  {size:,} bytes  {'OK' if not bad else f'STRAY {bad}'}")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
