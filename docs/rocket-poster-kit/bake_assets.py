#!/usr/bin/env python3
"""
Bake the card the frame reads.

The device does not render artwork. It blits layers baked here and draws type.
Everything expensive -- LANCZOS over a 1036x5228 source, a numpy block-argmin,
ImageEnhance.Contrast, np.percentile, MaxFilter -- happens once, on a laptop,
and never on a 240 MHz S3.

WHY LAYERS AND NOT COMPOSITES. Baking scene+vehicle composites needs the full
cross product (19 plates x 13 families = 247 files, ~32 MB) and turns "add a
vehicle family" into re-baking 19 files. Layers are 45 files and ~4 MB, and a
new family is one bake. Proven pixel-identical to `poster._vehicle()` on 8/8
tonal families before this was written.

WHY .rkt AND NOT .png. The stock firmware's album rotation enumerates png, bmp
and epdgz files on the card and paints one every 12 hours. Baked art on that
card would land on the wall as a rocket-less sky. The rocket fork disables the
cron, but the extension list is one strcasecmp from regrowing, so the files also
do not look like pictures.

    bake_assets.py --out /Volumes/ROCKET            write the card
    bake_assets.py --out /Volumes/ROCKET --plan     list files + bytes, write nothing
    bake_assets.py --out /Volumes/ROCKET --verify   re-read and check what was written
    bake_assets.py --out ./card --only falcon       one family, for iteration
"""

import argparse, json, os, struct, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image

import ingest, poster
import typeset as T
from palette import INKS, INK_ORDER, NOMINAL

# Every glyph the panel can ever be asked to draw. Deliberately wider than the
# 44 the fixtures happen to use: LL2 returns arbitrary mission and vehicle
# names, and a glyph with no atlas entry is a hole in a wall poster. Printable
# ASCII plus the middot the band uses as a separator. Anything outside this is
# dropped by the device with a counted warning, never guessed at.
CHARSET = [chr(c) for c in range(32, 127)] + ["\u00b7"]

# Exactly the (face, size) pairs the fit ladders in poster.py:_band_text can
# reach. Derived, not listed by hand: fit_wrap steps down by 2 from pt(23) to
# pt(10); fit_tracked picks from fixed size lists.
def atlas_combos():
    pt = poster.pt
    xc = list(range(pt(23), pt(10) - 1, -2))
    med = sorted({pt(v) for v in (8, 7.5, 7, 6.5, 6, 5.5, 5)}, reverse=True)
    return [(T.XCONDENSED, z) for z in xc] + [(T.MEDIUM, z) for z in med]

# Bumped whenever the on-card layout changes in a way old firmware cannot read.
# The firmware refuses a version it does not know rather than misreading one.
FORMAT_VERSION = 1

MAGIC = b"RKT1"
KIND_PLATE, KIND_BODY, KIND_MASK, KIND_FLAG, KIND_ATLAS = 0, 1, 2, 3, 4
HEADER = 16  # magic4 kind1 w2 h2 bpp1 flags1 reserved5

# Assets are found relative to THIS FILE, never the working directory. With
# CWD-relative paths, importing this module from anywhere else silently built
# an EMPTY card -- and verify_card called that "0/0 present and well-formed".
KIT = Path(__file__).resolve().parent

W, H, BAND_H = poster.W, poster.H, poster.BAND_H
SCENE_H = H - BAND_H
INDEX_OF = {INKS[n]: i for i, n in enumerate(INK_ORDER)}


# ---------------------------------------------------------------- encoding

def _header(kind: int, w: int, h: int, bpp: int, flags: int = 0) -> bytes:
    # Little-endian fixed-width, byte-wise on the far side. Xtensa faults on
    # unaligned 32-bit loads that x86-64 absorbs, so the firmware must never
    # cast a struct over this.
    return MAGIC + struct.pack("<BHHBB5x", kind, w, h, bpp, flags)


def pack_indexed(img: Image.Image) -> bytes:
    """RGB exact-ink image -> 4bpp, two pixels per byte, INK_ORDER indices.

    Raises on any off-ink pixel rather than snapping. A pixel we cannot name
    is a bug upstream, and the device's only fallback is silent white.
    """
    px = list(img.convert("RGB").get_flattened_data())
    try:
        idx = [INDEX_OF[p] for p in px]
    except KeyError as e:
        raise ValueError(f"off-ink pixel {e.args[0]} — bake refuses to guess") from None
    w = img.width
    out = bytearray()
    for y in range(img.height):
        row = idx[y * w:(y + 1) * w]
        if w % 2:
            row = row + [0]
        out += bytes((row[i] << 4) | row[i + 1] for i in range(0, len(row), 2))
    return bytes(out)


