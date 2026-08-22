#!/usr/bin/env python3
"""
Spectra 6 preview + packer.

Takes any image (a painted rocket, a render, a photo) and shows you exactly what
the 7.3" E Ink Spectra 6 panel will do to it -- then writes the packed bytes the
ESP32 streams to the panel.

    python3 spectra6.py poster.png
    python3 spectra6.py poster.png --dither atkinson --saturation 2.5
    python3 spectra6.py poster.png --compare      # side-by-side original vs panel

Why this exists: you cannot eyeball whether an image survives a 6-ink panel.
Dithering is what buys tonal realism on a fixed palette -- the flat-vector
"silhouette" advice is only correct if you refuse to dither. Run your art
through this before committing to a direction.
"""
import argparse, sys
from PIL import Image, ImageEnhance
import numpy as np

# Measured-ish Spectra 6 ink values. NOT sRGB primaries -- the panel's gamut is
# closer to CMYK print, and "white" reflects only 35-45% (newsprint, not paper).
INKS = [
    ("black",  (26, 26, 24)),
    ("white",  (214, 211, 200)),
    ("red",    (168, 57, 47)),
    ("yellow", (212, 174, 42)),
    ("blue",   (53, 84, 138)),
    ("green",  (74, 117, 80)),
]
PAL = np.array([c for _, c in INKS], dtype=np.float64)

# Error-diffusion kernels: (dx, dy, weight) with the divisor folded in.
KERNELS = {
    # Diffuses 100% of error. Tuned for photographs -- best tonal accuracy,
    # but it speckles flat areas and softens hard type.
    "floyd": ([(1,0,7/16),(-1,1,3/16),(0,1,5/16),(1,1,1/16)], 1.0),
    # Diffuses only 75%. Crushes near-white to clean white and near-black to
    # solid black -> punchier, keeps type crisp. Best for poster art.
    "atkinson": ([(1,0,1/8),(2,0,1/8),(-1,1,1/8),(0,1,1/8),(1,1,1/8),(0,2,1/8)], 1.0),
    # Wider spread, less directional streaking on large smooth areas (skies).
    "sierra": ([(1,0,5/32),(2,0,3/32),(-2,1,2/32),(-1,1,4/32),(0,1,5/32),
                (1,1,4/32),(2,1,2/32),(-1,2,2/32),(0,2,3/32),(1,2,2/32)], 1.0),
}

def nearest(px):
    return int(np.argmin(((PAL - px) ** 2).sum(axis=1)))

def dither(img, kernel="atkinson"):
    """Error-diffusion quantize to the 6 inks. Returns (index_map, rgb_preview).

    Deliberately plain-Python arithmetic over flat lists rather than numpy per
    pixel. The obvious implementation calls np.argmin once per pixel to find
    the nearest ink -- 384,000 array allocations for one 800x480 panel, which
    cost 5.4 seconds and made the test suite slow enough to start skipping.
    With only six inks, an unrolled loop over six tuples beats numpy's
    per-call overhead by an order of magnitude.

    Error diffusion is inherently sequential -- each pixel's error feeds its
    neighbours -- so this cannot be vectorised the way the chroma key was.
    Output is bit-identical to the numpy version; there is a test.
    """
    a = np.asarray(img.convert("RGB"), dtype=np.float64)
    h, w, _ = a.shape
    # Flat per-channel lists: indexing a Python list is far cheaper than
    # indexing a numpy array one element at a time.
    R = a[:, :, 0].ravel().tolist()
    G = a[:, :, 1].ravel().tolist()
    B = a[:, :, 2].ravel().tolist()
    pal = [(float(c[0]), float(c[1]), float(c[2])) for c in PAL]
    idx = np.zeros(h * w, dtype=np.uint8)
    offs, _ = KERNELS[kernel]

    for y in range(h):
        row = y * w
        for x in range(w):
            i0 = row + x
            r, g, b = R[i0], G[i0], B[i0]
            best, bd = 0, 1e18
            for k in range(6):
                pr, pg, pb = pal[k]
                dr, dg, db = r - pr, g - pg, b - pb
                dist = dr * dr + dg * dg + db * db
                if dist < bd:
                    bd, best = dist, k
            idx[i0] = best
            pr, pg, pb = pal[best]
            er, eg, eb = r - pr, g - pg, b - pb
            for dx, dy, wt in offs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    R[j] += er * wt
                    G[j] += eg * wt
                    B[j] += eb * wt
    idx = idx.reshape(h, w)
    return idx, PAL[idx].astype(np.uint8)

