#!/usr/bin/env python3
"""
Generate one vehicle asset per rocket family, once.

Run with a list of family keys. Each is generated, downloaded, ingested and
proportion-checked against the API's real length/diameter. Anything the check
flags is reported for a reroll rather than silently committed.

    python3 generate_fleet.py "Long March" Electron Soyuz Ariane

Model: nano_banana_2_lite with thinking=HIGH. Chosen on evidence -- the cheap
model (z_image, 0.15cr) produces excellent composition but drew strap-on
boosters onto a Falcon 9 twice, including after an explicit instruction not
to. None of the image models here expose a negative prompt, and diffusion
handles negation poorly without one, so the model that actually reasons about
the description is worth ~2.5 credits a vehicle. That cost is paid once per
family and amortized over every launch that family ever flies.
"""

import json, os, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "nano_banana_2_lite"

FRAME = ("Perfectly vertical, flat to camera, strict orthographic side elevation, "
         "no perspective, no tilt, no angle. Solid uniform bright magenta background, "
         "completely flat, no shadows, no gradient. Even frontal lighting. The entire "
         "rocket is visible with a margin on all sides. Technical illustration with "
         "visible panel seams and structural detail. No flames, no exhaust, no smoke, "
         "no launch tower, no ground, no sky, no stars, no text, no logos, no people.")

# What each vehicle actually looks like. Written positively -- these models
# follow a description far better than a prohibition.
FLEET = {
    "Long March": (
        "The Chinese Long March 5 heavy-lift rocket. A wide white central core "
        "flanked by exactly FOUR slender strap-on boosters, one at each quadrant, "
        "so two are visible on each side. Each strap-on has a pointed conical nose "
        "and is about half the height of the core. The core is topped by a large "
        "white ogive payload fairing. A red band circles the core near mid-height."),
    "Electron": (
        "The Rocket Lab Electron small launch vehicle. Its body is entirely MATTE "
        "BLACK carbon fibre, which is its most distinctive feature. A single slim "
        "cylindrical core standing completely alone with nothing attached to its "
        "sides. Very slender, roughly 15 times taller than it is wide. Two stages "
        "with a plain conical nose fairing. Nine tiny engine nozzles at the base."),
    "Soyuz": (
        "The Russian Soyuz-2 rocket. Its signature silhouette: a central core "
        "surrounded by FOUR tapered strap-on boosters that are WIDE at the bottom "
        "and taper to a POINT at the top, hugging the core tightly so the whole "
        "vehicle flares outward at its base like a tulip. Pale grey-white. The core "
        "extends well above the boosters and is topped by a rounded bullet-shaped "
        "payload fairing."),
    "Ariane": (
        "The European Ariane 62 rocket. A tall white central core with exactly TWO "
        "slender solid rocket boosters strapped to opposite sides, one visible on "
        "each side, each with a pointed conical nose and reaching about half the "
        "core's height. A long white ogive payload fairing on top."),
    "H3": (
        "The Japanese H3 rocket. A white central core with exactly TWO solid rocket "
        "boosters strapped to opposite sides, each with a pointed nose cone, "
        "reaching roughly half the core height. An orange-red band around the core. "
        "A long white ogive payload fairing."),
    "Atlas": (
        "The American Atlas V 401 rocket. A single white cylindrical core standing "
        "alone with NOTHING attached to its sides, topped by a very large diameter "
        "white payload fairing that is noticeably wider than the booster below it, "
        "giving a distinctive lightbulb silhouette. A single engine nozzle at the base."),
    "GSLV": (
        "The Indian LVM3 (GSLV Mark III) rocket. A short, wide white central core "
        "flanked by exactly TWO very large solid rocket boosters, one on each side, "
        "which are nearly as tall as the core itself and dominate the silhouette. "
        "Each booster has a pointed nose. A white ogive payload fairing on top."),
    "New Glenn": (
        "The Blue Origin New Glenn rocket. A very tall, very wide single white "
        "cylindrical core standing alone with nothing attached to its sides. Seven "
        "large engine nozzles clustered at the base. Six landing legs and four "
        "strakes near the bottom of the first stage. A tall white ogive fairing."),
    "Starship": (
        "The SpaceX Starship and Super Heavy stack. Entirely bare polished STAINLESS "
        "STEEL, silver and metallic, which is its defining feature. Extremely wide "
        "and cylindrical with a constant diameter for almost its whole height. The "
        "upper stage has two small forward flaps near its pointed nose and two large "
        "aft flaps lower down. Grid fins near the top of the tall booster. A dense "
        "cluster of many engine nozzles at the base."),
    "Vega": (
        "The European Vega-C small launch vehicle. A single slim white cylindrical "
        "core standing alone with nothing attached to its sides. Four stacked stages "
        "of slightly decreasing diameter, giving a subtly stepped profile, topped by "
        "a pointed conical nose fairing. A green band near mid-height."),
    "Angara": (
        "The Russian Angara A5 rocket. A central core surrounded by exactly FOUR "
        "identical cylindrical boosters of the SAME diameter as the core, so the "
        "base looks like a bundle of five matching tubes, two visible on each side "
        "of the core. Each booster has a pointed nose. Pale grey-white with a blue "
        "band. A conical payload fairing on top."),
}


def run(family):
    desc = FLEET[family]
    prompt = f"{desc} {FRAME}"
    print(f"\n--- {family} ---", flush=True)
    out = subprocess.run(
        ["higgsfield", "generate", "create", MODEL, "--aspect_ratio", "9:16",
         "--thinking", "HIGH", "--wait", "--prompt", prompt],
        capture_output=True, text=True)
    url = next((l.strip() for l in reversed(out.stdout.splitlines())
                if l.strip().startswith("http")), None)
    if not url:
        print(f"  FAILED: {out.stdout[-300:]} {out.stderr[-300:]}")
        return None
    raw = os.path.join(HERE, "raw", f"{family.lower().replace(' ', '-')}.png")
    urllib.request.urlretrieve(url, raw)
    r = subprocess.run([sys.executable, os.path.join(HERE, "ingest.py"), raw,
                        "--family", family, "--prompt", prompt],
                       capture_output=True, text=True)
    print("  " + r.stdout.strip().replace("\n", "\n  "))
    return raw


if __name__ == "__main__":
    for fam in (sys.argv[1:] or list(FLEET)):
        if fam not in FLEET:
            print(f"unknown family: {fam}; known: {list(FLEET)}")
            continue
        run(fam)
    print("\ncredits:", subprocess.run(["higgsfield", "account", "status"],
                                       capture_output=True, text=True).stdout.strip())
