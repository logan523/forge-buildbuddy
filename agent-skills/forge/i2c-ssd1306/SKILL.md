---
name: forge-i2c-ssd1306
description: "SDA/SCL colors, addresses 0x3C/0x3D, blank-display rescue."
---

# I2C SSD1306

SDA/SCL colors, addresses 0x3C/0x3D, blank-display rescue.

## When to use

- Group: `buses`
- Step kinds: wiring, verify, software
- Net classes: i2c
- Symptoms: blank_display
- Keywords: oled, ssd1306, sda, scl, i2c

## Guidance

SDA is blue, SCL is yellow (class authority). Expected addresses include 0x3C and 0x3D. Blank display → diagnose blank_display, check power first then swap SDA/SCL. Never invent a third I2C pin.

## Tools (Forge MCP)

- `get_step_facts`
- `verify_expected_devices`
- `diagnose`
- `isolate_step`

## Goldens

- `i2c-sda-blue-scl-yellow`
- `i2c-addr-alt-ok`

## Rules

1. Pins and wire colors come only from compiled connections / wire-color authority.
2. Never invent ordinal pin positions (leftmost/rightmost).
3. Prefer isolate_step + get_step_facts over freeform prose.
4. Live flash/serial requires the Forge web app (MCP returns live-required offline).
