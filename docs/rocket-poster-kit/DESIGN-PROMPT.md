# Design prompt — rocket launch poster series (e-ink)

Paste the block below into Higgsfield / Claude Design / whatever you're generating in.
Swap the DATA block for any record from `launch-samples.json`.

---

## THE PROMPT

> Design a vintage travel poster in the style of 1930s WPA national-park prints and
> 1960s Pan Am airline posters. Screen-print aesthetic: flat blocks of solid color,
> bold simplified geometry, heavy display type, strong silhouette against a banded sky.
>
> **Hard palette — exactly six inks, no others, no blending, no gradients, no
> halftones, no in-between tones.** Every region of the image is one flat solid color:
> - black
> - off-white (warm newsprint grey, NOT bright white)
> - brick red
> - mustard yellow
> - deep navy blue
> - forest green
>
> Any sky must be 3–4 flat horizontal bands of these colors, never a smooth gradient.
> Treat it as a 4-color screen print where the printer only owns these six inks.
>
> **Canvas: 800 × 480 pixels, landscape, 5:3.** Composition must read from across a
> room — this is a framed wall piece, not a screen UI.
>
> **Subject:** the rocket below, in profile silhouette, launching. Give it the poster's
> visual weight. Include a graphic sun disc, planet limb, or orbital arc as the
> secondary element.
>
> **Type hierarchy, largest to smallest:**
> 1. The launch site place name — this is the hero line
> 2. The rocket name
> 3. Destination and purpose, as a small-caps subtitle
> 4. A single line of fine print: provider, pad, date
>
> Use condensed slab serif or heavy condensed sans. Letterspace the small caps.
> No script fonts, no thin hairline serifs — they disintegrate at this palette.
>
> **DATA FOR THIS POSTER:**
> ```
> SITE:        Rocket Lab Launch Complex 1, Mahia Peninsula, New Zealand
> ROCKET:      Electron
> DESTINATION: Low Earth Orbit
> PURPOSE:     Earth Science
> PROVIDER:    Rocket Lab
> DATE:        2026-08-25
> ```
>
> No photorealism. No 3D rendering. No lens flares, no glow, no chrome, no drop
> shadows. Flat vector screen-print only.

---

## Art-direction notes (why the prompt is shaped this way)

**Lead with the place, not the destination.** 81 of the next 100 launches go to Low
Earth / Polar / Sun-Synchronous orbit. "LOW EARTH ORBIT" as your hero line is dull
four days out of five. "MAHIA PENINSULA, NEW ZEALAND" is a travel poster. The
destination still appears — just demoted to the subtitle where it belongs.

**Save a distinct treatment for the rare ones.** Mars Orbit, Lunar Orbit and
Sun-Earth L2 are ~4% of launches. Those deserve a different, grander layout — that
scarcity is what makes the piece worth looking at over months.

**Design for the worst-case string, not the example.** Provider runs to 50 characters
(`China Aerospace Science and Technology Corporation`), site to 59
(`Jiuquan Satellite Launch Center, People's Republic of China`), mission name to 49.
If the layout only survives "SpaceX", it breaks within a week.

**Falcon is half your days.** One Falcon 9 silhouette covers ~50% of launches; about
seven more shapes cover 85%. Nineteen records in a hundred have no rocket family at
all, so you need a generic rocket that doesn't look like a fallback.

**The white is grey.** 35–45% reflectance — newsprint, not photo paper. Don't build
contrast on white-vs-yellow or white-vs-pale-anything; it collapses on the panel.

**Boost saturation ~2.5× before quantizing.** Spectra 6 renders at roughly 80% of
print saturation. An uncorrected image comes out visibly washed out. Cyan drifts to
pale blue and magenta to purple, so avoid compositions that lean on teal or pink —
sunset reds, mustard yellows, and deep navies are where this panel is strongest,
which happens to be exactly the vintage-poster palette.

## Variants worth generating

1. **Everyday** — Falcon 9 / LEO / Communications. The 40% case. If this one is
   beautiful, the series works.
2. **Rare destination** — Mars or L2. The grand layout.
3. **Crewed** — Human Exploration. Different emotional register.
4. **Classified** — Government/Top Secret, `destination: Unknown`. Design the
   *absence* of data deliberately rather than leaving a hole.
5. **Long-string stress test** — the 50-char provider + 59-char site, to prove the
   layout holds.

---

# REVISED: the realistic-rocket prompt

The prompt above asks for a flat silhouette. That was an over-correction on my part —
it optimizes for *clean* quantization and throws away the thing that actually buys
realism on a 6-ink panel: **dithering**. Error diffusion is how e-ink photo frames
render photographs, and it renders a shaded, dimensional rocket far better than a flat
shape.

Verified on the real pipeline (`spectra6.py`): a smoothly shaded cylinder keeps its
roundness, its metal highlight and its terminator through quantization to six inks.
A smooth gradient sky, by contrast, collapses into visible dither texture.

