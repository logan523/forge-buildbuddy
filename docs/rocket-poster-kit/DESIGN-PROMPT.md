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
