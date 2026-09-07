/*
 * One wake of the rocket frame.
 *
 * The states are distinct on purpose. The abstain rule ("leave the panel
 * alone") makes every failure look identical on the wall, so the difference
 * has to survive somewhere a person can reach without a USB cable -- the boot
 * log, and the device's own status page.
 */
#ifndef ROCKET_APP_H
#define ROCKET_APP_H

/* Bumped by bake_assets.py when the on-card layout changes. The firmware
 * refuses a version it does not know rather than misreading one. */
#define ROCKET_CARD_FORMAT 1

#ifndef ROCKET_BOARD_NAME
#define ROCKET_BOARD_NAME "waveshare_photopainter_73"
#endif

typedef enum {
    ROCKET_FRESH = 0,      /* fetched, rendered, panel redrawn                */
    ROCKET_UNCHANGED,      /* same launch as last wake; no refresh spent      */
    ROCKET_NO_SD,          /* card absent or unreadable; panel untouched      */
    ROCKET_BAD_CARD,       /* manifest/layer unusable; panel untouched        */
    ROCKET_NO_NETWORK,     /* fetch or parse failed; panel untouched          */
    ROCKET_BUDGET_SPENT,   /* 15/hr exhausted, or upstream said 429           */
    ROCKET_NEVER_CONFIGURED, /* no wifi yet -- NOT the same as no-network     */
} rocket_state_t;

rocket_state_t rocket_app_run(void);

#endif /* ROCKET_APP_H */
