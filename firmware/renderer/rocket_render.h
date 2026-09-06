/*
 * The poster, composed on the device.
 *
 * Scope, deliberately narrow: the scene region only (800x336 at band=bottom).
 * The type band is drawn separately by the text engine. The split is clean --
 * measured, the two regions do not overlap -- and the scene half is exactly
 * "blit a plate, composite a vehicle through two masks", which is what makes
 * it provable against the frozen goldens with no PIL on either side.
 *
 * The renderer owns no display state and calls nothing from ESP-IDF. It fills
 * caller-supplied RGB888, which is what display_manager_show_rgb_buffer()
 * takes ("already dithered to palette"). The same object file is the host
 * conformance binary and the firmware.
 */
#ifndef ROCKET_RENDER_H
#define ROCKET_RENDER_H

#include <stdbool.h>
#include <stdint.h>

#include "rocket_card.h"

#define ROCKET_W       800
#define ROCKET_H       480
#define ROCKET_BAND_H  144
#define ROCKET_SCENE_H (ROCKET_H - ROCKET_BAND_H)   /* 336 */

/* One decoded layer: header plus a pointer to its packed payload. */
typedef struct {
    rkt_header_t   hdr;
    const uint8_t *data;
} rkt_layer_t;

/* Everything the scene half needs. A NULL plate paints the flat field; a NULL
 * vehicle draws nothing. Coverage never has a hole, only a lower floor. */
typedef struct {
    const rkt_layer_t *plate;      /* 800x336 4bpp, or NULL */
    const rkt_layer_t *body;       /* vehicle body, 4bpp, or NULL */
    const rkt_layer_t *body_mask;  /* 1bpp, same size as body */
    const rkt_layer_t *key_mask;   /* 1bpp dilated alpha, same size as body */
    bool               dark;       /* keyline is white when the body is dark */
    uint8_t            field_ink;  /* palette index behind everything */
} rocket_scene_t;

/*
 * Fill `rgb` (ROCKET_W * ROCKET_SCENE_H * 3 bytes) with the scene.
 *
 * Returns the number of rows written. The caller must refuse to show a frame
 * whose row count is short: begin_rgb_stream() clears to WHITE, and
 * push_rgb_row() reports success for an out-of-range y, so a truncated frame
 * paints a white band and reports OK.
 */
uint16_t rocket_render_scene(const rocket_scene_t *s, uint8_t *rgb);

#endif /* ROCKET_RENDER_H */
