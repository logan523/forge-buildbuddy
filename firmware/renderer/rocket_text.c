#include "rocket_text.h"

#include <stdio.h>
#include <string.h>

/* ---------------------------------------------------------------- utf-8 */

/*
 * Decode one codepoint. The bake covers printable ASCII plus U+00B7, so this
 * handles 1- and 2-byte sequences and refuses the rest rather than producing a
 * replacement character nobody baked a glyph for.
 *
 * Every index into the string goes through unsigned char on purpose: `char` is
 * signed on Xtensa and on macOS-arm64 but unsigned on Linux-arm64, so a
 * high-bit byte indexes negative on two of the three.
 */
static const char *utf8_next(const char *s, uint16_t *cp)
{
    const unsigned char *p = (const unsigned char *) s;
    if (p[0] == 0u) {
        return NULL;
    }
    if (p[0] < 0x80u) {
        *cp = (uint16_t) p[0];
        return s + 1;
    }
    if ((p[0] & 0xE0u) == 0xC0u && (p[1] & 0xC0u) == 0x80u) {
        *cp = (uint16_t) (((uint16_t) (p[0] & 0x1Fu) << 6) | (uint16_t) (p[1] & 0x3Fu));
        return s + 2;
    }
    *cp = 0xFFFFu;              /* unrepresentable: caller skips and counts */
    return s + 1;
}

/* ---------------------------------------------------------------- atlas */

static uint16_t le16(const uint8_t *p)
{
    return (uint16_t) ((uint16_t) p[0] | ((uint16_t) p[1] << 8));
}

static uint32_t le32(const uint8_t *p)
{
    return (uint32_t) p[0] | ((uint32_t) p[1] << 8) |
           ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24);
}

bool rkt_atlas_open(const uint8_t *body, size_t len, rkt_atlas_t *out)
{
    if (body == NULL || out == NULL || len < 6u) {
        return false;
    }
    const uint16_t count = le16(body);
    const size_t table_bytes = (size_t) count * RKT_ATLAS_ENTRY_BYTES;
    if (count == 0u || len < 6u + table_bytes) {
        return false;
    }
    out->count   = count;
    out->face    = le16(body + 2);
    out->size    = le16(body + 4);
    out->table   = body + 6;
    out->bitmaps = body + 6 + table_bytes;
    return true;
}

bool rkt_atlas_glyph(const rkt_atlas_t *a, uint16_t cp, rkt_glyph_t *out)
{
    if (a == NULL || out == NULL) {
        return false;
    }
    for (uint16_t i = 0u; i < a->count; ++i) {
        const uint8_t *e = a->table + (size_t) i * RKT_ATLAS_ENTRY_BYTES;
        if (le16(e) != cp) {
            continue;
        }
        out->codepoint = cp;
        out->advance   = e[2];
        out->w         = e[3];
        out->h         = e[4];
        out->off_x     = (int8_t) e[5];
        out->off_y     = (int8_t) e[6];
        out->data_off  = le32(e + 8);
        return true;
    }
    return false;
}

/* ---------------------------------------------------------------- measure */

int32_t rkt_text_width(const rkt_atlas_t *a, const char *s, int32_t track)
{
    if (a == NULL || s == NULL || *s == '\0') {
        return 0;
    }
    int32_t total = 0;
    int32_t n = 0;
    uint16_t cp = 0u;
    const char *p = s;
    while ((p = utf8_next(p, &cp)) != NULL) {
        rkt_glyph_t g;
        if (rkt_atlas_glyph(a, cp, &g)) {
            total += (int32_t) g.advance;
        }
        ++n;
    }
    if (n > 1) {
        total += track * (n - 1);
    }
    return total;
}

/* ---------------------------------------------------------------- wrap */

int rkt_text_wrap(const rkt_atlas_t *a, const char *s, int32_t max_w,
                  char *out, size_t stride, int max_lines)
{
    if (a == NULL || s == NULL || out == NULL || max_lines <= 0 || stride == 0u) {
        return 0;
    }
    int lines = 0;
    char cur[256];
    char trial[256];
    cur[0] = '\0';

    const char *w = s;
    while (*w != '\0' && lines < max_lines) {
        while (*w == ' ') { ++w; }
        if (*w == '\0') { break; }
        const char *end = w;
        while (*end != '\0' && *end != ' ') { ++end; }
        const size_t wlen = (size_t) (end - w);

        /* trial = cur + " " + word, exactly as typeset.wrap builds it */
        size_t tl = 0u;
        if (cur[0] != '\0') {
            tl = strlen(cur);
            if (tl + 1u + wlen + 1u > sizeof trial) { break; }
            memcpy(trial, cur, tl);
            trial[tl++] = ' ';
        } else if (wlen + 1u > sizeof trial) {
            break;
        }
        memcpy(trial + tl, w, wlen);
        trial[tl + wlen] = '\0';

        if (rkt_text_width(a, trial, 0) <= max_w || cur[0] == '\0') {
            /* `or not cur` in the Python: a single word wider than the column
             * still becomes its own line rather than vanishing. */
            memcpy(cur, trial, strlen(trial) + 1u);
        } else {
            const size_t n = strlen(cur);
            memcpy(out + (size_t) lines * stride, cur, (n < stride ? n + 1u : stride));
            out[(size_t) lines * stride + stride - 1u] = '\0';
            ++lines;
            if (wlen + 1u > sizeof cur) { break; }
            memcpy(cur, w, wlen);
            cur[wlen] = '\0';
        }
        w = end;
    }
    if (cur[0] != '\0' && lines < max_lines) {
        const size_t n = strlen(cur);
        memcpy(out + (size_t) lines * stride, cur, (n < stride ? n + 1u : stride));
        out[(size_t) lines * stride + stride - 1u] = '\0';
        ++lines;
    }
    return lines;
}

