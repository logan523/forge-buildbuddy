# Rocket poster kit

Turns one Launch Library 2 record into an 800×480 poster for the 7.3" E Ink
Spectra 6 panel in the **Rocket Launch Wall Art** build
(`src/data/rocket-launch-art.json`).

```bash
python3 launch.py --bin              # fetch the next launch, render, pack for the panel
python3 poster.py --all              # render all 24 offline fixtures
python3 -m unittest discover .       # the gates
```

## Why a template and not an image model

Four rounds of prompting produced good-looking one-offs and nothing shippable.
An image model drifts on composition between runs, cannot be told "exactly
these six colors", and misspelled the launch site on essentially every
generation — "Cape Canaavel SFS". For a piece that reports real launches, a
wrong place name is not a stylistic quibble.

The measured argument is stronger than the aesthetic one. **A flat image whose
every fill is already an exact ink passes through the quantizer completely
unchanged** — six colors in, six colors out, pixel for pixel, no dithering
anywhere. Introduce one off-palette fill and that region immediately fragments
into dithered noise. So the vintage-ski-poster style is not just simpler than
painted art; it is the only style this hardware renders *exactly as designed*.

`test_poster.py` asserts that, rather than trusting it.

Generated art is still supported — `poster.py --art painting.png` uses a
painting as the sky and dithers it, which is the one place dithering is wanted.

## Files

| | |
|---|---|
| `palette.py` | The six measured inks, and which pair a launch gets from its destination. One source of truth. |
| `vehicle.py` | Flat two-tone silhouettes keyed to `rocket_family`, with an honest fallback (5 of 24 real records have no family). |
| `typeset.py` | Hard-thresholded glyph masks and the fit ladders. No antialiasing, by design. |
| `poster.py` | The layout. |
| `launch.py` | Fetch, cache, normalize. Implements the same polling policy the build plan puts in firmware. |
| `spectra6.py` | Panel simulator, legality check (`verify`), and the 4bpp packer. |
| `launch-samples.json` | 24 real records chosen to span the design space — rare destinations, worst-case string lengths, classified and sparse records, and the everyday Falcon-to-LEO case. Offline fixtures. |
| `DESIGN-PROMPT.md` | Reference only now. Prompts for offline concept ideation; the shipped art is templated. |

## Things that will bite you

- **The white is grey.** Spectra 6 "white" reflects 35–45% of light — newsprint,
  not paper. Design against the measured values in `palette.py` or it looks
  correct on screen and washed out on the wall.
- **Never resample with interpolation.** `NEAREST` everywhere. Bilinear invents
  in-between colors and puts off-palette pixels straight onto the panel.
- **Type is composited last, through a hard threshold.** PIL's default
  antialiasing smuggled ~800 off-palette colors into one early render.
- **15 requests/hour, per IP — not per device.** A whole household shares it.
  `launch.py` caches, polls adaptively (peak 12/hr), and serves stale data
  rather than retry-storming a 429.
- **Sleep the panel after every refresh.** The image persists *because* power is
  off. Leaving the driver energized damages the electrophoretic layer.

## Note on the toolchain

This kit is Python and sits outside `npm test` — the repo's Node CI has no
Python interpreter. Run its tests directly with the command above. Only
dependency is Pillow, plus numpy for `spectra6.py`.
