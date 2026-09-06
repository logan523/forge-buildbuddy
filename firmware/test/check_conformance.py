#!/usr/bin/env python3
"""Diff the C renderer's scene region against the frozen goldens.

Python only decodes PNGs and compares bytes here -- it never renders. The
oracle is the committed file, not a live poster.py run, so this stays fast and
stops depending on Pillow's version, FreeType's version or raqm.
"""
import json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "docs" / "rocket-poster-kit"))
from PIL import Image
import scene as S

W, SCENE_H = 800, 336
KIT = Path(__file__).resolve().parents[2] / "docs" / "rocket-poster-kit"


def family_key(rec) -> str:
    """ingest.load_tonal's rule, which the firmware must apply identically."""
    return (rec.get("rocket_family") or "").strip().lower().replace(" ", "-")


def main() -> int:
    card, binary = Path(sys.argv[1]), sys.argv[2]
    recs = json.loads((KIT / "launch-samples.json").read_text())["samples"]
    man = json.loads((card / "manifest.json").read_text())

    ok = bad = skipped = 0
    for i, r in enumerate(recs):
        fam, key = family_key(r), S.plate_key(r)
        if not fam or fam not in man["vehicles"] or key not in man["plates"]:
            skipped += 1
            continue
        got = subprocess.run([binary, str(card), man["plates"][key], fam],
                             capture_output=True)
        if got.returncode != 0:
            print(f"  fixture {i:>2}: C exited {got.returncode} "
                  f"{got.stderr.decode()[:100]}")
            bad += 1
            continue
        want = (Image.open(KIT / "goldens" / f"{i:02d}.png").convert("RGB")
                .crop((0, 0, W, SCENE_H)).tobytes())
        if got.stdout == want:
            ok += 1
        else:
            n = sum(1 for a, b in zip(got.stdout, want) if a != b)
            print(f"  fixture {i:>2} {fam:<12} {n:>7,} bytes differ")
            bad += 1

    print(f"\n  C == golden scene region: {ok} ok · {bad} differ · "
          f"{skipped} skipped (no tonal asset)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
