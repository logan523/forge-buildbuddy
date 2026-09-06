/*
 * The on-card asset format, read the way an embedded target must read it.
 *
 * Every rule here exists because the host build and the device build must
 * agree byte-for-byte, and the ways they diverge are known:
 *
 *   - No struct is ever cast over file bytes. Xtensa faults on unaligned
 *     32-bit loads that x86-64 absorbs; the header is decoded field by field.
 *   - Fixed-width types only. `long` is 32-bit on Xtensa and 64-bit on the
 *     host.
 *   - Every read loops on the returned count. FATFS f_read legitimately
 *     returns fewer bytes than asked; host fread essentially never does, so
 *     code that ignores the count passes on the host and corrupts on device.
 *   - Indices into byte arrays go through unsigned char. `char` is signed on
 *     Xtensa and on macOS-arm64, unsigned on Linux-arm64.
 *
 * Written by docs/rocket-poster-kit/bake_assets.py. Layout:
 *
 *   offset 0  "RKT1"          magic
 *   offset 4  uint8  kind     0 plate · 1 vehicle body · 2 mask · 3 flag
 *   offset 5  uint16 width    little-endian
 *   offset 7  uint16 height   little-endian
 *   offset 9  uint8  bpp      4 (indexed) or 1 (mask)
 *   offset 10 uint8  flags    bit0 = dark vehicle (keyline is white)
 *   offset 11 5 bytes reserved
 *   offset 16 packed data     4bpp: two px/byte, high nibble first
 *                             1bpp: MSB first
 */
#ifndef ROCKET_CARD_H
#define ROCKET_CARD_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define RKT_HEADER_BYTES 16
#define RKT_MAGIC_0 'R'
#define RKT_MAGIC_1 'K'
#define RKT_MAGIC_2 'T'
#define RKT_MAGIC_3 '1'

typedef enum {
    RKT_KIND_PLATE = 0,
    RKT_KIND_BODY  = 1,
    RKT_KIND_MASK  = 2,
    RKT_KIND_FLAG  = 3,
} rkt_kind_t;

typedef struct {
    uint8_t  kind;
    uint16_t width;
    uint16_t height;
    uint8_t  bpp;
    uint8_t  flags;
} rkt_header_t;

/* The six inks, in the order bake_assets.py packs indices. Nominal triples --
 * exactly what GUI_RGBToSpectra6 exact-matches. An index outside 0..5 is a
 * corrupt card, not a colour. */
#define RKT_INK_COUNT 6
extern const uint8_t rkt_ink_rgb[RKT_INK_COUNT][3];

/* true when `buf` (at least RKT_HEADER_BYTES long) is a well-formed header.
 * Fails closed: a bad magic, an unknown kind or a zero dimension is a refusal,
 * never a best-effort parse of a hostile card. */
bool rkt_parse_header(const uint8_t *buf, size_t len, rkt_header_t *out);

/* Bytes of packed data a layer of this shape occupies, header excluded. */
size_t rkt_payload_bytes(const rkt_header_t *h);

/* Palette index at (x, y) in a 4bpp layer. Caller guarantees bounds. */
uint8_t rkt_index_at(const uint8_t *data, uint16_t width, uint16_t x, uint16_t y);

/* Mask bit at (x, y) in a 1bpp layer. Caller guarantees bounds. */
bool rkt_mask_at(const uint8_t *data, uint16_t width, uint16_t x, uint16_t y);

#endif /* ROCKET_CARD_H */
