---
name: forge-part-identify
description: "Match the module in hand to catalog identity + silkscreen labels."
---

# Part identify

Match the module in hand to catalog identity + silkscreen labels.

## When to use

- Group: `core-build`
- Step kinds: mechanical, general, wiring


- Keywords: identify, find the, which part, looks like, unpack

## Guidance

Never invent pin order. Name pins by silkscreen only. Use part_identity and the catalog GLB/parametric for 'is this the thing I'm holding?'. If uncertain, show both name and photo/3D, not prose alone.

## Tools (Forge MCP)

- `part_identity`
- `get_step_facts`

## Goldens

- `part-id-catalog-not-prose`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
