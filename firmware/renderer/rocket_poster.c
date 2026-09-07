/*
 * The whole poster: scene above, type in a band below.
 *
 * Reproduces poster.py:_band_text() at band="bottom", which is the only band
 * the device renders. Every constant here is the value Python actually
 * computes, not the value the formula looks like it should give -- see VEH_X
 * in rocket_render.c for what that distinction cost the first time.
 */
#include "rocket_poster.h"

#include <stdio.h>
#include <string.h>

#define BAND_Y0   ROCKET_SCENE_H          /* 336 */
#define COLW      (ROCKET_W - 48)         /* 752 */
#define INK_BLACK 0u
#define INK_RED   2u
#define INK_WHITE 1u

/*
 * Tracking values, pre-rounded to the integers Python uses.
 *
 * typeset takes float tracks but immediately does int(round(track)) for both
 * measuring and stepping. Python's round() is BANKER'S -- round-half-to-even --
 * so 0.5 becomes 0, not 1. Rounding these here, once, keeps every float out of
 * the renderer.
 *
 *   2.0 -> 2   1.6 -> 2   1.2 -> 1   1.0 -> 1
 *   0.9 -> 1   0.6 -> 1   0.5 -> 0   0.3 -> 0
 */
#define TRK_HEAD 2

static const int32_t LINE2_SIZES[] = { 13, 12, 12 };
static const int32_t LINE2_TRACKS[] = { 2, 1, 0 };
static const int32_t META_SIZES[]  = { 11, 10 };
static const int32_t META_TRACKS[] = { 1, 1, 0 };
/* Provider + launch site. Fitted against WHO_MAX_W, not COLW: draw_centred
 * centres on the full 800px frame, so a line wider than ~660 starts left of
 * x=70 and runs under the flag (x=30..70, y=436..461). */
#define WHO_MAX_W 620
static const int32_t WHO_SIZES[]   = { 10, 9 };
static const int32_t WHO_TRACKS[]  = { 1, 0 };
static const int32_t STATS_SIZES[]  = { 9 };
static const int32_t STATS_TRACKS[] = { 1, 0 };
static const int32_t PREV_SIZES[]  = { 10, 9 };
static const int32_t PREV_TRACKS[] = { 1, 0 };

/*
 * x for a centred run: Python computes x0 + (x1 - x0 - w) / 2 as a float and
 * typeset.tracked does int(round(x)). round() is banker's, so an odd (800 - w)
 * lands on .5 and rounds to the EVEN integer. Done in integers here.
 */
static void fill_rect(uint8_t *rgb, int32_t x0, int32_t y0,
                      int32_t x1, int32_t y1, uint8_t ink)
{
    if (ink >= RKT_INK_COUNT) { return; }
    for (int32_t y = y0; y <= y1; ++y) {
        if (y < 0 || y >= ROCKET_H) { continue; }
        for (int32_t x = x0; x <= x1; ++x) {
            if (x < 0 || x >= ROCKET_W) { continue; }
            uint8_t *p = rgb + (((size_t) y * ROCKET_W) + (size_t) x) * 3u;
            p[0] = rkt_ink_rgb[ink][0];
            p[1] = rkt_ink_rgb[ink][1];
            p[2] = rkt_ink_rgb[ink][2];
        }
    }
}


static int32_t centre_x(int32_t w)
{
    const int32_t num = ROCKET_W - w;      /* x0 = 0 */
    if ((num & 1) == 0) {
        return num / 2;
    }
    /* num is odd -> num/2 is X.5 -> round half to even */
    const int32_t lo = (num - 1) / 2;
    return ((lo & 1) == 0) ? lo : lo + 1;
}

static const rkt_atlas_t *pick(const rocket_fonts_t *f, int face, int32_t size)
{
    for (int i = 0; i < f->count; ++i) {
        if (f->atlas[i].face == (uint16_t) face &&
            f->atlas[i].size == (uint16_t) size) {
            return &f->atlas[i];
        }
    }
    return NULL;
}

/* typeset.fit_wrap: shrink until the WRAPPED LINES fit, not just the string. */
static const rkt_atlas_t *fit_wrap(const rocket_fonts_t *f, int face,
                                   const char *s, int32_t max_w,
                                   int32_t start, int32_t floor_, int32_t track,
                                   int max_lines, char *lines, size_t stride,
                                   int *n_lines)
{
    for (int32_t size = start; size >= floor_; size -= 2) {
        const rkt_atlas_t *a = pick(f, face, size);
        if (a == NULL) { continue; }
        const int n = rkt_text_wrap(a, s, max_w, lines, stride, max_lines + 1);
        if (n > max_lines) { continue; }
        bool all_fit = true;
        for (int i = 0; i < n; ++i) {
            if (rkt_text_width(a, lines + (size_t) i * stride, track) > max_w) {
                all_fit = false;
                break;
            }
        }
        if (all_fit) { *n_lines = n; return a; }
    }
    /* Floor: truncate rather than overflow. A shortened headline is
     * recoverable; one running under the rocket is not. */
    const rkt_atlas_t *a = pick(f, face, floor_);
    if (a == NULL) { *n_lines = 0; return NULL; }
    *n_lines = rkt_text_wrap(a, s, max_w, lines, stride, max_lines);
    for (int i = 0; i < *n_lines; ++i) {
        char *ln = lines + (size_t) i * stride;
        while (ln[0] != '\0' && rkt_text_width(a, ln, track) > max_w) {
            ln[strlen(ln) - 1u] = '\0';
        }
    }
    return a;
}