def pack_mask(img: Image.Image) -> bytes:
    """1bpp, MSB first. Any non-zero sample is set."""
    px = list(img.convert("L").get_flattened_data())
    w = img.width
    out = bytearray()
    for y in range(img.height):
        row = px[y * w:(y + 1) * w]
        for i in range(0, w, 8):
            b = 0
            for j, v in enumerate(row[i:i + 8]):
                if v:
                    b |= 0x80 >> j
            out.append(b)
    return bytes(out)


def _glyph(ch, fnt):
    """One glyph, rendered through the SAME hard threshold the poster uses,
    plus its offset from the pen. Proven equal to PIL drawing the string
    directly -- which only holds because the pen is integer now."""
    from PIL import ImageDraw
    pad = 160
    m = Image.new("L", (pad * 2, pad * 2), 0)
    ImageDraw.Draw(m).text((pad, pad), ch, font=fnt, fill=255)
    hard = m.point(lambda v: 255 if v > 127 else 0)
    bb = hard.getbbox()
    if bb is None:
        return None, 0, 0
    return hard.crop(bb), bb[0] - pad, bb[1] - pad


def bake_atlas(face, size):
    """One (face, size) atlas: metrics table + 1bpp bitmaps."""
    from PIL import ImageDraw
    fnt = T.font(face, size)
    probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    entries, blob = [], bytearray()
    for ch in CHARSET:
        bmp, ox, oy = _glyph(ch, fnt)
        adv = T.advance(probe, ch, fnt)
        if bmp is None:
            entries.append((ord(ch), adv, 0, 0, 0, 0, 0))
            continue
        w, h = bmp.size
        if w > 255 or h > 255 or adv > 255 or not (-128 <= ox <= 127) or not (-128 <= oy <= 127):
            raise ValueError(f"glyph {ch!r} at {face}/{size} exceeds the byte fields "
                             f"(adv={adv} {w}x{h} off={ox},{oy})")
        entries.append((ord(ch), adv, w, h, ox, oy, len(blob)))
        blob += pack_mask(bmp)

    body = bytearray()
    body += struct.pack("<HHH", len(entries), face, size)
    for cp, adv, w, h, ox, oy, off in entries:
        # 12 bytes, with an explicit pad byte before the 4-byte offset.
        # "<HBBBbbI" packs to ELEVEN (no implicit padding under "<"), which put
        # the C reader half a field out from the second glyph onward and made
        # nearly every lookup miss. Keep this in step with
        # RKT_ATLAS_ENTRY_BYTES.
        body += struct.pack("<HBBBbbxI", cp, adv, w, h, ox, oy, off)
    body += blob
    return _header(KIND_ATLAS, 0xFFFF, 0xFFFF, 1) + bytes(body)


# ---------------------------------------------------------------- the assets

def plates() -> dict[str, Image.Image]:
    """Scene plates, already 800x336 and already snapped. No resampling here."""
    out = {}
    for p in sorted((KIT / "scenes").glob("*.png")):
        im = Image.open(p).convert("RGB")
        if im.size != (W, SCENE_H):
            raise ValueError(
                f"{p.name} is {im.size}, expected {(W, SCENE_H)}.\n"
                f"  Cause: the scene box is fixed at band='bottom'.\n"
                f"  Fix:   regenerate with scene.py, do not resize by hand.")
        out[p.stem] = im
    return out


def vehicle_layers(fam: str) -> dict | None:
    """The three layers + one bit that `poster._vehicle()` derives at render
    time. Depends only on the family and the scene height -- palette- and
    record-independent, which is what makes per-family baking sound."""
    rec = {"rocket_family": fam, "destination": "Low Earth Orbit", "country": "USA"}
    veh, _ = poster.vehicle_layer(rec, SCENE_H + 40)
    if veh is None:
        return None
    v = poster.shrink_keeping_lines(veh, SCENE_H + 30)
    return {
        "body": poster.posterize_vehicle(v),
        "body_mask": v.split()[3].point(lambda p: 255 if p > 140 else 0),
        "key_mask": poster.outline_mask(v),
        "dark": bool(poster._is_dark_vehicle(v)),
        "size": v.size,
    }


