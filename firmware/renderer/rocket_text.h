/*
 * Type, on the device.
 *
 * This is the half of the poster that is not baked, because the strings change
 * with every launch. Everything it does is integer arithmetic over a baked
 * glyph atlas -- no font rasteriser, no floats, no locale.
 *
 * It reproduces docs/rocket-poster-kit/typeset.py exactly, which is only
 * possible because typeset.py was first made deterministic: integer pen,
 * per-character advances, no kerning. PIL ships HarfBuzz where raqm is
 * available, and a kerned whole-string measure cannot be reproduced here.
 *
 * The atlas is proven equivalent to PIL's own drawing: blitting each glyph at
 * its recorded offset gives a pixel-identical result, because an integer pen
 * makes glyph rasterisation position-independent.
 */
#ifndef ROCKET_TEXT_H
#define ROCKET_TEXT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "rocket_card.h"

#define RKT_ATLAS_ENTRY_BYTES 12   /* cp2 adv1 w1 h1 ox1 oy1 off4 */

typedef struct {
    uint16_t       codepoint;
    uint8_t        advance;
    uint8_t        w;
    uint8_t        h;
    int8_t         off_x;
    int8_t         off_y;
    uint32_t       data_off;
} rkt_glyph_t;

typedef struct {
    uint16_t       count;
    uint16_t       face;
    uint16_t       size;
    const uint8_t *table;   /* count * RKT_ATLAS_ENTRY_BYTES */
    const uint8_t *bitmaps;
} rkt_atlas_t;

/* Decode an atlas file body (everything after the 16-byte layer header).
 * Fails closed on a truncated or inconsistent table. */
bool rkt_atlas_open(const uint8_t *body, size_t len, rkt_atlas_t *out);

/* Glyph for a codepoint, or NULL when the atlas has no entry. A missing glyph
 * is skipped and counted by the caller -- never substituted. */
bool rkt_atlas_glyph(const rkt_atlas_t *a, uint16_t cp, rkt_glyph_t *out);

/*
 * Width of `s` as it will ACTUALLY be drawn: the sum of the same integer
 * advances the pen steps by, plus `track` between characters.
 * `s` is UTF-8; only ASCII and U+00B7 are representable, matching the bake.
 */
int32_t rkt_text_width(const rkt_atlas_t *a, const char *s, int32_t track);

/* Greedy word wrap on spaces, measuring with rkt_text_width. Writes up to
 * `max_lines` NUL-terminated lines into `out` (each `stride` bytes) and
 * returns how many it produced. */
int rkt_text_wrap(const rkt_atlas_t *a, const char *s, int32_t max_w,
                  char *out, size_t stride, int max_lines);

/* Draw `s` at (x, y) -- the pen origin, matching PIL's default "la" anchor --
 * into an RGB888 buffer `w` x `h`. Returns glyphs skipped for want of an
 * atlas entry, so the caller can log a number instead of guessing. */
int rkt_text_draw(uint8_t *rgb, int32_t buf_w, int32_t buf_h,
                  int32_t x, int32_t y, const char *s,
                  const rkt_atlas_t *a, int32_t track, uint8_t ink);

/* "%d %b %Y · %H:%M UTC", uppercased, from an ISO-8601 Zulu string.
 * A 12-entry month table, never strftime: %b is locale-dependent and ESP
 * newlib's "C" locale and the host's LC_TIME do not have to agree. Writes ""
 * when the input does not parse, which is what poster.py does.
 *
 * `precision` is LL2's net_precision. A Month record still carries a full
 * timestamp whose time is a PLACEHOLDER (2026-09-30T00:00:00Z), so the format
 * is cut to what is actually known: Year -> "2026", Month -> "SEP 2026",
 * Day -> "30 SEP 2026", anything else -> the full form. */
void rkt_fmt_when(const char *iso, const char *precision,
                  char *out, size_t out_len);

#endif /* ROCKET_TEXT_H */
