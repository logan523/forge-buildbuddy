/*
 * The whole poster, from a launch record and a card.
 *
 * Everything the device needs to turn one LL2 record into a panel-ready
 * RGB888 frame. No ESP-IDF, no float, no font rasteriser, no locale.
 */
#ifndef ROCKET_POSTER_H
#define ROCKET_POSTER_H

#include "rocket_render.h"
#include "rocket_text.h"

/* Face ids, matching typeset.py's integer constants. */
#define RKT_FACE_MEDIUM     0
#define RKT_FACE_XCONDENSED 4

/* The strings the band draws, already uppercased and joined by the caller --
 * the same shapes poster.py builds before handing them to the fit ladders. */
typedef struct {
    char destination[128];   /* "LOW EARTH ORBIT" */
    char line2[256];         /* "CREW-13  ·  FALCON 9 BLOCK 5" */
    char t0_utc[32];         /* ISO-8601 Zulu, formatted on the device */
    char prev_line[128];     /* "LAST · ... · 24 AUG 2026", or "" on first boot */
    char who[192];           /* "SPACEX · CAPE CANAVERAL SFS", or "" when unknown.
                              * Joined and uppercased by the caller, like line2.
                              * The site is only the segment before its first
                              * comma; LL2 tails these with a country name that
                              * the flag already says. */
    char stats[320];         /* "COMMERCIAL CREW PROGRAM · 227TH ORBITAL ATTEMPT
                              * OF 2026 · 402ND FROM THIS PAD", or "".
                              * Facts joined by " \xC2\xB7 "; the renderer drops
                              * whole trailing facts until the line fits, so a
                              * fragment like "344TH FOR THIS ..." never ships. */
    char precision[16];      /* LL2 net_precision: "Month", "Day", "Hour", ... */
    char blurb[256];         /* One line about the mission, or "". The caller
                              * has already picked the opening sentence, folded
                              * it to ASCII and fallen back to the mission type
                              * if it was too long -- the renderer only draws
                              * it. */
    char blurb_alt[64];      /* Shorter stand-in (LL2 mission type, e.g.
                              * "RESUPPLY") used when `blurb` will not fit.
                              * The CHOICE lives in the renderer because it is
                              * a width test, and the device has no font
                              * metrics when it parses the JSON -- deciding
                              * here is the only way both sides can agree. */
} rocket_record_t;

/* Every atlas the fit ladders can reach. Missing sizes are skipped, so a
 * partial card degrades to a larger font rather than to no text. */
typedef struct {
    rkt_atlas_t atlas[24];
    int         count;
} rocket_fonts_t;

/* Fill `rgb` (ROCKET_W * ROCKET_H * 3). Returns rows written; the caller must
 * refuse to show a frame that is short. `flag` may be NULL. */
uint16_t rocket_render_poster(const rocket_scene_t *scene,
                              const rocket_record_t *rec,
                              const rocket_fonts_t *fonts,
                              const rkt_layer_t *flag,
                              uint8_t *rgb);

#endif /* ROCKET_POSTER_H */
