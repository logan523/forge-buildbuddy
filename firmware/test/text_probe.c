/* Draw one string with one atlas and dump RGB888, so the Python side can diff
 * it against typeset.tracked(). Isolates the text engine from the band layout:
 * when the full poster differs, this says whether the glyphs or the geometry
 * is at fault. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../renderer/rocket_text.h"

#define PW 700
#define PH 90

static uint8_t *slurp(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    if (n <= 0) { fclose(f); return NULL; }
    uint8_t *b = malloc((size_t) n);
    size_t got = 0, r;
    while (got < (size_t) n && (r = fread(b + got, 1, (size_t) n - got, f)) > 0) got += r;
    fclose(f);
    if (got != (size_t) n) { free(b); return NULL; }
    *len = got; return b;
}

int main(int argc, char **argv)
{
    if (argc < 4) { fprintf(stderr, "usage: %s <atlas.atl> <string> <track>\n", argv[0]); return 2; }
    size_t len = 0;
    uint8_t *raw = slurp(argv[1], &len);
    if (!raw) { fprintf(stderr, "cannot read %s\n", argv[1]); return 1; }

    rkt_header_t h;
    if (!rkt_parse_header(raw, len, &h)) { fprintf(stderr, "bad atlas header\n"); return 1; }
    rkt_atlas_t a;
    if (!rkt_atlas_open(raw + RKT_HEADER_BYTES, len - RKT_HEADER_BYTES, &a)) {
        fprintf(stderr, "bad atlas body\n"); return 1;
    }

    uint8_t *rgb = malloc((size_t) PW * PH * 3);
    memset(rgb, 0xFF, (size_t) PW * PH * 3);          /* white ground */
    int miss = rkt_text_draw(rgb, PW, PH, 10, 10, argv[2], &a, atoi(argv[3]), 0 /*black*/);
    if (miss) fprintf(stderr, "  %d glyph(s) had no atlas entry\n", miss);
    fprintf(stderr, "  width=%d\n", rkt_text_width(&a, argv[2], atoi(argv[3])));
    fwrite(rgb, 1, (size_t) PW * PH * 3, stdout);
    return 0;
}
