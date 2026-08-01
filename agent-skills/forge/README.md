# Forge agent skills

Install selectively (MathWorks lesson: fewer skills → better triggers):

```bash
cp -r wire-one-net i2c-ssd1306 ~/.claude/skills/
# or
cp -r */ ~/.agents/skills/
```

Pair with the Forge MCP server:

```bash
claude mcp add --transport stdio forge -- npx tsx scripts/forge-mcp-server.mjs
```

## Catalog

- **part-identify** (`core-build`) — Match the module in hand to catalog identity + silkscreen labels.
- **wire-one-net** (`core-build`) — One physical wire at a time from compiled connections.
- **i2c-ssd1306** (`buses`) — SDA/SCL colors, addresses 0x3C/0x3D, blank-display rescue.
- **esp32c3-flash** (`flash-serial`) — Browser flash path: computer-ready → diag/blink → serial evidence.
- **step-isolate** (`stage-3d`) — Stage shows only parts this step touches — kitchen-table focus.
- **isolation-walk** (`debug`) — Binary-search which add-on broke the build.
