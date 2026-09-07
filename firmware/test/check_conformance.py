#!/usr/bin/env python3
"""Diff the C renderer's FULL frame against the frozen goldens.

Python decodes PNGs and compares bytes; it never renders. The oracle is the
committed file, not a live poster.py run, so this stays fast and stops
depending on Pillow's version, FreeType's version or raqm.

Skips fixtures whose vehicle family has no tonal asset -- those take the
parametric fallback, which is not ported to C yet.
"""
import json, subprocess, tempfile, os, sys
from pathlib import Path
from PIL import Image
KIT = Path("/Users/logansilver/buildbuddy/docs/rocket-poster-kit")
sys.path.insert(0, str(KIT))
import scene as S, poster
CARD = Path("/tmp/rktcard")
recs = json.loads((KIT/"launch-samples.json").read_text())["samples"]
man  = json.loads((CARD/"manifest.json").read_text())
W, H = 800, 480
norm = lambda f: (f or "").strip().lower().replace(" ", "-")
al = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
al.write("\n".join(man["atlases"].values())); al.close()
ok = bad = skipped = 0; worst = None
for i, r in enumerate(recs):
    fam, key = norm(r.get("rocket_family")), S.plate_key(r)
    if not fam or fam not in man["vehicles"] or key not in man["plates"]:
        skipped += 1; continue
    prev = recs[i-1] if i else None
    prev_line = ""
    if prev:
        prev_line = "LAST · " + " · ".join(x for x in [
            (prev.get("rocket_short") or prev.get("rocket") or "").upper(),
            poster.fmt_when(prev.get("t0_utc")).split(" · ")[0]] if x)
    line2 = "  ·  ".join(x for x in [r.get("mission"), r.get("rocket")] if x).upper()
    who = " · ".join(x for x in [r.get("provider"),
                                 poster._short_site(r.get("site"))] if x).upper()
    out = subprocess.run(["/tmp/rocket_conformance", str(CARD), man["plates"][key], fam,
        al.name, (r.get("country") or "").upper(), (r.get("destination") or "UNKNOWN").upper(),
        line2, r.get("t0_utc") or "", prev_line, who], capture_output=True)
    if len(out.stdout) != W*H*3:
        print(f"  fixture {i}: no frame  {out.stderr.decode()[:80]}"); bad += 1; continue
    want = Image.open(KIT/"goldens"/f"{i:02d}.png").convert("RGB").tobytes()
    if out.stdout == want: ok += 1
    else:
        d = sum(1 for a,b in zip(out.stdout,want) if a!=b)
        print(f"  fixture {i:>2} {fam:<11} {d:>8,} bytes differ ({100*d/len(want):.3f}%)")
        if worst is None: worst = (i, out.stdout)
        bad += 1
os.unlink(al.name)
if worst: Image.frombytes("RGB",(W,H),worst[1]).save("/tmp/_c_frame.png")
print(f"\n  FULL FRAME: {ok} ok · {bad} differ · {skipped} skipped")
raise SystemExit(1 if bad else 0)
import json, subprocess, tempfile, os, sys
from pathlib import Path
from PIL import Image
KIT = Path("/Users/logansilver/buildbuddy/docs/rocket-poster-kit")
sys.path.insert(0, str(KIT))
import scene as S, poster
CARD = Path("/tmp/rktcard")
recs = json.loads((KIT/"launch-samples.json").read_text())["samples"]
man  = json.loads((CARD/"manifest.json").read_text())
W, H = 800, 480
norm = lambda f: (f or "").strip().lower().replace(" ", "-")
al = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
al.write("\n".join(man["atlases"].values())); al.close()
ok = bad = skipped = 0; worst = None
for i, r in enumerate(recs):
    fam, key = norm(r.get("rocket_family")), S.plate_key(r)
    if not fam or fam not in man["vehicles"] or key not in man["plates"]:
        skipped += 1; continue
    prev = recs[i-1] if i else None
    prev_line = ""
    if prev:
        prev_line = "LAST · " + " · ".join(x for x in [
            (prev.get("rocket_short") or prev.get("rocket") or "").upper(),
            poster.fmt_when(prev.get("t0_utc")).split(" · ")[0]] if x)
    line2 = "  ·  ".join(x for x in [r.get("mission"), r.get("rocket")] if x).upper()
    who = " · ".join(x for x in [r.get("provider"),
                                 poster._short_site(r.get("site"))] if x).upper()
    out = subprocess.run(["/tmp/rocket_conformance", str(CARD), man["plates"][key], fam,
        al.name, (r.get("country") or "").upper(), (r.get("destination") or "UNKNOWN").upper(),
        line2, r.get("t0_utc") or "", prev_line, who], capture_output=True)
    if len(out.stdout) != W*H*3:
        print(f"  fixture {i}: no frame  {out.stderr.decode()[:80]}"); bad += 1; continue
    want = Image.open(KIT/"goldens"/f"{i:02d}.png").convert("RGB").tobytes()
    if out.stdout == want: ok += 1
    else:
        d = sum(1 for a,b in zip(out.stdout,want) if a!=b)
        print(f"  fixture {i:>2} {fam:<11} {d:>8,} bytes differ ({100*d/len(want):.3f}%)")
        if worst is None: worst = (i, out.stdout)
        bad += 1
os.unlink(al.name)
if worst: Image.frombytes("RGB",(W,H),worst[1]).save("/tmp/_c_frame.png")
print(f"\n  FULL FRAME: {ok} ok · {bad} differ · {skipped} skipped")
raise SystemExit(1 if bad else 0)
