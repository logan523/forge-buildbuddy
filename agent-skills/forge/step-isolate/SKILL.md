---
name: forge-step-isolate
description: "Stage shows only parts this step touches — kitchen-table focus."
---

# Step isolate

Stage shows only parts this step touches — kitchen-table focus.

## When to use

- Group: `stage-3d`
- Step kinds: wiring, mechanical


- Keywords: 3d, show me, where is, camera, focus

## Guidance

Default workbench: isolate_step from focusPartIds or current micro-step endpoints. Overview/hero only on prep or expanded stage. Pass audit_step_render before claiming the 3D is ready.

## Tools (Forge MCP)

- `isolate_step`
- `audit_step_render`
- `get_step_facts`
- `build_wire_plan`

## Goldens

- `isolate-wiring-not-full-product`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
