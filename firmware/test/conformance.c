/*
 * Does the C renderer reproduce the frozen goldens?
 *
 * Runs the SAME translation units the firmware links. If this is green, the
 * device build is green too -- same code, same card bytes, same integers.
 *
 * Compares the SCENE REGION only for now (rows 0..335). The type band is the
 * text engine's half and is not written yet; comparing it would just report a
 * difference we already know about, which is noise, not a gate.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../renderer/rocket_poster.h"

static uint8_t *slurp(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL) { return NULL; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n <= 0) { fclose(f); return NULL; }
    uint8_t *buf = (uint8_t *) malloc((size_t) n);
    /* Loop on the count. fread on a local file essentially never returns
     * short, which is exactly why code that ignores it passes here and
     * corrupts against FATFS on the device. */
    size_t got = 0;
    while (got < (size_t) n) {
        size_t r = fread(buf + got, 1, (size_t) n - got, f);
        if (r == 0) { break; }
        got += r;
    }
    fclose(f);
    if (got != (size_t) n) { free(buf); return NULL; }
    *len = got;
    return buf;
}

static int load_layer(const char *path, rkt_layer_t *out, uint8_t **owned)
{
    size_t len = 0;
    uint8_t *raw = slurp(path, &len);
    if (raw == NULL) { fprintf(stderr, "  cannot read %s\n", path); return 0; }
    if (!rkt_parse_header(raw, len, &out->hdr)) {
        fprintf(stderr, "  bad header in %s\n", path); free(raw); return 0;
    }
    size_t need = rkt_payload_bytes(&out->hdr);
    if (len < RKT_HEADER_BYTES + need) {
        fprintf(stderr, "  %s truncated: have %zu need %zu\n",
                path, len, RKT_HEADER_BYTES + need);
        free(raw); return 0;
    }
    out->data = raw + RKT_HEADER_BYTES;
    *owned = raw;
    return 1;
}

int main(int argc, char **argv)
{
    if (argc < 4) {
        fprintf(stderr, "usage: %s <card> <plate.rkt> <family> "
                        "[atlas-list] [flag] [dest] [line2] [t0] [prev] [who]\n", argv[0]);
        return 2;
    }
    const char *card = argv[1], *plate_rel = argv[2], *fam = argv[3];
    char path[1024];
    rkt_layer_t plate, body, bmask, kmask;
    uint8_t *o1 = NULL, *o2 = NULL, *o3 = NULL, *o4 = NULL;

    snprintf(path, sizeof path, "%s/%s", card, plate_rel);
    if (!load_layer(path, &plate, &o1)) { return 1; }
    snprintf(path, sizeof path, "%s/vehicles/%s.body.rkt", card, fam);
    if (!load_layer(path, &body, &o2)) { return 1; }
    snprintf(path, sizeof path, "%s/vehicles/%s.body.msk", card, fam);
    if (!load_layer(path, &bmask, &o3)) { return 1; }
    snprintf(path, sizeof path, "%s/vehicles/%s.key.msk", card, fam);
    if (!load_layer(path, &kmask, &o4)) { return 1; }

    /* Load every atlas the card carries, and the flag if one was named. */
    rocket_fonts_t fonts = { .count = 0 };
    static uint8_t *atlas_raw[24];
    if (argc >= 5) {
        FILE *lst = fopen(argv[4], "r");
        if (lst != NULL) {
            char rel[512];
            while (fgets(rel, sizeof rel, lst) != NULL && fonts.count < 24) {
                rel[strcspn(rel, "\r\n")] = '\0';
                if (rel[0] == '\0') { continue; }
                snprintf(path, sizeof path, "%s/%s", card, rel);
                size_t alen = 0;
                uint8_t *araw = slurp(path, &alen);
                if (araw == NULL) { continue; }
                rkt_header_t ah;
                if (!rkt_parse_header(araw, alen, &ah)) { free(araw); continue; }
                if (rkt_atlas_open(araw + RKT_HEADER_BYTES, alen - RKT_HEADER_BYTES,
                                   &fonts.atlas[fonts.count])) {
                    atlas_raw[fonts.count] = araw;
                    fonts.count++;
                } else { free(araw); }
            }
            fclose(lst);
        }
    }
    rkt_layer_t flag; uint8_t *o5 = NULL; int have_flag = 0;
    if (argc >= 6 && argv[5][0] != '\0') {
        snprintf(path, sizeof path, "%s/flags/%s.rkt", card, argv[5]);
        have_flag = load_layer(path, &flag, &o5);
    }

    rocket_scene_t s = {
        .plate = &plate, .body = &body, .body_mask = &bmask, .key_mask = &kmask,
        .dark = (body.hdr.flags & 1u) != 0u,
        .field_ink = 1u,
    };

    rocket_record_t rec = { {0}, {0}, {0}, {0}, {0} };
    if (argc >= 10) {
        snprintf(rec.destination, sizeof rec.destination, "%s", argv[6]);
        snprintf(rec.line2,       sizeof rec.line2,       "%s", argv[7]);
        snprintf(rec.t0_utc,      sizeof rec.t0_utc,      "%s", argv[8]);
        snprintf(rec.prev_line,   sizeof rec.prev_line,   "%s", argv[9]);
        if (argc >= 11) {
            snprintf(rec.who, sizeof rec.who, "%s", argv[10]);
        }
    }

    uint8_t *rgb = (uint8_t *) calloc((size_t) ROCKET_W * ROCKET_H * 3u, 1);
    uint16_t rows = rocket_render_poster(&s, &rec, &fonts,
                                         have_flag ? &flag : NULL, rgb);
    if (rows != ROCKET_H) {
        fprintf(stderr, "  short frame: %u of %u rows\n", rows, ROCKET_H);
        return 1;
    }

    /* Raw RGB888 to stdout; the Python side does the diff against the golden,
     * so this binary needs no PNG decoder and no image library at all. */
    fwrite(rgb, 1, (size_t) ROCKET_W * ROCKET_H * 3u, stdout);
    free(rgb); free(o1); free(o2); free(o3); free(o4); free(o5);
    for (int i = 0; i < fonts.count; ++i) { free(atlas_raw[i]); }
    return 0;
}
