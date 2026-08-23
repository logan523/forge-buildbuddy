#!/usr/bin/env python3
"""
The generated background: a flat travel-poster launch scene.

This is the one layer the deterministic renderer never had. Everything else on
the poster stays fixed -- the rocket is a committed asset, the type is real
text, the palette is enforced -- and only the scene behind them is generated.
That split is deliberate: an unconstrained "draw the whole poster" system
eventually malforms the vehicle, invents lettering, or loses the type band.
Here the model is only ever asked for sky, ground and silhouettes.

Two things make it cheap and consistent:

* **Plates are cached per (destination, country).** Destinations repeat
  constantly -- 9 of the 24 sample records go to Low Earth Orbit -- so most
  launches reuse a plate that already exists and cost nothing. Same
  amortization that made per-family rocket assets worth generating.
* **Plates are snapped to the six inks with NO dithering.** The art is already
  flat bands of solid colour, which is exactly the case that quantizes
  losslessly; diffusing error across it would manufacture the speckle this kit
  spent several rounds removing.
"""

import argparse, hashlib, json, os, subprocess, sys, urllib.request

import numpy as np
from PIL import Image

from palette import CANVAS, INKS

HERE = os.path.dirname(os.path.abspath(__file__))
PLATES = os.path.join(HERE, "scenes")
RAW = os.path.join(PLATES, "raw")
MANIFEST = os.path.join(PLATES, "manifest.json")
MODEL = "flux_2"
# The plate every other plate is measured and conditioned against. Uploaded
# once; see README for how to re-establish it if the style version changes.
STYLE_REF = os.environ.get("SCENE_STYLE_REF", "039b7a30-4ff9-428a-afb9-080c2479eb3d")
STYLE_VERSION = 2          # bump to invalidate every cached plate at once

W, H = CANVAS

# The scene occupies the top of the frame; the type band is painted over the
# bottom deterministically. The model is told to leave that region plain, but
# it is never TRUSTED to -- the band is drawn regardless.
SCENE_H = 336

# Fixed prompt schema. Never free-form: the launch record selects a mood, and
# the illustration language is identical in every branch.
STYLE = (
    "A vintage 1930s Swiss alpine travel poster, restyled for spaceflight. "
    "Flat lithographic illustration, hard-edged blocks of solid colour, no "
    "gradients, no photorealism, no texture, no shading. Bold simplified "
    "silhouettes, compressed perspective, screen-printed poster finish.")

FRAMING = (
    "IMPORTANT: the CENTRE-RIGHT of the frame is EMPTY SKY containing nothing. "
    "The BOTTOM FIFTH is a plain flat band of one solid colour containing "
    "nothing. No rocket, no spacecraft, no text, no lettering, no numbers, no "
    "people, no logos, no border, no frame, no margin -- the illustration runs "
    "to all four edges.")

# Mood by destination -- MOTIF ONLY, never luminance.
#
# This is the correction that made the series work. The first version let the
# mood change how light or dark the plate was: "night launch, deep dark sky"
# and "cold morning, pale sky". Measured across seven plates that produced a
# palette distance of 1.03 and three unusable results -- a black slab, a 96%
# blank, and a rust desert that snapped to green.
#
# The cause was not the model's style drifting. It was this palette. Six inks
# with no greys and no dark blue means a dark sky has nowhere to land but solid
# black, and a pale sky nowhere but solid white. Luminance is the one dimension
# these inks cannot express, so the prompt must not ask it to vary.
#
# Every mood now shares ONE tonal recipe -- dark band top, saturated mid bands,
# light band above the horizon, dark ground -- and differs only in its motif.
# Night is told by a crescent moon against a BLUE sky, not by darkness.
TONAL_RECIPE = (
    "TONAL STRUCTURE, identical in every image: a narrow DARK band across the "
    "very top, then two or three SATURATED mid-tone sky bands, then a LIGHT "
    "CREAM band just above the horizon, then DARK ground silhouettes along the "
    "bottom. Never an all-dark image, never an all-pale image, never an empty "
    "one -- always this same light-to-dark banding.")

