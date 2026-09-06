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

#include "../renderer/rocket_render.h"

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
        fprintf(stderr, "usage: %s <card-dir> <plate.rkt> <family>\n", argv[0]);
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

    rocket_scene_t s = {
        .plate = &plate, .body = &body, .body_mask = &bmask, .key_mask = &kmask,
        .dark = (body.hdr.flags & 1u) != 0u,
        .field_ink = 1u,
    };

    uint8_t *rgb = (uint8_t *) calloc((size_t) ROCKET_W * ROCKET_SCENE_H * 3u, 1);
    uint16_t rows = rocket_render_scene(&s, rgb);
    if (rows != ROCKET_SCENE_H) {
        fprintf(stderr, "  short frame: %u of %u rows\n", rows, ROCKET_SCENE_H);
        return 1;
    }

    /* Raw RGB888 to stdout; the Python side does the diff against the golden,
     * so this binary needs no PNG decoder and no image library at all. */
    fwrite(rgb, 1, (size_t) ROCKET_W * ROCKET_SCENE_H * 3u, stdout);
    free(rgb); free(o1); free(o2); free(o3); free(o4);
    return 0;
}