/* ---------------------------------------------------------------- draw */

int rkt_text_draw(uint8_t *rgb, int32_t buf_w, int32_t buf_h,
                  int32_t x, int32_t y, const char *s,
                  const rkt_atlas_t *a, int32_t track, uint8_t ink)
{
    if (rgb == NULL || s == NULL || a == NULL || ink >= RKT_INK_COUNT) {
        return 0;
    }
    int missing = 0;
    int32_t pen = x;
    uint16_t cp = 0u;
    const char *p = s;

    while ((p = utf8_next(p, &cp)) != NULL) {
        rkt_glyph_t g;
        if (!rkt_atlas_glyph(a, cp, &g)) {
            ++missing;                 /* skipped, counted, never guessed */
            pen += track;
            continue;
        }
        if (g.w != 0u && g.h != 0u) {
            const size_t stride = ((size_t) g.w + 7u) / 8u;
            const uint8_t *bits = a->bitmaps + g.data_off;
            for (uint8_t gy = 0u; gy < g.h; ++gy) {
                const int32_t py = y + (int32_t) g.off_y + (int32_t) gy;
                if (py < 0 || py >= buf_h) { continue; }
                for (uint8_t gx = 0u; gx < g.w; ++gx) {
                    const uint8_t byte = bits[(size_t) gy * stride + ((size_t) gx >> 3)];
                    if ((byte & (uint8_t) (0x80u >> (gx & 7u))) == 0u) { continue; }
                    const int32_t px = pen + (int32_t) g.off_x + (int32_t) gx;
                    if (px < 0 || px >= buf_w) { continue; }
                    uint8_t *d = rgb + (((size_t) py * (size_t) buf_w) + (size_t) px) * 3u;
                    d[0] = rkt_ink_rgb[ink][0];
                    d[1] = rkt_ink_rgb[ink][1];
                    d[2] = rkt_ink_rgb[ink][2];
                }
            }
        }
        pen += (int32_t) g.advance + track;
    }
    return missing;
}

/* ---------------------------------------------------------------- dates */

static bool digits(const char *s, int n, int *out)
{
    int v = 0;
    for (int i = 0; i < n; ++i) {
        const unsigned char c = (unsigned char) s[i];
        if (c < (unsigned char) '0' || c > (unsigned char) '9') { return false; }
        v = v * 10 + (int) (c - (unsigned char) '0');
    }
    *out = v;
    return true;
}

static bool prec_is(const char *p, const char *want)
{
    if (p == NULL) { return false; }
    size_t i = 0;
    for (; p[i] != '\0' && want[i] != '\0'; ++i) {
        const unsigned char a = (unsigned char) p[i];
        const unsigned char b = (unsigned char) want[i];
        const unsigned char la = (a >= 'A' && a <= 'Z') ? (unsigned char)(a - 'A' + 'a') : a;
        if (la != b) { return false; }
    }
    return p[i] == '\0' && want[i] == '\0';
}

void rkt_fmt_when(const char *iso, const char *precision, char *out, size_t out_len)
{
    /* Uppercased already: poster.py calls .upper() on the result, and Python's
     * .upper() is full Unicode while C toupper() is ASCII/locale -- so the
     * table is stored in the final form instead of being case-mapped here. */
    static const char *MONTH[12] = { "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                                     "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" };
    if (out == NULL || out_len == 0u) { return; }
    out[0] = '\0';
    if (iso == NULL || strlen(iso) < 20u) { return; }

    int Y, M, D, h, m;
    if (!digits(iso, 4, &Y) || iso[4] != '-' ||
        !digits(iso + 5, 2, &M) || iso[7] != '-' ||
        !digits(iso + 8, 2, &D) || iso[10] != 'T' ||
        !digits(iso + 11, 2, &h) || iso[13] != ':' ||
        !digits(iso + 14, 2, &m) || iso[16] != ':' || iso[19] != 'Z') {
        return;                      /* poster.py returns "" on a parse failure */
    }
    if (M < 1 || M > 12) { return; }

    /* "%d %b %Y · %H:%M UTC" -- the middot is U+00B7, two bytes in UTF-8.
     * Cut to what LL2 actually knows; see the header. */
    const char *mon = MONTH[M - 1];
    char buf[64];
    int n;
    if (prec_is(precision, "year")) {
        n = snprintf(buf, sizeof buf, "%04d", Y);
    } else if (prec_is(precision, "month")) {
        n = snprintf(buf, sizeof buf, "%s %04d", mon, Y);
    } else if (prec_is(precision, "day")) {
        n = snprintf(buf, sizeof buf, "%02d %s %04d", D, mon, Y);
    } else {
        n = snprintf(buf, sizeof buf, "%02d %s %04d \xC2\xB7 %02d:%02d UTC",
                     D, mon, Y, h, m);
    }
    if (n < 0 || (size_t) n >= out_len) { return; }
    memcpy(out, buf, (size_t) n + 1u);
}
