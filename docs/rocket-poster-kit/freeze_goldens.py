#!/usr/bin/env python3
"""
Freeze the 24 expected frames as bytes.

The C renderer is diffed against THESE FILES, not against a live poster.py run.
That distinction is the whole point:

  A live oracle costs ~80 s of Python on top of a suite that already takes
  5m34s, and it depends on Pillow's version, FreeType's version, whether raqm
  is present, and a font being on disk. A gate that is both slow and
  environment-fragile gets skipped -- and a skipped oracle is how the C drifts
  silently. That is anti-pattern #1 reimplemented in firmware, where nobody
  can see it.

So: bytes on disk for the firmware test (milliseconds, no Python), and a
SEPARATE drift check that re-derives them from poster.py and fails loudly on
its own terms when Pillow moves. A dependency bump breaks the drift job, not
the firmware build.

    python3 freeze_goldens.py            # write goldens/
    python3 freeze_goldens.py --check    # re-derive and diff; exit 1 on drift
"""
import argparse, hashlib, json, sys
from pathlib import Path

import poster
from spectra6 import verify

KIT = Path(__file__).resolve().parent
OUT = KIT / "goldens"


def frames():
    recs = json.loads((KIT / "launch-samples.json").read_text())["samples"]
    for i, r in enumerate(recs):
        img = poster.render(r, previous=recs[i - 1] if i else None)
        off = verify(img)
        if off:
            raise SystemExit(f"fixture {i} renders {len(off)} off-ink colours; "
                             f"refusing to freeze an illegal golden")
        yield i, r, img


def digest(img) -> str:
    return hashlib.sha256(img.convert("RGB").tobytes()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="re-derive and compare; do not write")
    a = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    index, drift = {}, []
    for i, rec, img in frames():
        name = f"{i:02d}.png"
        d = digest(img)
        index[name] = {"sha256_16": d,
                       "rocket": rec.get("rocket"),
                       "destination": rec.get("destination")}
        path = OUT / name
        if a.check:
            if not path.exists():
                drift.append(f"{name}: missing")
            elif digest(__import__("PIL.Image", fromlist=["Image"]).open(path)) != d:
                drift.append(f"{name}: differs")
        else:
            img.save(path)

    ip = OUT / "index.json"
    if a.check:
        if not ip.exists():
            drift.append("index.json: missing")
        elif json.loads(ip.read_text()) != index:
            drift.append("index.json: differs")
        if drift:
            print("GOLDEN DRIFT -- poster.py no longer reproduces the frozen frames:")
            for d in drift:
                print(f"  {d}")
            print("\nThis is the DRIFT job, not the firmware gate. Something in the\n"
                  "rendering environment moved (Pillow, FreeType, raqm, the font) or\n"
                  "the renderer changed on purpose. If on purpose, re-freeze and say\n"
                  "so in the commit -- the C renderer is diffed against these bytes.")
            sys.exit(1)
        print(f"  {len(index)} goldens still reproduce exactly")
    else:
        ip.write_text(json.dumps(index, indent=1))
        total = sum((OUT / n).stat().st_size for n in index)
        print(f"  froze {len(index)} goldens, {total/1024:.0f} KB total -> {OUT}")


if __name__ == "__main__":
    main()