**So: render the rocket realistically. Keep the BACKGROUND flat.**

## THE PROMPT

> A 1950s-60s space-age illustration in the style of Chesley Bonestell and Robert
> McCall — the golden age of astronomical and aerospace art. Painted, airbrushed
> realism: a real rocket with real weight, metal that reads as metal, believable
> light.
>
> **Subject — render this fully, not as a silhouette:**
> A [ROCKET NAME] ascending, seen from slightly below and to the side so the vehicle
> reads three-dimensionally. Cylindrical body with visible panel lines, weld seams and
> stage separation rings. Directional sunlight from the upper left: a hot specular
> highlight down one side of the fuselage, a soft terminator, and reflected fill on
> the shadow side. Engine plume as bright incandescent flame with layered shock
> diamonds. Heat haze and exhaust smoke at the base.
>
> **Background — deliberately simple, this is important:**
> Deep near-black space or a sky rendered as 3–4 FLAT horizontal bands of color.
> **No smooth gradients anywhere.** Optionally a hard-edged planet limb, a graphic sun
> disc, or a sparse starfield. The background must never compete with the vehicle.
>
> **Palette:** limited to six colors — black, warm off-white, brick red, mustard
> yellow, deep navy, forest green. Saturated and bold. No teal, no pink, no magenta,
> no purple.
>
> **Composition:** 800 × 480, landscape 5:3. The rocket occupies the left or right
> third with strong negative space for type. Dramatic low angle. Poster framing.
>
> No text in the image — type is composited separately. No lens flare, no chrome
> gradients, no modern CGI look, no photobash. Painted illustration only.

## Why this works when the flat version didn't

**Local contrast survives; global gradients don't.** Dithering trades spatial
resolution for apparent tonal depth. On a shaded cylinder that trade is invisible at
viewing distance — your eye integrates the dither into a smooth surface. Across a
large flat sky there's nothing to hide the pattern, so it reads as noise.

**The practical rule:** put your tonal detail where there's *form* (the vehicle,
the plume, the planet limb) and keep the empty areas flat.

## Run it before you commit

```bash
python3 spectra6.py your-render.png --compare
```

Writes `your-render.panel.png` (what the panel shows) and `.compare.png`
(side by side), plus an ink-usage histogram. If it warns that over half the panel is
"white", darken the composition — that white is newsprint grey and it reads flat.

Useful flags:
- `--dither atkinson` (default) — punchier, cleaner whites, best for poster art
- `--dither floyd` — better tonal accuracy on photographic detail, speckles flats
- `--dither sierra` — widest spread, least streaking on large smooth areas
- `--saturation 2.5` (default) — the panel renders ~80% of print saturation
- `--bin` — writes the packed bytes the ESP32 streams to the panel

Takes about 6 seconds per image. Run it server-side, never on the ESP32.

---

# Type: composited, not generated

Never ask the image model for the text. Two reasons, both hard:

1. **Generated lettering is unreliable and unverifiable.** Misspelled provider
   names and invented mission numbers are worse than no text on a piece that
   claims to report real launches.
2. **The data changes every refresh.** The art is a backdrop; the type is a
   live view of Launch Library 2. They cannot be baked together.

`compose.py` does the composite, from the real API fields.

```bash
python3 compose.py --index 3                     # a sample record, stand-in art
python3 compose.py --index 3 --art render.png    # with your Higgsfield art
python3 compose.py --all                         # sweep all 24 samples
```

## The ordering that matters

    art  ->  dither to 6 inks  ->  THEN draw type in exact ink values

Type composited BEFORE quantization gets shredded — error diffusion turns an
11px label into a field of speckle. Drawn after, in literal ink values with a
hard-thresholded glyph mask (no antialiasing), every letter is a solid block of
one ink and stays crisp at the panel's native resolution.

The same logic makes the left type panel a **solid** field rather than a
dithered one. There is no tone in a flat background to preserve, so dithering
it buys nothing and costs visible speckle behind small text.

`compose.py` asserts the finished composite contains only the six inks. If that
check ever fails, something is antialiasing that shouldn't be.

## What the layout survives

Checked against all 24 sample records, including every worst-case string:

| Field | Longest real value | Handling |
|---|---|---|
| rocket | 35 — `Launch Vehicle Mark-3 (GSLV Mk III)` | ladder: full name → LL2's own `rocket_short` → wrap to 2 lines. Never clips. |
| provider | 50 — `China Aerospace Science and Technology Corporation` | sheds letter-spacing first, then size (13→9px) |
| site | 59 — `Jiuquan Satellite Launch Center, People's Republic of China` | shrinks to fit, 12→9px |
| mission | 49 | wraps to 2 lines, then truncates |
| status | `To Be Determined` — 86% of records | green chip for Go/Success, red otherwise |

Art occupies the right 330px; type owns the left 470px with a 40px margin.
Change `art_w` in `compose.py` to move the split.