def bake_flags():
    """All 28 flags as 40x25 indexed layers.

    flag.py is a THIRD rasteriser -- d.rectangle on float fractions, d.line
    with a thick-join for GBR's diagonals, d.ellipse for nine of them. Porting
    PIL's ellipse scanline fill and thick-line joins to C is the same promise
    that was correctly refused for LANCZOS, and the flag lands inside the type
    band so it cannot ride the scene composite. 28 x 1000 px is nothing; bake
    it and delete the whole problem.
    """
    from PIL import ImageDraw
    import flag as F
    # poster.py calls flag.draw(d, code, 30, 436, 40, 25) and the border is a
    # d.rectangle whose corners PIL treats as INCLUSIVE -- so it lands on
    # x+40 and y+25 as well, covering 41x26 pixels, not 40x25. Baking the
    # smaller box left a one-pixel black edge missing on every frame.
    W_, H_ = 41, 26
    out = {}
    for code in sorted(F.FLAGS):
        im = Image.new("RGB", (W_, H_), INKS["white"])
        F.draw(ImageDraw.Draw(im), code, 0, 0, 40, 25)
        out[code] = im
    return out


def tonal_families() -> list[str]:
    return sorted(p.stem for p in (KIT / "vehicles-tonal").glob("*.png"))


# ---------------------------------------------------------------- the card

def build(only: str | None) -> list[tuple[str, bytes]]:
    """Everything that goes on the card, as (relative path, bytes)."""
    files: list[tuple[str, bytes]] = []
    man: dict = {"format_version": FORMAT_VERSION, "canvas": [W, H],
                 "scene_h": SCENE_H, "band_h": BAND_H,
                 "ink_order": INK_ORDER,
                 "nominal": {n: list(NOMINAL[n]) for n in INK_ORDER},
                 "plates": {}, "vehicles": {}}

    if not only:
        for name, im in plates().items():
            path = f"plates/{name}.rkt"
            files.append((path, _header(KIND_PLATE, im.width, im.height, 4) + pack_indexed(im)))
            man["plates"][name] = path

    fams = tonal_families()
    if only:
        fams = [f for f in fams if f.lower() == only.lower()]
        if not fams:
            raise SystemExit(
                f"--only {only!r} matched no family.\n"
                f"  Cause: vehicles-tonal/ has no such asset.\n"
                f"  Fix:   one of {', '.join(tonal_families())}")

    for fam in fams:
        L = vehicle_layers(fam)
        if L is None:
            continue
        w, h = L["size"]
        base = f"vehicles/{fam}"
        files += [
            (f"{base}.body.rkt", _header(KIND_BODY, w, h, 4, 1 if L["dark"] else 0)
                                 + pack_indexed(L["body"])),
            (f"{base}.body.msk", _header(KIND_MASK, w, h, 1) + pack_mask(L["body_mask"])),
            (f"{base}.key.msk",  _header(KIND_MASK, w, h, 1) + pack_mask(L["key_mask"])),
        ]
        man["vehicles"][fam] = {"w": w, "h": h, "dark": L["dark"],
                                "body": f"{base}.body.rkt",
                                "body_mask": f"{base}.body.msk",
                                "key_mask": f"{base}.key.msk"}

    # The device must not reimplement scene.mood_for(): it is an ordered
    # substring match over MOODS, and a second copy in C would drift silently
    # the first time a mood is added. Ship the ordered keys and let the
    # firmware do "first key that is a substring of the lowercased
    # destination", which is the whole rule.
    import scene as _S
    man["mood_keys"] = list(_S.MOODS.keys())
    man["style_version"] = _S.STYLE_VERSION
    man["plate_key_rule"] = ("first mood_key that is a substring of "
                             "lower(destination), else 'unknown'; then "
                             "'{mood}-{lower(country) or xxx}-v{style_version}'")
    man["family_key_rule"] = "lower(rocket_family) with ' ' -> '-'"

    man["flags"] = {}
    if not only:
        for code, im in bake_flags().items():
            path = f"flags/{code}.rkt"
            files.append((path, _header(KIND_FLAG, im.width, im.height, 4)
                                + pack_indexed(im)))
            man["flags"][code] = path

    man["atlases"] = {}
    if not only:
        for face, size in atlas_combos():
            path = f"atlas/{face}_{size}.atl"
            files.append((path, bake_atlas(face, size)))
            man["atlases"][f"{face}_{size}"] = path
        man["charset"] = "".join(CHARSET)

    files.append(("manifest.json", json.dumps(man, indent=1).encode()))
    return files


# ---------------------------------------------------------------- guards

def check_destination(out: Path, force: bool) -> None:
    """The two ways a developer loses an afternoon here."""
    # The removable check runs FIRST and regardless of existence. An earlier
    # version returned early when --out did not exist yet, which skipped the
    # guard for precisely the case it protects against: a mistyped path that
    # gets created on the spot.
    removable = str(out.resolve()).startswith("/Volumes/")
    if not removable and not force:
        raise SystemExit(
            f"{out} is not a removable volume.\n"
            f"  Cause: refusing to scatter asset files into a normal directory by accident.\n"
            f"  Fix:   pass --force if you meant a staging directory.")
    if not out.exists():
        return
    try:
        fs = subprocess.run(["diskutil", "info", "-plist", str(out)],
                            capture_output=True, text=True, timeout=10)
        blob = fs.stdout
    except Exception:
        blob = ""

    if "exfat" in blob.lower() or "apfs" in blob.lower():
        kind = "exFAT" if "exfat" in blob.lower() else "APFS"
        raise SystemExit(
            f"{out} is {kind}; the frame only mounts FAT32.\n"
            f"  Cause: macOS formats new and large cards as exFAT or APFS by default.\n"
            f"  Fix:   erase the card in Disk Utility as 'MS-DOS (FAT)', then re-run.")