MOODS = {
    "low earth":       "a large pale sun disc at the horizon, warm mustard and brick-red sky bands",
    "sun-synchronous": "a low sun disc, cool green and cream sky bands, a distant flat ridgeline",
    # Polar had been sharing sun-synchronous's motif verbatim, and inherited
    # its washed-out result. Its own now, asking explicitly for saturated
    # bands rather than "cool" ones, which the generator reads as pale.
    "polar":           "a low sun disc, THREE strongly saturated sky bands in DEEP BLUE, FOREST GREEN and BRICK RED, a narrow cream band at the horizon, and a jagged dark ridgeline",
    "geostationary":   "a high sun disc, mustard and cream sky bands, flat palm silhouettes",
    "medium earth":    "a small high sun, blue and cream sky bands, simplified flat plains",
    "lunar":           "a large pale CRESCENT MOON disc low over the horizon, deep BLUE sky bands with a scatter of cream stars",
    "mars":            "a small pale sun, brick-RED and mustard sky bands, a flat rocky ridgeline",
    "sun-earth l2":    "a small pale moon, deep BLUE sky bands with a scatter of cream stars",
    "suborbital":      "a large sun disc, mustard sky bands, a wide flat desert plain",
    "unknown":         "a pale sun disc, mustard and cream sky bands, a flat plain",
}
SUBJECT = ("A LAUNCH PAD LANDSCAPE with no rocket on it: simplified geometric "
           "gantry and service towers standing at the LEFT edge, flat layered "
           "sky bands, and a graphic sun or moon disc.")


def mood_for(destination):
    d = (destination or "").strip().lower()
    for k, v in MOODS.items():
        if k in d:
            return k, v
    return "unknown", MOODS["unknown"]


def plate_key(rec):
    mood, _ = mood_for(rec.get("destination"))
    return f"{mood}-{(rec.get('country') or 'xxx').lower()}-v{STYLE_VERSION}"


def prompt_for(rec):
    _, mood = mood_for(rec.get("destination"))
    return f"{STYLE} {SUBJECT} {TONAL_RECIPE} Scene motif: {mood}. {FRAMING}"


def trim_border(img, tol=18):
    """Models keep adding a poster margin no matter how firmly the prompt says
    not to. Detect it by growing inward while the row/column stays close to
    the corner colour, rather than cropping a guessed percentage."""
    a = np.asarray(img.convert("RGB")).astype(int)
    h, w, _ = a.shape
    corner = a[2, 2]

    def uniform(line):
        return np.abs(line - corner).max() < tol

    top = 0
    while top < h // 4 and uniform(a[top]):
        top += 1
    bot = h - 1
    while bot > h * 3 // 4 and uniform(a[bot]):
        bot -= 1
    left = 0
    while left < w // 4 and uniform(a[:, left]):
        left += 1
    right = w - 1
    while right > w * 3 // 4 and uniform(a[:, right]):
        right -= 1
    if right - left < w // 2 or bot - top < h // 2:
        return img                      # nothing convincing found; leave it
    return img.crop((left, top, right + 1, bot + 1))


def snap_to_inks(img):
    """Nearest ink per pixel, NO error diffusion.

    The art is already flat fields of solid colour -- the one case that
    quantizes losslessly. Diffusing error across it would manufacture exactly
    the speckle this kit spent several rounds removing from the vehicle.
    """
    a = np.asarray(img.convert("RGB")).astype(int)
    pal = np.array(list(INKS.values()))
    d = ((a[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(axis=3)
    return Image.fromarray(pal[d.argmin(axis=2)].astype(np.uint8), "RGB")


def ingest_plate(src, key, prompt=None):
    """Raw generation -> a panel-legal plate, cached under `key`."""
    img = trim_border(Image.open(src))
    s = max(W / img.width, SCENE_H / img.height)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))),
                     Image.LANCZOS)
    l, t = (img.width - W) // 2, 0            # keep the top: sky, not ground
    img = snap_to_inks(img.crop((l, t, l + W, t + SCENE_H)))
    os.makedirs(PLATES, exist_ok=True)
    out = os.path.join(PLATES, f"{key}.png")
    img.save(out)
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    man[key] = {"file": f"{key}.png", "model": MODEL, "prompt": prompt,
                "style_version": STYLE_VERSION,
                "source": os.path.basename(src),
                "source_sha256": hashlib.sha256(open(src, "rb").read()).hexdigest()[:16]}
    json.dump(man, open(MANIFEST, "w"), indent=1, sort_keys=True)
    return out