/* typeset.fit_tracked: shed letter-spacing before size, truncate at the floor. */
static const rkt_atlas_t *fit_tracked(const rocket_fonts_t *f, int face,
                                      char *s, int32_t max_w,
                                      const int32_t *sizes, int n_sizes,
                                      const int32_t *tracks, int n_tracks,
                                      int32_t *out_track)
{
    for (int i = 0; i < n_sizes; ++i) {
        const rkt_atlas_t *a = pick(f, face, sizes[i]);
        if (a == NULL) { continue; }
        for (int j = 0; j < n_tracks; ++j) {
            if (rkt_text_width(a, s, tracks[j]) <= max_w) {
                *out_track = tracks[j];
                return a;
            }
        }
    }
    const rkt_atlas_t *a = pick(f, face, sizes[n_sizes - 1]);
    *out_track = tracks[n_tracks - 1];
    if (a == NULL) { return NULL; }
    /* "…" is U+2026, which the atlas does not carry -- the bake is ASCII plus
     * U+00B7. Trim to fit instead of appending a glyph that would be dropped. */
    while (s[0] != '\0' && rkt_text_width(a, s, *out_track) > max_w) {
        s[strlen(s) - 1u] = '\0';
    }
    return a;
}

/*
 * Drop the last " · "-joined fact from `s`. Mirrors poster.py popping the last
 * element before re-joining: the facts themselves never contain U+00B7, so the
 * last separator is unambiguously the last join. Returns false when only one
 * fact remains, which the caller then renders (possibly shrunk) rather than
 * emptying the line.
 */
static bool drop_last_fact(char *s)
{
    const size_t n = strlen(s);
    if (n < 5u) { return false; }
    /* " \xC2\xB7 " -- space, U+00B7, space */
    for (size_t i = n - 4u; i > 0u; --i) {
        if (s[i] == ' ' && (unsigned char) s[i + 1u] == 0xC2u &&
            (unsigned char) s[i + 2u] == 0xB7u && s[i + 3u] == ' ') {
            s[i] = '\0';
            return true;
        }
    }
    return false;
}

static void draw_centred(uint8_t *rgb, const rkt_atlas_t *a, const char *s,
                         int32_t y, int32_t track, uint8_t ink)
{
    if (a == NULL || s == NULL || s[0] == '\0') { return; }
    const int32_t w = rkt_text_width(a, s, track);
    rkt_text_draw(rgb, ROCKET_W, ROCKET_H, centre_x(w), y, s, a, track, ink);
}

