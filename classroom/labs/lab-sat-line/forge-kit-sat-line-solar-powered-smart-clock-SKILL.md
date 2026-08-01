---
name: forge-kit-sat-line-solar-powered-smart-clock
description: "Build kit: Sat Line: Solar-Powered Smart Clock"
---

# Kit: Sat Line: Solar-Powered Smart Clock

A smart clock that automatically synchronizes time over Wi-Fi, displays real-time temperature and humidity, and runs on solar power with battery backup. Built around an ESP32-C3 microcontroller with a 0.96" OLED display.

Author: Forge Classroom

## Goal

Help a beginner complete this kit using Forge MCP tools and the recommended skills.

## Recommended skills

- `forge-part-identify` (or repo skill `part-identify`)
- `forge-step-isolate` (or repo skill `step-isolate`)
- `forge-i2c-ssd1306` (or repo skill `i2c-ssd1306`)
- `forge-wire-one-net` (or repo skill `wire-one-net`)
- `forge-esp32c3-flash` (or repo skill `esp32c3-flash`)

## Tools

- `compile_plan` / `get_step_facts` — instruction truth
- `audit_plan` — table + 3D + render integrity
- `run_tasks` — offline task suite when plan is Sat Line-class
- `expected_i2c` — addresses for live verify
- Live: `flash_firmware` / serial only in the Forge web app

## Expected I2C (if any)

- OLED display: 0x3c / 0x3d
- temp/humidity sensor: 0x44 / 0x45

## Rules

1. Load the kit plan JSON into tools that require `plan`.
2. Never invent pins — only compiled connections.
3. After wiring software steps, prefer live I2C verify when a board is available.
