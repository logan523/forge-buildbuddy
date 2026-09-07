"""
Type for a six-ink panel.

Two things here are not obvious and were both learned the hard way:

**Glyphs go through a hard-thresholded mask.** PIL antialiases truetype text by
default, blending the ink with whatever is underneath. On a six-color panel
that smuggles hundreds of off-palette colors into the image -- one test render
of a single poster carried ~800 of them. The panel cannot show any of them; the
driver would re-quantize, and thin strokes would dissolve. So: draw to an L
mask, threshold at 128, paste solid ink through it. Every glyph pixel ends up
exactly one ink, and the image stays legal.

**Type is composited AFTER any dithering, never before.** Error diffusion run
over an 11px label turns it into a field of speckle. (Moot for flat poster art,
which needs no dithering at all -- but it still governs the `--art` path where
a generated painting is the background.)

Fit ladders are built against the real worst-case string lengths in
`launch-samples.json:_max_lengths` -- rocket 35, provider 50, site 59,
mission 49. The rule everywhere: shed tracking, then size, then wrap. Never
clip. A clipped rocket name is worse than a small one.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Archivo (SIL OFL 1.1), VENDORED at fonts/Archivo.ttf.
#
# This was Apple's Futura, at /System/Library/Fonts/Supplemental/Futura.ttc.
# Two problems with that, both fatal here rather than merely untidy: baked
# glyph atlases are derived rasterisations shipped on an SD card inside a
# device, and a system font path makes the goldens unreproducible on any
# machine that is not this Mac. The oracle has to be portable or it is not an
# oracle.
#
# Archivo is a grotesque with real width and weight axes (Weight 100-900,
# Width 62-125), so the four faces this kit uses are points on those axes
# rather than four separate files. Same geometric-poster register as Futura;
# the extra-condensed extra-bold headline is the one that matters.
FONT_PATH = str(Path(__file__).resolve().parent / "fonts" / "Archivo.ttf")

MEDIUM, BOLD, CONDENSED, XCONDENSED = 0, 2, 3, 4

# (weight, width) per face id. Kept as the old integer ids so every call site
# and every ladder reads unchanged.
_AXES = {
    MEDIUM:     (500, 100),
    BOLD:       (700, 100),
    CONDENSED:  (700,  80),
    XCONDENSED: (800,  62),
}

_FONTS: dict = {}


def font(index, size):
    """Cached. Variable-font instances are not free to build, and the fit
    ladders ask for the same (face, size) many times per poster."""
    key = (index, int(size))
    f = _FONTS.get(key)
    if f is None:
        f = ImageFont.truetype(FONT_PATH, int(size))
        f.set_variation_by_axes(list(_AXES[index]))
        _FONTS[key] = f
    return f


# --------------------------------------------------------------------------
# Determinism: integer pen, no kerning.
#
# This layer exists so the layout is a PURE INTEGER FUNCTION of
# (string, face, size, track) -- which is what makes a C port verifiable and
# what stops the same Python producing different line breaks on two machines.
#
# Two measured problems it fixes:
#
#   PIL ships HarfBuzz when raqm is available (it is here: features.check
#   ("raqm") is True). textlength("AVATAR") is 75.5625 whole against 79.671875
#   summed per glyph -- 4.1 px of GPOS kerning. wrap() measured whole strings,
#   tracked_width() stepped per character, and the two silently disagreed.
#   Worse, raqm's presence is an ENVIRONMENT property, so the same code on a
#   box without it wrapped differently.
#
#   Pillow quantises glyph rasterisation to half-pixels, so a thresholded mask
#   is not invariant to sub-pixel x -- 2 distinct masks across 16 offsets. The
#   pen was fractional because put() centres on (col - w) / 2.
#
# Both go away if every advance is an integer and every measurement is the sum
# of the same integers actually used to place glyphs.
# --------------------------------------------------------------------------

_ADV: dict = {}


def advance(draw, ch, fnt) -> int:
    """Integer advance for ONE glyph, unkerned. The only measurement primitive."""
    # id() is a sound key ONLY because font() caches instances, so one
    # (face, size) is always the same object. An earlier key used a font
    # attribute that was never set, so all four faces collided and every face
    # measured as the first one asked for.
    key = (ch, id(fnt))
    a = _ADV.get(key)
    if a is None:
        a = int(round(draw.textlength(ch, font=fnt)))
        _ADV[key] = a
    return a


def string_width(draw, s, fnt, track=0.0) -> int:
    """Width of `s` as it will ACTUALLY be drawn: the sum of the same integer
    advances the pen will step by. Never PIL's kerned whole-string measure."""
    if not s:
        return 0
    return (sum(advance(draw, c, fnt) for c in s)
            + int(round(track)) * (len(s) - 1))


def _stamp(img, draw_into_mask, ink):
    mask = Image.new("L", img.size, 0)
    draw_into_mask(ImageDraw.Draw(mask))
    hard = mask.point(lambda v: 255 if v > 127 else 0)
    img.paste(Image.new("RGB", img.size, ink), (0, 0), hard)


def text(img, xy, s, fnt, ink):
    """Hard-edged text. No antialiasing and no kerning, by design.

    Steps per character rather than drawing one run, so the pen positions are
    the same integers `string_width` measured.
    """
    tracked(img, xy, s, fnt, ink, track=0.0)


