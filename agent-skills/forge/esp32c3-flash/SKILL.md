---
name: forge-esp32c3-flash
description: "Browser flash path: computer-ready → diag/blink → serial evidence."
---

# ESP32-C3 flash

Browser flash path: computer-ready → diag/blink → serial evidence.

## When to use

- Group: `flash-serial`
- Step kinds: software


- Keywords: flash, upload, firmware, serial, arduino, esp32

## Guidance

Open computer-ready before flash. Prefer the shipped diag firmware for I2C scan. Human must confirm flash. After flash, verify_expected_devices against catalog I2C parts. No board → static checklist only.

## Tools (Forge MCP)

- `flash_firmware`
- `serial_connect`
- `verify_expected_devices`

## Goldens

- `flash-human-confirm`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
