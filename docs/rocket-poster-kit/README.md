# Rocket poster kit

Turns one Launch Library 2 record into an 800×480 poster for the 7.3" E Ink
Spectra 6 panel in the **Rocket Launch Wall Art** build
(`src/data/rocket-launch-art.json`).

```bash
python3 serve.py                    # THE ONE TO RUN: render + serve for the frame
python3 serve.py --once             # render once and exit, no server
python3 poster.py --all             # render all 24 offline fixtures
python3 -m unittest discover .      # the gates
```

## With the kit in your hands

The frame pulls its image from this server over WiFi. Nothing goes on an SD
card in this path.

1. **Start the server** on a machine that stays awake -- a Pi, a spare laptop,
   anything on the same network. `python3 serve.py --port 8080`. It restores
   the last poster from disk before it touches the network, so a reboot never
   shows a blank panel.
2. **Check it from another machine** on the LAN: `curl -I http://<host>:8080/panel.bmp`
   should return `200` and an `ETag`. If that fails from another machine but
   works locally, it is a firewall, not this code.
3. **Give the host a fixed address.** A DHCP lease change silently strands the
   frame -- it will keep polling an address that now belongs to a toaster.
4. **Flash the frame** with `aitjcize/esp32-photoframe`, battery DISCONNECTED
   (see the PMIC bug below), and point its image URL at `http://<host>:8080/panel.bmp`.
5. **Watch `/status`** for what it is showing and what it has spent.

| Endpoint | Cost | For |
|---|---|---|
| `/panel.bmp` | free | what the frame polls; returns `304` unchanged |
| `/status` | free | current record, render age, API budget |
| `/refresh` | free | redraw from cached data |
| `/refresh?upstream=1` | **2 of 15 per hour** | go get fresh launch data |

That budget is per IP and shared with every device in the house, so `/refresh`
defaults to the free path and the server refuses an upstream call it cannot
afford rather than letting you collect a 429.

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

### What the firmware actually does with our BMP (verified, not assumed)

Read from the source this build flashes, `aitjcize/esp32-photoframe`:

* `docs/API.md` -- **"BMP: displayed directly (must be pre-processed)"**, versus
  "JPEG/PNG: decoded, dithered to e-paper palette, displayed". So sending a BMP
  bypasses the device's own Floyd-Steinberg pass entirely. Send a PNG instead
  and the firmware re-dithers our already-flat six-ink art against its own
  calibrated palette -- speckle on every flat field, and all the palette work
  in this kit thrown away. **Serve BMP. Never PNG.**
* `components/epaper_src/GUI_ColorMap.h`, `GUI_RGBToSpectra6()` -- exact match
  against the *nominal* triples, which is exactly what `export_bmp.py` writes.
  Unknown colours return white (index 1) rather than inheriting the previous
  pixel, so this fork has fixed the stock smear bug described above. Ours are
  all exact matches regardless, which is the point of the two-palette split.

The panel's 4bpp nibbles are **black 0, white 1, yellow 2, red 3, blue 5,
green 6** -- yellow before red, and 4 unused. `palette.PANEL_NIBBLE` carries
that, and `spectra6.pack()` remaps on the way out so no caller can forget.

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

## The generated scene

The background is a flat travel-poster launch scene generated per
`(destination, country)` and cached in `scenes/`. Everything in front of it is
deterministic: the rocket is a committed asset, the type is real text, the
palette is enforced, the band is painted regardless of what the model drew.

```bash
python3 scene.py --plan     # what would be generated, and what is cached
python3 scene.py --all      # generate every missing plate
python3 scene_qa.py         # structural check on every cached plate
```

**The lesson that made it work.** The first version let the destination mood
change how light or dark the plate was — "night launch, deep dark sky", "cold
morning, pale sky". Three of the first seven plates came back unusable: a black
slab, a 96% blank, and a rust desert that snapped to green.

That was not the model drifting. It was this palette. Six inks with no greys
and no dark blue means a dark sky has nowhere to land but solid black and a
pale sky nowhere but solid white. **Luminance is the one dimension these inks
cannot express, so the prompt must not ask it to vary.** Every mood now shares
one tonal recipe — dark band top, saturated mid bands, light band above the
horizon, dark ground — and differs only in motif. Night is told by a crescent
moon on a *blue* sky, not by darkness.

**The QA metric was wrong too, and that mattered more.** The first drift check
measured palette-histogram distance and reported the series getting *worse* as
it visibly got better — because the palette is keyed to destination on purpose,
so a blue lunar plate and a red Mars plate *should* differ. `scene_qa.py` now
measures structure instead: banding, horizon position, gantry mass, and whether
any single ink has swallowed the plate. That separates cleanly — all four
current plates pass, all six earlier ones fail.

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
- **Resample however you like, then snap back.** An earlier version of this
  file said "`NEAREST` everywhere" because interpolation invents in-between
  colours. True, but the cure was worse: `NEAREST` and `LANCZOS` both destroy
  the thin dark lines that make a rocket read as a rocket. The kit now scales
  with `LANCZOS` and calls `scene.snap_to_inks` afterwards, which is the only
  thing that actually has to be true. Two plates were leaking 3,802 and 8,955
  off-ink pixels from resamples that skipped that step.
- **Shrinking line art is its own problem.** Averaging a 2px dark line inside a
  5px cell dilutes it into the surrounding white, so downscaled vehicles came
  out mushy. `poster.shrink_keeping_lines` takes the darkest pixel in each cell
  instead: 3,788 dark pixels survive where `LANCZOS` left 1,180.
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
