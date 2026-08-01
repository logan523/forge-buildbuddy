---
name: forge-wire-one-net
description: "One physical wire at a time from compiled connections."
---

# Wire one net

One physical wire at a time from compiled connections.

## When to use

- Group: `core-build`
- Step kinds: wiring
- Net classes: gnd, ground, power, signal, digital, analog, i2c



## Guidance

Use get_step_facts / micro-steps. Order: GND → power → signal. Color from wire-color authority only. Action = silkscreen labels at both ends. Do not paraphrase into ordinal pin positions.

## Tools (Forge MCP)

- `get_step_facts`
- `build_wire_plan`
- `isolate_step`
- `audit_step_render`

## Goldens

- `wire-one-color-authority`
- `wire-one-no-ordinal-pins`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