def tracked(img, xy, s, fnt, ink, track=0.0):
    """Letter-spaced text on an INTEGER pen. PIL has no tracking, so step it.

    Each glyph is thresholded ON ITS OWN before being merged. Drawing the whole
    run into one grey mask and thresholding once looks equivalent and is not:
    where two glyphs' antialiased edges overlap, the greys ADD and can cross
    127 together, lighting a pixel neither glyph has alone. That artifact is
    unreproducible by anything compositing pre-thresholded glyphs -- which is
    exactly what the device does from the baked atlas -- so it showed up as a
    one-pixel conformance failure between '1' and '5' in "1565TH".

    Per-glyph thresholding is also what this module claims to do: hard edges,
    no antialiasing. The old form quietly made a glyph's appearance depend on
    its neighbour.
    """
    measure = ImageDraw.Draw(img)
    step = int(round(track))
    hard = Image.new("L", img.size, 0)
    x, y = int(round(xy[0])), int(round(xy[1]))
    for ch in s:
        one = Image.new("L", img.size, 0)
        ImageDraw.Draw(one).text((x, y), ch, font=fnt, fill=255)
        hard.paste(255, (0, 0), one.point(lambda v: 255 if v > 127 else 0))
        x += advance(measure, ch, fnt) + step
    img.paste(Image.new("RGB", img.size, ink), (0, 0), hard)


def tracked_width(draw, s, fnt, track=0.0) -> int:
    """Kept as the ladders' name for it; now just the integer measure."""
    return string_width(draw, s, fnt, track)


def fit(draw, s, index, max_w, start, floor, track=0.0):
    """Largest size at which `s` fits `max_w`. Returns the font, which may be
    at the floor and still too wide -- callers must handle that, not assume."""
    size = start
    while size > floor:
        f = font(index, size)
        if tracked_width(draw, s, f, track) <= max_w:
            return f
        size -= 2
    return font(index, floor)


def fit_tracked(draw, s, index, max_w, sizes, tracks):
    """Shed letter-spacing before size. Tracking is the first thing worth
    losing on a 50-character provider name; legibility is the last.

    Returns (font, track, text). The third element is the string as it should
    actually be drawn -- at the floor it is truncated with an ellipsis.

    That floor used to return the smallest font and whatever width came with
    it, so a long line simply bled sideways under the vehicle with no rescue.
    It was latent until measurement became unkerned (integer per-glyph sums run
    ~2.5% wider than PIL's kerned whole-string measure), which pushed the real
    worst-case previous-launch line past its column. A shortened line is
    recoverable; one running under a dithered rocket is not.
    """
    for size in sizes:
        f = font(index, size)
        for tr in tracks:
            if tracked_width(draw, s, f, tr) <= max_w:
                return f, tr, s
    f, tr = font(index, sizes[-1]), tracks[-1]
    cut = s
    while cut and tracked_width(draw, cut + "…", f, tr) > max_w:
        cut = cut[:-1]
    return f, tr, (cut + "…" if cut != s else s)


def wrap(draw, s, fnt, max_w):
    words, lines, cur = s.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if string_width(draw, trial, fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit_headline(draw, primary, fallback, index, max_w, start, floor, track=0.0):
    """Ladder for the one string that must never be clipped: try the full name,
    then a shorter official form, then wrap to two lines. LL2's longest real
    rocket name is 35 chars ('Launch Vehicle Mark-3 (GSLV Mk III)'), which
    cannot be set on one line at any size worth calling a headline -- but it
    ships its own `rocket_short`, so the fallback is the API's word, not ours.
    """
    for cand in (primary, fallback):
        if not cand:
            continue
        f = fit(draw, cand, index, max_w, start, floor, track)
        if tracked_width(draw, cand, f, track) <= max_w:
            return [cand], f
    short = fallback or primary
    for size in range(int(start * 0.78), floor - 1, -2):
        f = font(index, size)
        lines = wrap(draw, short, f, max_w)
        if len(lines) <= 2 and all(tracked_width(draw, l, f, track) <= max_w for l in lines):
            return lines, f
    f = font(index, floor)
    return wrap(draw, short, f, max_w)[:2], f


def fit_wrap(draw, s, index, max_w, start, floor, track=0.0, max_lines=2):
    """Shrink until the WRAPPED LINES fit, not just the whole string.

    fit() sizes the full string against the column, but wrap() can still emit a
    line wider than it -- a single unbreakable word ("MID-INCLINATION",
    "GEOSTATIONARY") is longer than the column at the floor size, so the text
    silently bleeds into the vehicle. Measure what will actually be drawn.

    Returns (lines, font). At the floor it truncates with an ellipsis rather
    than overflowing: a shortened headline is recoverable, one running under a
    dithered rocket is not.
    """
    size = start
    while size >= floor:
        f = font(index, size)
        lines = wrap(draw, s, f, max_w)
        if len(lines) <= max_lines and all(
                tracked_width(draw, l, f, track) <= max_w for l in lines):
            return lines, f
        size -= 2
    f = font(index, floor)
    out = []
    for line in wrap(draw, s, f, max_w)[:max_lines]:
        while line and tracked_width(draw, line + "…", f, track) > max_w:
            line = line[:-1]
        out.append(line + "…" if line != s else line)
    return out, f
