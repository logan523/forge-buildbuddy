"""
The six inks, and which pair a launch gets.

One source of truth. These values were measured off a 7.3" E Ink Spectra 6
panel, and they are deliberately NOT sRGB primaries -- the panel's gamut sits
closer to CMYK print, and its "white" reflects only 35-45% of light. It is
newsprint grey, not paper white. Design against these numbers or the piece
looks washed out on the wall and correct on your screen.

The destination pairing is what gives the series variety without redesign:
`mission.orbit.name` comes straight from Launch Library 2, so a Mars shot and
a polar sun-sync shot are different posters by construction, not by hand.
"""

# TWO palettes, and conflating them silently destroys the image.
#
# MEASURED is what the panel actually reflects. Quantize against these, so both
# the nearest-ink decision and the diffused error reflect reality -- e-paper
# shows colours 30-70% darker than nominal, and deciding against nominal RGB
# produces washed-out results with wrong error propagation.
#
# NOMINAL is what the firmware's BMP reader matches. PhotoPainter's
# GUI_BMPfile.c tests each pixel against six exact RGB triples with NO else
# clause, and `color` is declared outside the pixel loop -- so a pixel that
# matches nothing silently inherits the PREVIOUS pixel's colour and smears
# horizontally across the row. It is not a nearest-match; it is exact or
# garbage.
#
# So: design and quantize in MEASURED, then map to NOMINAL on export. Writing
# measured values into the BMP would have missed all six triples and turned
# every poster into coloured streaks.
INKS = {
    "black":  (26, 26, 24),
    "white":  (214, 211, 200),   # newsprint grey, not paper white
    "red":    (168, 57, 47),
    "yellow": (212, 174, 42),
    "blue":   (53, 84, 138),
    "green":  (74, 117, 80),
}

# Exactly what lib/GUI/GUI_BMPfile.c compares against. Do not "improve" these.
NOMINAL = {
    "black":  (0, 0, 0),
    "white":  (255, 255, 255),
    "yellow": (255, 255, 0),
    "red":    (255, 0, 0),
    "blue":   (0, 0, 255),
    "green":  (0, 255, 0),
}

MEASURED_TO_NOMINAL = {INKS[k]: NOMINAL[k] for k in INKS}

# The nibble each ink occupies in the panel's 4bpp framebuffer.
#
# VERIFIED against the firmware this build flashes, not guessed:
# aitjcize/esp32-photoframe, components/epaper_src/GUI_ColorMap.h,
# GUI_RGBToSpectra6() -- black 0, white 1, yellow 2, red 3, blue 5, green 6.
#
# Note 4 is SKIPPED. The ordering is also not alphabetical, not the order the
# inks are listed anywhere else, and puts yellow before red. Deriving it by
# enumerating a list of ink names -- which is what this file used to do -- gets
# red and yellow swapped and blue and green each shifted down one. Nothing
# catches that until a poster is on the wall with the wrong colours.
PANEL_NIBBLE = {"black": 0, "white": 1, "yellow": 2, "red": 3, "blue": 5, "green": 6}

# Order used for internal indexing and nearest-ink math. Compact 0..5, and
# deliberately NOT the panel's order -- see PANEL_NIBBLE, which is the only
# thing that may be written into a framebuffer.
INK_ORDER = ["black", "white", "red", "yellow", "blue", "green"]
INK_LIST = [(n, INKS[n]) for n in INK_ORDER]
INK_RGB = set(INKS.values())

CANVAS = (800, 480)


class Palette:
    """field = the full-bleed ground. accent = plume, rules, horizon.
    ink = the type color that reads on `field`."""

    def __init__(self, field, accent, ink="white"):
        self.field_name, self.accent_name, self.ink_name = field, accent, ink
        self.field, self.accent, self.ink = INKS[field], INKS[accent], INKS[ink]

    def __repr__(self):
        return f"Palette({self.field_name}/{self.accent_name})"


# Matched by substring against the REAL strings LL2 returns
# ("Geostationary Transfer Orbit", "Sun-Synchronous Orbit"), longest first so
# "Low Earth Orbit" cannot be shadowed by a looser rule. Order matters.
_RULES = [
    ("sun-earth l2",     Palette("black",  "blue",   "white")),
    ("sun-synchronous",  Palette("green",  "yellow", "white")),
    ("geostationary",    Palette("yellow", "red",    "black")),
    ("polar",            Palette("green",  "yellow", "white")),
    ("lunar",            Palette("black",  "yellow", "white")),
    ("moon",             Palette("black",  "yellow", "white")),
    ("mars",             Palette("red",    "white",  "white")),
    ("suborbital",       Palette("yellow", "blue",   "black")),
    ("medium earth",     Palette("blue",   "yellow", "white")),
    ("low earth",        Palette("blue",   "red",    "white")),
    ("heliocentric",     Palette("black",  "red",    "white")),
]

# `destination` is the literal string "Unknown" on real records -- three of the
# 24 samples, including both classified ones. Not an error state; a normal one.
FALLBACK = Palette("blue", "white", "white")


def palette_for(destination):
    d = (destination or "").strip().lower()
    for needle, pal in _RULES:
        if needle in d:
            return pal
    return FALLBACK


if __name__ == "__main__":
    import json, os, collections
    HERE = os.path.dirname(os.path.abspath(__file__))
    recs = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
    seen = collections.Counter()
    for r in recs:
        p = palette_for(r["destination"])
        seen[f"{r['destination']:26s} -> {p.field_name}/{p.accent_name}"] += 1
    for k, v in sorted(seen.items()):
        print(f"{v:2d}x  {k}")
