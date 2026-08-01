---
name: forge-isolation-walk
description: "Binary-search which add-on broke the build."
---

# Isolation walk

Binary-search which add-on broke the build.

## When to use

- Group: `debug`


- Symptoms: blank_display, no_power, sensor_wrong, touch_dead, general
- Keywords: stuck, broken, doesn't work, not working, isolation

## Guidance

Use diagnose + isolation walk: add modules one at a time until it breaks. Culprit is the last added part or its wires. Do not re-author the netlist in chat — open the matching wiring step facts.

## Tools (Forge MCP)

- `diagnose`
- `get_step_facts`
- `verify_expected_devices`

## Goldens

- `isolation-culprit-last-added`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
