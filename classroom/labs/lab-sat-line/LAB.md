# Lab: Sat Line — solar smart clock

Build the demo Sat Line kit: identify parts, wire I2C OLED with authority colors, pass harness+render audits, prepare flash, and know expected I2C addresses for live verify.

**Time:** ~180 minutes

## Setup

1. Open Forge: `npm run dev`
2. Load the Sat Line demo (or set `FORGE_PLAN` to this folder's `plan.json`)
3. Optional MCP:
   ```bash
   FORGE_PLAN=classroom/labs/lab-sat-line/plan.json npm run mcp:server
   ```
4. Install skills (subset):
   ```bash
   cp -r agent-skills/forge/part-identify ~/.claude/skills/
   cp -r agent-skills/forge/wire-one-net ~/.claude/skills/
   cp -r agent-skills/forge/i2c-ssd1306 ~/.claude/skills/
   cp -r agent-skills/forge/esp32c3-flash ~/.claude/skills/
   cp -r agent-skills/forge/step-isolate ~/.claude/skills/
   cp -r agent-skills/forge/isolation-walk ~/.claude/skills/
   ```

## Offline gates (must pass before lab credit)

```bash
npm run audit:tasks
```

| Task | Title | Status |
|------|-------|--------|
| T01 | Identify every part on the table | ready |
| T02 | Wire OLED I2C (SDA/SCL + power path) | ready |
| T03 | Prep/desolder steps do not absorb nets | ready |
| T04 | Harness + instruction conformance | ready |
| T05 | Flash path is defined (offline gate) | ready |
| T06 | Expected I2C devices for verify | ready |

## In-lab

1. Prep + safety ack
2. Complete wiring steps (isolated 3D stage)
3. Flash diag firmware; confirm I2C devices
4. Celebrate only after bus verify or honest skip

## Files in this pack

- `plan.json` — BuildPlan
- `forge-kit-*-SKILL.md` — agent skill for this lab
- agent pack JSON/YAML companions
