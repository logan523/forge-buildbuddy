# Electrical Core (Principal-EE Scope)

## Contract

Forge’s **authority** for electrical correctness is no longer free-text wiring or the LLM alone.

```
Catalog pin roles + wiringConnections
        ↓
  ElectricalModel (refs, pins, nets, trust grades)
        ↓
  ERC (errors / warnings / info)
        ↓
  Gates: power-on ack · PCB export · kit publish
```

## Trust grades

| Grade | Meaning |
|-------|---------|
| **verified** | High-confidence catalog match with known pin roles |
| **derived** | Net named/classified from pin roles (GND, 3V3, SDA…) |
| **assumed** | Weak match or synthetic pin — user must verify silkscreen |

## ERC rules (v1)

| Rule | Severity | Source (industry practice) |
|------|----------|----------------------------|
| `VOLTAGE_DOMAIN` | error | 5V rail on pin maxVoltage &lt; 4.5V |
| `VOLTAGE_DOMAIN_SIGNAL` | error | 5V-class signal into 3.3V-only pin (e.g. HC-SR04 ECHO) |
| `LIPO_PROTECTION` | error | Cell without charger/BMS component |
| `LIPO_TOPOLOGY` | warning | Cell not proven on same net as charger |
| `GND_CONNECTIVITY` | error/warn | Missing GND net or modules off GND |
| `I2C_BUS` | warning | I2C parts without multi-member SDA/SCL |
| `I2C_PULLUP` | info | Pull-ups not mentioned in plan text |
| `OUTPUT_CONTENTION` | warning | Multiple digital_out on one signal net |
| `NET_UNBOUND` | warning | Wiring edge could not bind to components |
| `PINOUT_ASSUMED` | info | Component pinout not catalog-verified |
| `PAD_UNKNOWN` | error | Net member pin not on component pinout (not MCU GPIO) |
| `PAD_MULTI_NET` | error | Same pad on multiple disjoint signal nets |
| `MPN_UNFROZEN` | info | Catalog part lacks manufacturer MPN freeze |

## Gates

| Action | Requirement |
|--------|-------------|
| Start building | Ack if ERC errors or critical safety |
| PCB drawer / export | `erc.canExportPcb` (no errors) |
| Publish kit | `erc.canPublishKit` (no errors) |

## Files

- `src/lib/electrical/types.ts` — model + ERC types  
- `src/lib/electrical/netlist.ts` — build model from plan  
- `src/lib/electrical/schema.ts` — Zod coerce/sanitize for `structuredNets`  
- `src/lib/electrical/erc.ts` — rules engine  
- `src/lib/electrical/__golden__/` — locked netlist/ERC snapshots  
- `src/lib/trust.ts` — runs attachElectrical in pipeline  
- UI: `ErcPanel` in build-session prep  

## Hardening shipped (v1.1)

| # | Item | Status |
|---|------|--------|
| 1 | **LLM structured nets** — `structuredNets[]` on BuildPlan; L5 prompt requires them; netlist prefers them over free-text; hydrate from model when missing | ✅ |
| 2 | **Freeze catalog MPNs** — modules have `manufacturer`/`mpn`/`lcscPart`/`mpnVerifiedAt`; parts inherit; ERC `MPN_UNFROZEN` info | ✅ |
| 3 | **Pad-level ERC** — `PAD_UNKNOWN`, `PAD_MULTI_NET` block PCB export / kit publish | ✅ |
| 4 | **Golden netlist CI** — multi-fixture snapshots under `__golden__/` | ✅ |

## Hardening shipped (v1.2)

| # | Item | Status |
|---|------|--------|
| 5 | **Zod runtime schema** — `src/lib/electrical/schema.ts`; soft-coerce LLM nets (aliases, synonyms); junk → fall back to free-text; issues on `unboundEdges` | ✅ |
| 6 | **Expanded goldens** — sat-line, bare-lipo, oled-5v, multi-i2c-incomplete, pad-multi-net, empty-bom | ✅ |

## Dual audience (v1.3)

| Layer | Audience | Surface |
|-------|----------|---------|
| **Plain** | Beginner | “Wiring check” · plain title · what to do · why it matters · part names |
| **Technical** | Principal EE | Expandable per issue: rule id, designators, nets, full detail |
| **Expert netlist** | EE / debug | Collapsed netlist + ref map (U2 = ESP32-C3 …) |

Implementation: `presentErc()` maps each `ErcViolation` → beginner copy **without dropping** expert fields. Authority remains ERC.

Sat Line ships with canonical `structuredNets` so the flagship demo is ERC-clean (false multi-nets fixed).

Pipeline: L5 raw JSON → `sanitizeStructuredNets` → trust → `attachElectrical` (re-sanitize) → ERC gates → `presentErc` (UI only).

## Explicit non-goals / next backlog

Still missing for a principal-EE bar (not blockers for this slice):

| Gap | Why it matters |
|-----|----------------|
| **Current-budget / power flags** | No mA sum on rails; no KiCad-style power-pin matrix |
| **Production DRC** | Clearance, annulus, copper pour — orthogonal to ERC |
| **Multi-board / alternate MPN sets** | One frozen MPN per module; no regional LCSC vs Digi-Key matrix |
| **Automatic wiring rewrite** | ERC reports; LLM does not auto-fix nets yet |
| **Footprint ↔ pad geometry** | Pad ERC is electrical name match, not copper pad stacks |
