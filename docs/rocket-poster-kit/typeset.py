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

from PIL import Image, ImageDraw, ImageFont

# Futura: the mid-century geometric sans the alpine posters were lettered in,
# and already on any macOS box. Condensed ExtraBold is the headline face.
FUTURA = "/System/Library/Fonts/Supplemental/Futura.ttc"
MEDIUM, BOLD, CONDENSED, XCONDENSED = 0, 2, 3, 4


def font(index, size):
    return ImageFont.truetype(FUTURA, size, index=index)


def _stamp(img, draw_into_mask, ink):
    mask = Image.new("L", img.size, 0)
    draw_into_mask(ImageDraw.Draw(mask))
    hard = mask.point(lambda v: 255 if v > 127 else 0)
    img.paste(Image.new("RGB", img.size, ink), (0, 0), hard)


def text(img, xy, s, fnt, ink):
    """Hard-edged text. No antialiasing, by design."""
    _stamp(img, lambda md: md.text(xy, s, font=fnt, fill=255), ink)


def tracked(img, xy, s, fnt, ink, track=0.0):
    """Letter-spaced text. PIL has no tracking, so step the pen manually."""
    measure = ImageDraw.Draw(img)

    def draw_all(md):
        x, y = xy
        for ch in s:
            md.text((x, y), ch, font=fnt, fill=255)
            x += measure.textlength(ch, font=fnt) + track

    _stamp(img, draw_all, ink)


def tracked_width(draw, s, fnt, track=0.0):
    return sum(draw.textlength(c, font=fnt) for c in s) + track * max(0, len(s) - 1)


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
    losing on a 50-character provider name; legibility is the last."""
    for size in sizes:
        f = font(index, size)
        for tr in tracks:
            if tracked_width(draw, s, f, tr) <= max_w:
                return f, tr
    return font(index, sizes[-1]), tracks[-1]


def wrap(draw, s, fnt, max_w):
    words, lines, cur = s.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
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