def load(rec):
    """Cached plate for this record, or None. Callers fall back to the flat
    field, so a missing plate is a lower-fidelity poster, never a failure."""
    p = os.path.join(PLATES, f"{plate_key(rec)}.png")
    return Image.open(p).convert("RGB") if os.path.exists(p) else None


def generate(rec, force=False):
    """One API call, only when the plate is genuinely missing."""
    key = plate_key(rec)
    if not force and load(rec) is not None:
        return None
    prompt = prompt_for(rec)
    cmd = ["higgsfield", "generate", "create", MODEL,
           "--aspect_ratio", "16:9", "--resolution", "2k", "--wait"]
    if STYLE_REF:
        cmd += ["--image-references", STYLE_REF]
    cmd += ["--prompt", prompt]
    r = subprocess.run(cmd, capture_output=True, text=True)
    url = next((l.strip() for l in reversed(r.stdout.splitlines())
                if l.strip().startswith("http")), None)
    if not url:
        raise RuntimeError(f"generation failed: {r.stdout[-300:]}{r.stderr[-300:]}")
    os.makedirs(RAW, exist_ok=True)
    raw = os.path.join(RAW, f"{key}.png")
    urllib.request.urlretrieve(url, raw)
    return ingest_plate(raw, key, prompt)


def generate_until_good(rec, attempts=4, min_inks=4):
    """Generate, check, keep the BEST -- not the last.

    The naive loop regenerates on failure and stops when it runs out of tries,
    which means a passing attempt can be overwritten by a failing one that
    happens to come after it. That happened on the first polar run: attempt 2
    passed and attempts 3 and 4 replaced it with collapsed plates. Score every
    attempt, keep the winner, and only then write it to the cache.
    """
    import scene_qa
    key = plate_key(rec)
    best, best_score, log = None, -1, []
    for i in range(attempts):
        generate(rec, force=True)
        img = load(rec)
        bad, m = scene_qa.check(img)
        # Passing is the first thing that matters; ink variety breaks ties,
        # then a lower dominant share, since both track "reads as a picture".
        score = (0 if bad else 100) + m["inks_used"] * 5 + (1 - m["dominant_ink_share"]) * 10
        log.append((i + 1, m, bad, score))
        if score > best_score:
            best, best_score = img.copy(), score
        if not bad and m["inks_used"] >= min_inks:
            break
    if best is not None:
        best.save(os.path.join(PLATES, f"{key}.png"))
    return best, log


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", help="ingest an already-downloaded raw plate")
    ap.add_argument("--key", help="cache key for --ingest")
    ap.add_argument("--all", action="store_true", help="generate every missing plate")
    ap.add_argument("--plan", action="store_true", help="show what WOULD be generated")
    a = ap.parse_args()
    recs = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]

    if a.ingest:
        print(ingest_plate(a.ingest, a.key or "manual", "manual ingest"))
    elif a.plan or a.all:
        need, have = {}, {}
        for r in recs:
            k = plate_key(r)
            (have if load(r) is not None else need).setdefault(k, 0)
            (have if load(r) is not None else need)[k] += 1
        print(f"{len(recs)} launches -> {len(need)+len(have)} distinct plates "
              f"({len(have)} cached, {len(need)} to generate)")
        for k, n in sorted(need.items()):
            print(f"  MISSING {k:34s} covers {n} launch(es)")
        if a.all:
            for r in recs:
                if load(r) is None:
                    print("generating", plate_key(r), flush=True)
                    generate(r)
