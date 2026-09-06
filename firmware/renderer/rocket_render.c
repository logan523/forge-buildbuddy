#include "rocket_render.h"

#include <string.h>

/*
 * Where the vehicle sits, from poster.py:_vehicle():
 *     x = int(x0 + (x1 - x0) * 0.58)      with x0=0, x1=800
 *     y = y0 - 8                           with y0=0
 *
 * VEH_X IS 463, NOT 464, AND THAT IS NOT A TYPO.
 *
 * 0.58 has no exact binary representation, so 800 * 0.58 evaluates to
 * 463.99999999999994 and Python's int() truncates toward zero. The obvious
 * integer form, (800 * 58) / 100, gives 464 -- and shifts the entire vehicle
 * one pixel right, which is 1,198 wrong pixels per frame against the golden.
 * That is how this was found.
 *
 * The golden is the contract, so the constant is frozen here rather than
 * recomputed. Deliberately no float in this file at all: the host fuses
 * a*b+c into an FMA and Xtensa does not, so any float arithmetic is a real
 * host/device divergence waiting to happen.
 */
#define VEH_X ((int32_t) 463)
#define VEH_Y (-8)

static void put(uint8_t *rgb, int32_t x, int32_t y, uint8_t ink)
{
    if (x < 0 || y < 0 || x >= ROCKET_W || y >= ROCKET_SCENE_H) {
        return;
    }
    if (ink >= RKT_INK_COUNT) {
        return;                     /* corrupt card: refuse, never guess */
    }
    uint8_t *p = rgb + (((size_t) y * ROCKET_W) + (size_t) x) * 3u;
    p[0] = rkt_ink_rgb[ink][0];
    p[1] = rkt_ink_rgb[ink][1];
    p[2] = rkt_ink_rgb[ink][2];
}

uint16_t rocket_render_scene(const rocket_scene_t *s, uint8_t *rgb)
{
    if (s == NULL || rgb == NULL) {
        return 0u;
    }

    /* 1. flat field */
    for (int32_t y = 0; y < ROCKET_SCENE_H; ++y) {
        for (int32_t x = 0; x < ROCKET_W; ++x) {
            put(rgb, x, y, s->field_ink);
        }
    }

    /* 2. the scene plate, blitted 1:1 -- it is baked at exactly 800x336, so
     *    there is no scaling here and no resampler anywhere on the device. */
    if (s->plate != NULL && s->plate->data != NULL) {
        const uint16_t w = s->plate->hdr.width;
        const uint16_t h = s->plate->hdr.height;
        for (uint16_t y = 0; y < h; ++y) {
            for (uint16_t x = 0; x < w; ++x) {
                put(rgb, x, y, rkt_index_at(s->plate->data, w, x, y));
            }
        }
    }

    /* 3. keyline first, then the body over it. Order matters: the fuselage
     *    dissolves against a cream band without a keyline, and a dark vehicle
     *    needs a LIGHT one -- a black outline round a black body is invisible. */
    if (s->body != NULL && s->body->data != NULL &&
        s->body_mask != NULL && s->key_mask != NULL) {
        const uint16_t w = s->body->hdr.width;
        const uint16_t h = s->body->hdr.height;
        const uint8_t key_ink = s->dark ? 1u : 0u;      /* white : black */

        for (uint16_t y = 0; y < h; ++y) {
            for (uint16_t x = 0; x < w; ++x) {
                if (rkt_mask_at(s->key_mask->data, w, x, y)) {
                    put(rgb, VEH_X + (int32_t) x, VEH_Y + (int32_t) y, key_ink);
                }
            }
        }
        for (uint16_t y = 0; y < h; ++y) {
            for (uint16_t x = 0; x < w; ++x) {
                if (rkt_mask_at(s->body_mask->data, w, x, y)) {
                    put(rgb, VEH_X + (int32_t) x, VEH_Y + (int32_t) y,
                        rkt_index_at(s->body->data, w, x, y));
                }
            }
        }
    }

    return (uint16_t) ROCKET_SCENE_H;
}