def write_card(out: Path, files: list[tuple[str, bytes]]) -> None:
    """Stage, then rename. A card yanked mid-write leaves the previous
    manifest intact rather than a truncated one the firmware would reject."""
    import shutil
    stage = out / ".rocket.tmp"
    # rmtree, not a hand-rolled walk. macOS drops AppleDouble "._name" files
    # into directories on a FAT volume as you write them, so a reverse-sorted
    # rglob + rmdir hits both a vanished path and a non-empty directory. It
    # crashed AFTER writing the card correctly, which is the worst shape of
    # bug: the work is done and the tool reports failure.
    shutil.rmtree(stage, ignore_errors=True)
    for rel, blob in files:
        dst = stage / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)

    for rel, _ in files:
        final = out / rel
        final.parent.mkdir(parents=True, exist_ok=True)
        if final.exists():
            final.unlink()
        (stage / rel).replace(final)
    shutil.rmtree(stage, ignore_errors=True)


def verify_card(out: Path) -> int:
    """Re-read what is actually on the card. Catches a full card, a bad write,
    and a manifest that references a file nobody baked."""
    mp = out / "manifest.json"
    if not mp.exists():
        raise SystemExit(f"No manifest.json at {out}. Nothing was baked here.")
    man = json.loads(mp.read_text())
    if man.get("format_version") != FORMAT_VERSION:
        raise SystemExit(
            f"Card is format_version {man.get('format_version')}, this tool writes "
            f"{FORMAT_VERSION}.\n  Fix: re-bake the card.")

    if not man.get("plates") or not man.get("vehicles"):
        raise SystemExit(
            f"Card at {out} has {len(man.get('plates', {}))} plates and "
            f"{len(man.get('vehicles', {}))} vehicles.\n"
            f"  Cause: an empty bake. Nothing would render.\n"
            f"  Fix:   re-run the bake from a checkout with scenes/ and "
            f"vehicles-tonal/ populated.")

    bad = 0
    refs = (list(man["plates"].values()) + list(man.get("atlases", {}).values())
            + list(man.get("flags", {}).values()))
    for v in man["vehicles"].values():
        refs += [v["body"], v["body_mask"], v["key_mask"]]
    if not man.get("atlases"):
        raise SystemExit(
            f"Card at {out} has no glyph atlases.\n"
            f"  Cause: an atlas-less bake. The poster would render with no text.\n"
            f"  Fix:   re-run without --only, which skips atlases by design.")
    for rel in refs:
        f = out / rel
        if not f.exists():
            print(f"  MISSING  {rel}"); bad += 1; continue
        head = f.read_bytes()[:4]
        if head != MAGIC:
            print(f"  BAD MAGIC {rel} ({head!r})"); bad += 1
    print(f"  {len(refs) - bad}/{len(refs)} layer files present and well-formed")
    return bad


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, type=Path,
                    help="card mount point. Required, no default -- this tool "
                         "writes ~45 files and must never guess where.")
    ap.add_argument("--plan", action="store_true", help="list what would be written, write nothing")
    ap.add_argument("--verify", action="store_true", help="re-read the card and check it")
    ap.add_argument("--only", metavar="FAMILY", help="bake one vehicle family, for iteration")
    ap.add_argument("--force", action="store_true", help="allow a non-removable --out")
    a = ap.parse_args()

    if a.verify:
        sys.exit(1 if verify_card(a.out) else 0)

    files = build(a.only)
    total = sum(len(b) for _, b in files)

    if a.plan:
        for rel, blob in files:
            print(f"  {len(blob):>9,}  {rel}")
        print(f"  {'-'*9}")
        print(f"  {total:>9,}  {len(files)} files ({total/1024/1024:.2f} MB)")
        return

    check_destination(a.out, a.force)
    a.out.mkdir(parents=True, exist_ok=True)
    write_card(a.out, files)
    print(f"  wrote {len(files)} files, {total/1024/1024:.2f} MB to {a.out}")
    print(f"  verify with: {sys.argv[0]} --out {a.out} --verify")


if __name__ == "__main__":
    main()
