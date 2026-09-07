#include "rocket_card.h"

/* palette.NOMINAL in palette.INK_ORDER: black, white, red, yellow, blue, green.
 * These are the values GUI_RGBToSpectra6 exact-matches; anything else it turns
 * silently into white. */
const uint8_t rkt_ink_rgb[RKT_INK_COUNT][3] = {
    {   0,   0,   0 },  /* 0 black  */
    { 255, 255, 255 },  /* 1 white  */
    { 255,   0,   0 },  /* 2 red    */
    { 255, 255,   0 },  /* 3 yellow */
    {   0,   0, 255 },  /* 4 blue   */
    {   0, 255,   0 },  /* 5 green  */
};

static uint16_t le16(const uint8_t *p)
{
    /* Byte-wise on purpose: a uint16_t* cast here would fault on Xtensa for an
     * odd offset, and offset 5 is odd. */
    return (uint16_t) ((uint16_t) p[0] | ((uint16_t) p[1] << 8));
}

bool rkt_parse_header(const uint8_t *buf, size_t len, rkt_header_t *out)
{
    if (buf == NULL || out == NULL || len < RKT_HEADER_BYTES) {
        return false;
    }
    if (buf[0] != RKT_MAGIC_0 || buf[1] != RKT_MAGIC_1 ||
        buf[2] != RKT_MAGIC_2 || buf[3] != RKT_MAGIC_3) {
        return false;
    }
    const uint8_t kind = buf[4];
    if (kind > RKT_KIND_ATLAS) {
        return false;
    }
    const uint16_t w = le16(buf + 5);
    const uint16_t h = le16(buf + 7);
    const uint8_t bpp = buf[9];
    if (w == 0u || h == 0u) {
        return false;
    }
    if (bpp != 1u && bpp != 4u) {
        return false;
    }
    /* Pixel layers are 4bpp; masks and glyph atlases are 1bpp. A card claiming
     * otherwise is corrupt, and guessing would put the wrong bytes on a wall.
     * An earlier form of this test asked "is it a mask?" rather than "is it
     * 1bpp data?", which rejected every atlas -- they are 1bpp but not masks. */
    const bool one_bit_kind = (kind == RKT_KIND_MASK) || (kind == RKT_KIND_ATLAS);
    if (one_bit_kind != (bpp == 1u)) {
        return false;
    }
    out->kind   = kind;
    out->width  = w;
    out->height = h;
    out->bpp    = bpp;
    out->flags  = buf[10];
    return true;
}

size_t rkt_payload_bytes(const rkt_header_t *h)
{
    if (h == NULL) {
        return 0u;
    }
    const size_t w = (size_t) h->width;
    const size_t rows = (size_t) h->height;
    if (h->bpp == 4u) {
        return ((w + 1u) / 2u) * rows;   /* odd widths are padded, as baked */
    }
    return ((w + 7u) / 8u) * rows;
}

uint8_t rkt_index_at(const uint8_t *data, uint16_t width, uint16_t x, uint16_t y)
{
    const size_t stride = ((size_t) width + 1u) / 2u;
    const uint8_t byte = data[(size_t) y * stride + ((size_t) x >> 1)];
    return ((x & 1u) == 0u) ? (uint8_t) (byte >> 4) : (uint8_t) (byte & 0x0Fu);
}

bool rkt_mask_at(const uint8_t *data, uint16_t width, uint16_t x, uint16_t y)
{
    const size_t stride = ((size_t) width + 7u) / 8u;
    const uint8_t byte = data[(size_t) y * stride + ((size_t) x >> 3)];
    return (byte & (uint8_t) (0x80u >> (x & 7u))) != 0u;
}
