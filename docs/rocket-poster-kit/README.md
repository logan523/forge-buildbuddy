# Rocket poster kit

Turns one Launch Library 2 record into an 800×480 poster for the 7.3" E Ink
Spectra 6 panel in the **Rocket Launch Wall Art** build
(`src/data/rocket-launch-art.json`).

```bash
python3 launch.py                          # fetch the next launch and render it
python3 export_bmp.py next-launch.png --out pic/001.bmp   # what goes on the SD card
python3 poster.py --all                    # render all 24 offline fixtures
python3 -m unittest discover .             # the gates
```

## Getting it onto the panel

The PhotoPainter reads from a **microSD card**: FAT32, a `pic/` folder in the
root, **24-bit uncompressed BMP**, exactly 800×480. Not PNG, not palettised.

**The trap that will bite you.** The firmware's BMP reader
(`lib/GUI/GUI_BMPfile.c`) compares every pixel against six *exact* RGB triples.
There is no else clause, and its `color` variable is declared outside the pixel
loop — so a pixel matching none of them silently inherits the previous pixel's
colour and smears horizontally across the row. This is why people report
"coloured streaks".

So the kit carries two palettes and `export_bmp.py` swaps between them:

| | Used for | Example: white |
|---|---|---|
| `INKS` (measured) | designing and quantizing — what the panel really reflects | `(214,211,200)` |
| `NOMINAL` | the exported BMP — what the firmware matches | `(255,255,255)` |

Quantizing against nominal RGB would be wrong twice over: e-paper shows colours
30–70% darker than nominal, so both the nearest-ink choice and the diffused
error would be computed against a fiction. Writing measured values into the BMP
would miss all six triples. You need both, in that order.

`export_bmp.py` refuses to write a file containing anything else, and re-reads
the result to confirm.

**Buy the ESP32-S3 version, not PhotoPainter (B).** The (B) is RP2350-based and
has **no radio at all** — SD card only. The ESP32-S3-PhotoPainter is cheaper
*and* has WiFi. For automated fetch, `aitjcize/esp32-photoframe` (MIT, active)
replaces the stock firmware and adds URL polling with ETag caching, so the panel
only burns a 25-second refresh when the launch data actually changed.

**Hardware bug to know about:** shipping boards use the AXP2101 PMIC and restart
unpredictably when USB-C *and* battery are connected at once. Use one or the
other. Waveshare has confirmed it.

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