uint16_t rocket_render_poster(const rocket_scene_t *scene,
                              const rocket_record_t *rec,
                              const rocket_fonts_t *fonts,
                              const rkt_layer_t *flag,
                              uint8_t *rgb)
{
    if (scene == NULL || rec == NULL || fonts == NULL || rgb == NULL) {
        return 0u;
    }

    /* --- scene, then the band --- */
    (void) rocket_render_scene(scene, rgb);

    /* The band is always WHITE, not the destination field colour. poster.py
     * paints it unconditionally over whatever the generated plate put there:
     * the prompt asks for that region to be left plain and is never trusted
     * to comply. */
    fill_rect(rgb, 0, BAND_Y0, ROCKET_W - 1, ROCKET_H - 1, INK_WHITE);

    /* A 5-row black rule separates band from scene. PIL's rectangle is
     * INCLUSIVE of both corners, so [0, 336, W, 336+4] is rows 336..340. */
    fill_rect(rgb, 0, BAND_Y0, ROCKET_W - 1, BAND_Y0 + 4, INK_BLACK);

    char lines[3][256];
    int n = 0;
    int32_t y = BAND_Y0 + 14;

    /* --- destination headline --- */
    const rkt_atlas_t *fh = fit_wrap(fonts, RKT_FACE_XCONDENSED, rec->destination,
                                     COLW, 37, 18, TRK_HEAD, 1,
                                     &lines[0][0], sizeof lines[0], &n);
    for (int i = 0; i < n; ++i) {
        draw_centred(rgb, fh, lines[i], y, TRK_HEAD, INK_BLACK);
        y += (int32_t) fh->size + 3;
    }
    y += 5;

    /* --- mission · rocket --- */
    char l2[256];
    snprintf(l2, sizeof l2, "%s", rec->line2);
    int32_t t2 = 0;
    const rkt_atlas_t *f2 = fit_tracked(fonts, RKT_FACE_MEDIUM, l2, COLW,
                                        LINE2_SIZES, 3, LINE2_TRACKS, 3, &t2);
    if (f2 != NULL) {
        draw_centred(rgb, f2, l2, y, t2, INK_RED);
        y += (int32_t) f2->size + 5;
    }

    /* --- date --- */
    char meta[64];
    rkt_fmt_when(rec->t0_utc, rec->precision, meta, sizeof meta);
    int32_t t3 = 0;
    const rkt_atlas_t *f3 = fit_tracked(fonts, RKT_FACE_MEDIUM, meta, COLW,
                                        META_SIZES, 2, META_TRACKS, 3, &t3);
    if (f3 != NULL) {
        draw_centred(rgb, f3, meta, y, t3, INK_BLACK);
        y += (int32_t) f3->size + 4;
    }

    /* --- provider · launch site --- */
    if (rec->who[0] != '\0') {
        char who[192];
        snprintf(who, sizeof who, "%s", rec->who);
        int32_t t5 = 0;
        const rkt_atlas_t *f5 = fit_tracked(fonts, RKT_FACE_MEDIUM, who, WHO_MAX_W,
                                            WHO_SIZES, 2, WHO_TRACKS, 2, &t5);
        if (f5 != NULL) {
            draw_centred(rgb, f5, who, y, t5, INK_BLACK);
            y += (int32_t) f5->size + 5;
        }
    }

    /* --- programme + this launch's ordinals --- */
    if (rec->stats[0] != '\0') {
        char st[320];
        snprintf(st, sizeof st, "%s", rec->stats);
        /* Shed whole facts before shrinking, exactly as poster.py does: a
         * fragment on the wall is worse than one fewer fact. */
        const rkt_atlas_t *floor_a = pick(fonts, RKT_FACE_MEDIUM,
                                         STATS_SIZES[(sizeof STATS_SIZES / sizeof STATS_SIZES[0]) - 1]);
        while (floor_a != NULL && rkt_text_width(floor_a, st, 0) > WHO_MAX_W) {
            if (!drop_last_fact(st)) { break; }
        }
        int32_t t6 = 0;
        const rkt_atlas_t *f6 = fit_tracked(fonts, RKT_FACE_MEDIUM, st, WHO_MAX_W,
                                            STATS_SIZES, 1, STATS_TRACKS, 2, &t6);
        if (f6 != NULL) {
            draw_centred(rgb, f6, st, y, t6, INK_BLACK);
            y += (int32_t) f6->size + 4;
        }
    }

    /* --- one line about the mission --- */
    {
        const rkt_atlas_t *f7 = pick(fonts, RKT_FACE_MEDIUM, 9);
        const char *pick_txt = NULL;
        if (f7 != NULL) {
            if (rec->blurb[0] != '\0' &&
                rkt_text_width(f7, rec->blurb, 0) <= WHO_MAX_W) {
                pick_txt = rec->blurb;
            } else if (rec->blurb_alt[0] != '\0' &&
                       rkt_text_width(f7, rec->blurb_alt, 0) <= WHO_MAX_W) {
                pick_txt = rec->blurb_alt;
            }
        }
        if (pick_txt != NULL) {
            draw_centred(rgb, f7, pick_txt, y, 0, INK_BLACK);
            y += (int32_t) f7->size + 4;
        }
    }

    /* --- previous launch --- */
    if (rec->prev_line[0] != '\0') {
        char prev[128];
        snprintf(prev, sizeof prev, "%s", rec->prev_line);
        int32_t t4 = 0;
        const rkt_atlas_t *f4 = fit_tracked(fonts, RKT_FACE_MEDIUM, prev, COLW,
                                            PREV_SIZES, 2, PREV_TRACKS, 2, &t4);
        draw_centred(rgb, f4, prev, y, t4, INK_RED);
    }

    /* --- flag: baked, at the fixed rect poster.py draws it in --- */
    if (flag != NULL && flag->data != NULL) {
        const uint16_t fw = flag->hdr.width, fh_ = flag->hdr.height;
        for (uint16_t fy = 0u; fy < fh_; ++fy) {
            for (uint16_t fx = 0u; fx < fw; ++fx) {
                const int32_t px = 30 + (int32_t) fx;
                const int32_t py = 436 + (int32_t) fy;
                if (px < 0 || py < 0 || px >= ROCKET_W || py >= ROCKET_H) { continue; }
                const uint8_t ink = rkt_index_at(flag->data, fw, fx, fy);
                if (ink >= RKT_INK_COUNT) { continue; }
                uint8_t *p = rgb + (((size_t) py * ROCKET_W) + (size_t) px) * 3u;
                p[0] = rkt_ink_rgb[ink][0];
                p[1] = rkt_ink_rgb[ink][1];
                p[2] = rkt_ink_rgb[ink][2];
            }
        }
    }

    return (uint16_t) ROCKET_H;
}