def verify(img):
    """Colors in `img` that are not one of the six inks. Empty set == the panel
    will show this image EXACTLY as authored, with no dithering and no
    re-quantization by the driver.

    This is the gate the whole flat-poster direction rests on. Flat art built
    only from ink values is lossless here; a single stray color (an
    antialiased glyph edge, an interpolating resize) breaks that guarantee and
    the region around it fragments into dither noise on the wall.
    """
    allowed = {c for _, c in INKS}
    return {c for _, c in img.convert("RGB").getcolors(img.width * img.height) or []
            if c not in allowed}


def index_map(img):
    """Exact-ink image -> palette indices, no quantization. Raises if the image
    is not already legal, rather than silently snapping colors: a poster that
    needs snapping has a bug upstream and should be fixed there."""
    bad = verify(img)
    if bad:
        raise ValueError(f"image carries {len(bad)} off-ink colors; run verify() first")
    lut = {c: i for i, (_, c) in enumerate(INKS)}
    a = np.asarray(img.convert("RGB"))
    out = np.zeros(a.shape[:2], np.uint8)
    for c, i in lut.items():
        out[(a[:, :, 0] == c[0]) & (a[:, :, 1] == c[1]) & (a[:, :, 2] == c[2])] = i
    return out


def pack(idx):
    """4 bits/px, two pixels per byte -- the panel's wire format."""
    h, w = idx.shape
    if w % 2:
        idx = np.pad(idx, ((0,0),(0,1)))
        w += 1
    return (idx[:, 0::2] << 4 | idx[:, 1::2]).astype(np.uint8).tobytes()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("image")
    p.add_argument("--out", default=None)
    p.add_argument("--dither", choices=list(KERNELS), default="atkinson")
    p.add_argument("--saturation", type=float, default=2.5,
                   help="Pre-boost. The panel renders ~80%% of print saturation; "
                        "without this everything comes out washed out.")
    p.add_argument("--contrast", type=float, default=1.15)
    p.add_argument("--size", default="800x480")
    p.add_argument("--compare", action="store_true", help="write a side-by-side")
    p.add_argument("--bin", action="store_true", help="also write packed .bin")
    a = p.parse_args()

    W, H = (int(v) for v in a.size.lower().split("x"))
    src = Image.open(a.image).convert("RGB")
    # Cover-fit, then centre-crop: never letterbox art.
    s = max(W / src.width, H / src.height)
    src = src.resize((max(W,int(src.width*s)), max(H,int(src.height*s))), Image.LANCZOS)
    l, t = (src.width - W)//2, (src.height - H)//2
    src = src.crop((l, t, l + W, t + H))

    prepped = ImageEnhance.Contrast(
        ImageEnhance.Color(src).enhance(a.saturation)
    ).enhance(a.contrast)

    idx, rgb = dither(prepped, a.dither)
    panel = Image.fromarray(rgb)

    stem = a.out or a.image.rsplit(".", 1)[0]
    out = f"{stem}.panel.png"
    panel.save(out)
    print(f"panel preview -> {out}")

    if a.compare:
        c = Image.new("RGB", (W*2 + 24, H), (245,245,245))
        c.paste(src, (0,0)); c.paste(panel, (W+24,0))
        c.save(f"{stem}.compare.png"); print(f"comparison   -> {stem}.compare.png")
    if a.bin:
        b = pack(idx)
        open(f"{stem}.bin","wb").write(b)
        print(f"packed bytes -> {stem}.bin ({len(b):,} bytes)")

    used = np.bincount(idx.ravel(), minlength=6)
    print("\nink usage:")
    for (name,_), n in zip(INKS, used):
        print(f"  {name:<7} {100*n/idx.size:5.1f}%  {'#'*int(40*n/idx.size)}")
    if used[1] / idx.size > 0.55:
        print("\n  ! over half the panel is 'white' -- which is newsprint grey, not")
        print("    paper white. Expect this to read flat. Darken the composition.")

if __name__ == "__main__":
    sys.exit(main())
