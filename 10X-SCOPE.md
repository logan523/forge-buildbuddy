# BuildBuddy 10x: Complete Scope Expansion

> **SUPERSEDED (2026-08-24).** Historical. This prescribes a six-layer pipeline, a 500+
> module RAG database, a kit marketplace, auto-routing PCB and three build modes. CLAUDE.md
> anti-pattern #2 names much of it "all of it was noise"; the 2026-08-24 rebuild deleted the
> surface it describes. Kept for the reasoning, not the plan.


## Research Foundation

Four deep-research agents analyzed:
1. **Prompt engineering for hardware accuracy** — three-pass extraction, anti-hallucination, safety
2. **Simplest-path-to-built methodology** — lean hardware, progressive disclosure, debuggability
3. **10x platform landscape** — 20+ competitors analyzed, 17 features prioritized across 3 phases
4. **Great engineering mindset** — first-principles, Gall's Law, debugging, safety heuristics

## The Core Insight

> **"A complex system that works invariably evolved from a simple system that worked."** — Gall's Law

The current MVP does one-pass extraction. The 10x version does multi-pass with hardcoded safety validators, structured uncertainty, progressive disclosure, and a component RAG database. The AI doesn't just extract — it *thinks like a great engineer*: first-principles decomposition, "uncomfortably simple" v0, test gates between every step, and explicit "I don't know" signaling.

---

## I. The 10x AI Pipeline

### Current (MVP): Single-pass prompt → JSON

```
Transcript → Claude (one prompt) → BuildPlan JSON
```

### 10x: Six-layer progressive refinement

```
                    ┌──────────────────────────┐
                    │  LAYER 1: SAFETY (always) │
                    │  Classify hazards         │
                    │  [LIPO] [MAINS] [ESD]     │
                    │  Insert safety gates      │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LAYER 2: FIRST PRINCIPLES│
                    │  Restate goal functionally│
                    │  Challenge assumptions    │
                    │  Fermi estimate check     │
                    └────────────┬─────────────┘
                                 ▼
┌──────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
│ TRANSCRIPT   │───▶│  PASS 1: EXTRACTION (T=0)│───▶│  DOMAIN DETECT   │
│ OR TEXT      │    │  Facts only, no inference │    │  Load Layer 2    │
└──────────────┘    │  Confidence per fact      │    │  knowledge module│
                    └────────────┬─────────────┘    └────────┬─────────┘
                                 ▼                          ▼
                    ┌──────────────────────────┐    ┌──────────────────┐
                    │  PASS 2: GAP ANALYSIS    │◀───│  COMPONENT RAG   │
                    │  Identify missing specs  │    │  Lookup mentioned │
                    │  BLOCKER/ASSUMPTION/OK   │    │  parts in DB     │
                    │  Safe defaults           │    └──────────────────┘
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LAYER 3: SIMPLICITY      │
                    │  Stage into v0/v1/v2      │
                    │  Flag YAGNI complexity    │
                    │  Tool-accessibility check │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LAYER 4: PART SELECTION  │
                    │  Core-first selection     │
                    │  Sourcing filter + scoring│
                    │  Ecosystem/community check│
                    │  Alternate for every part │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  PASS 3: PLAN SYNTHESIS   │
                    │  (T=0.1)                  │
                    │  Full structured output   │
                    │  <inferred> tags          │
                    │  <blocker> tags           │
                    │  <safety-note> tags       │
                    │  Tiered shopping queries  │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LAYER 5: BUILD ORDER     │
                    │  Staged assembly          │
                    │  Test gates per stage     │
                    │  "If this fails" branches │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LAYER 6: DEBUGGING       │
                    │  Ranked failure modes     │
                    │  Isolation procedures     │
                    │  Root cause disambiguation│
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  POST-PROCESSING (no LLM) │
                    │  ┌─────────────────────┐ │
                    │  │ Wire gauge validator │ │
                    │  │ Voltage compatibility│ │
                    │  │ Pin conflict detector│ │
                    │  │ Power budget checker │ │
                    │  │ Li-ion protection    │ │
                    │  │ Mains voltage flag   │ │
                    │  │ Internal consistency │ │
                    │  └─────────────────────┘ │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  PROGRESSIVE DISCLOSURE   │
                    │  Tier 1: Quick Start      │
                    │  Tier 2: Step-by-Step     │
                    │  Tier 3: Reference        │
                    └──────────────────────────┘
```

### The Uncertainty Model

Every AI-generated fact gets provenance:

```json
{
  "source": "EXTRACTED_FROM_TRANSCRIPT | DOMAIN_KNOWLEDGE | STANDARD_PRACTICE",
  "confidence": "CERTAIN | IMPLIED | AMBIGUOUS | ASSUMED",
  "source_quote": "exact transcript text (if extracted)",
  "inference_reasoning": "why this value was chosen (if assumed)"
}
```

Ambiguous specs generate conditional branches:

```json
{
  "ambiguity": "Transcript says 'a battery' — could be 3V coin cell, 3.7V Li-ion, 4.5V (3xAA), or 9V",
  "branches": [
    { "if": "3.7V Li-ion", "add": ["TP4056", "DW01 protection"], "safety": ["Never solder to cell"] },
    { "if": "3xAA", "add": ["3xAA holder"], "safety": ["Consider boost converter if MCU needs 5V"] }
  ]
}
```

---

## II. The Component Intelligence Layer

### Curated Component Database

A RAG database of the top 500 hobby modules with:
- Verified pinouts (not training-data-inferred)
- Voltage tolerances (e.g., "HC-SR04 is NOT 3.3V tolerant despite many tutorials")
- Common pitfalls ("these OLEDs ship with address 0x78, not 0x3C")
- Community ecosystem score (library count, tutorial count, forum activity)

### Jellybean Parts Catalog

| Tier | Meaning | Examples |
|------|---------|----------|
| **Buy Anywhere** | Every hardware store, every electronics vendor | 2N3904, LM358, 555, 1/4W resistors, 100nF ceramics |
| **Electronics Store** | DigiKey, Mouser, LCSC — stocked, multi-source | ESP32 DevKit, TP4056, SSD1306 OLED, SHT31D |
| **Special Order** | Single-source, long lead time, minimum order quantity | Specialized sensors, uncommon connectors, custom magnetics |
| **Fabricate** | Must be manufactured (3D print, CNC, custom PCB) | Enclosures, mounting brackets, custom PCBs |

### Part Scoring Rubric

Every part gets scored:
- **Lifecycle status**: Active / NRND / EOL — sourced from Nexar API
- **Multi-source**: count of distributors stocking it
- **Ecosystem**: library count, tutorial count, forum mentions
- **Total cost of ownership**: part cost + shipping + minimum order + required accessories

---

## III. The Build Modes

Three modes for every project, generated automatically:

### Quick Test (v0 — "Get It Working")
- Breadboard construction
- Hot glue for mechanical
- Minimal features (core function only)
- ~1 hour to first test
- Goal: prove the concept, identify the riskiest assumption

### Full Build (v1 — "Make It Usable")
- Perfboard or stripboard
- Proper enclosure (3D printed or off-the-shelf)
- All features implemented
- ~4-8 hours
- Goal: daily-driver quality

### Production (v2 — "Make It Repeatable")
- Custom PCB (auto-routed via DeepPCB/Quilter)
- Custom 3D-printed enclosure (via Zoo/Forma AI)
- Assembly jigs and test fixtures
- ~1-2 weeks (including fab turnaround)
- Goal: reproducible, giftable, sellable

---

## IV. The Build Guide Architecture

### Step Quality Standards

A good step has:
1. **Clear completion criterion** ("you know this step is done when...")
2. **Exact actions** (specific, not strategic)
3. **One logical unit** (2-15 minutes, 1-5 physical actions)
4. **Inline verification** (test before moving on)
5. **Prerequisites stated** (what must be done first)
6. **"If this fails" branch** (ranked by real-world probability)

### Verification Checkpoint Taxonomy

| Checkpoint | When | Example |
|-----------|------|---------|
| **Power rail test** | After connecting any supply | "Measure 3.3V ±0.1V at test point TP1" |
| **Continuity check** | After soldering connectors | "Buzzer-test each pin to first component" |
| **Smoke test** | First power-up | "Current-limit through 100Ω resistor first" |
| **Firmware upload** | After MCU connection | "Upload Blink — verify MCU is alive" |
| **Sub-system test** | After each functional block | "Run sensor_test.ino — verify readings change" |
| **Integration test** | After connecting sub-systems | "Full integration test — all functions interact" |
| **End-to-end test** | Final step | "Run complete firmware — verify all features" |

### Progressive Disclosure Layout

```
┌─────────────────────────────────────────────────┐
│ TIER 1: QUICK START                              │
│ ┌─────────┐  ┌──────────────────────────────┐   │
│ │          │  │ Total cost: $25-35           │   │
│ │  Photo   │  │ Time: 3-4 hours              │   │
│ │          │  │ Difficulty: Intermediate      │   │
│ └─────────┘  │ 13 parts · 9 tools · 11 steps │   │
│              └──────────────────────────────┘   │
│ [Expand: full step-by-step ▼]                   │
└─────────────────────────────────────────────────┘
                    ↓ expand
┌─────────────────────────────────────────────────┐
│ TIER 2: STEP-BY-STEP                             │
│ ┌─────────────────────────────────────────────┐ │
│ │ Step 4/11: Connect I2C OLED Display      ✅ │ │
│ │                                             │ │
│ │ OLED GND → ESP32 GND                        │ │
│ │ OLED VCC → ESP32 3.3V (NOT 5V!)             │ │
│ │ OLED SDA → ESP32 GPIO21                     │ │
│ │ OLED SCL → ESP32 GPIO22                     │ │
│ │                                             │ │
│ │ ⚡ VERIFY: Upload I2C scanner.              │ │
│ │ Should detect device at 0x3C.               │ │
│ │                                             │ │
│ │ ▶ If fails: Check SDA/SCL not swapped.     │ │
│ │   Verify 3.3V (not 5V) at VCC pin.         │ │
│ │   Check solder joints on header pins.       │ │
│ │                                             │ │
│ │ [Mark Complete]  [I'm Stuck — Get Help]     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                    ↓ expand
┌─────────────────────────────────────────────────┐
│ TIER 3: REFERENCE                                │
│ ┌────────────┐ ┌──────────┐ ┌────────────────┐  │
│ │ Schematic  │ │ Full BOM │ │ Source Code    │  │
│ │ (SVG)      │ │ (CSV)    │ │ (download)     │  │
│ └────────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## V. Platform Features: 3-Phase Roadmap

### Phase 1: Differentiated MVP (the real launch)

| # | Feature | Difficulty | Key APIs |
|---|---------|------------|----------|
| 1 | **Real-time price comparison** across 5+ vendors | Easy | Nexar GraphQL (679 distributors), DigiKey API, Mouser API |
| 2 | **SVG wiring diagram generation** from project description | Easy | Claude generates Mermaid/SVG, template engine renders |
| 3 | **Parts bin photo analysis** — "what can I build with what I have?" | Medium | Claude Vision / GPT-4V |
| 4 | **Fork/remix of builds** with version tracking | Easy | Git + Kitspace pattern |
| 5 | **One-click PCB ordering** via PCBWay/JLCPCB | Easy | PCBWay API, JLCPCB ordering API |
| 6 | **Three-tier build modes** (Quick Test / Full Build / Production) | Easy | Prompt engineering + UI |
| 7 | **Debug checklist auto-generation** per project stage | Easy | Layer 6 prompt module |

### Phase 2: 10x Features

| # | Feature | Difficulty | Key APIs |
|---|---------|------------|----------|
| 8 | **3D enclosure generation** | Medium | Zoo Design Studio API (text→STEP), Forma AI (open source) |
| 9 | **Auto-routing PCB design** from netlist | Medium | DeepPCB API, Quilter (RL autorouter) |
| 10 | **Visual component ID from video frames** | Medium | YOLOv11 + Vision Transformer + transcript fusion |
| 11 | **Kit marketplace** — publish builds as purchasable kits | Medium | Tindie/SmallRun.net integration, JLCPCB assembly |
| 12 | **Skill tree + prerequisite checking** | Medium | Internal content architecture |
| 13 | **Component RAG database** (500+ modules, verified pinouts) | Medium | LCSC parts DB, manual curation, community contributions |

### Phase 3: Moonshots

| # | Feature | Difficulty | Key APIs |
|---|---------|------------|----------|
| 14 | **Voice-controlled build mode** | Easy | Web Speech API, Whisper, Piper TTS |
| 15 | **Total BOM cost optimization** across vendors | Medium | Nexar + optimization algorithm |
| 16 | **Automated test plan generation** | Research-grade | LLM multi-agent (ThreatLens pattern) |
| 17 | **Tariff/duty estimation** for international orders | Easy | Avalara Cross-Border MCP Server |
| 18 | **Pin conflict detection** with auto-fix | Easy | Constraint solver over pin databases |
| 19 | **Power budget auto-calculation** | Easy | Datasheet parsing + circuit analysis |
| 20 | **Social platform** — fork/PR/remix with full provenance | Medium | atopile, AllSpice, GitHub integration |

---

## VI. Safety Architecture

### Non-Negotiable Rules (hardcoded, no LLM involvement)

| Rule | Enforcement |
|------|-------------|
| Mains voltage (>50V AC) detected → mandatory safety review | Regex on voltage values |
| Li-ion without BMS/protection circuit → hard block | Pattern match on BOM |
| Wire gauge violation: current > wire rating → flag | Calculation from extracted specs |
| Exposed conductors at >24V → flag | NLP detection |
| Missing fuse on >2A power input → flag | BOM pattern match |
| Output-to-output GPIO short circuit → hard block | Wiring topology analysis |
| 5V signal to 3.3V-only pin without level shifter → critical flag | Voltage compatibility check |
| I2C lines without pull-up resistors → warning | Protocol rules engine |

### Hazard Classification

Every project gets tagged:
- `[LIPO]` — Lithium battery present → BMS required, no direct soldering, fire-safe charging
- `[MAINS]` — AC line voltage → licensed electrician or use pre-certified adapter
- `[ESD_SENSITIVE]` — CMOS/MOSFET components → ESD precautions in steps
- `[HIGH_CURRENT]` — >5A paths → wire gauge verification, connector ratings
- `[HEAT]` — >5W dissipation → heatsink calculation, ventilation requirements
- `[MOVING]` — motors/actuators → pinch point warnings, secure mounting
- `[CHEMICAL]` — solder fumes, adhesives, batteries → ventilation, disposal instructions

---

## VII. Market Position

### The Gap

| Segment | Tools | AI Layer | Build Instructions | Shopping Links | Community |
|---------|-------|----------|-------------------|----------------|-----------|
| Pro EDA | Flux, JITX, Quilter, CELUS | Yes (schematic + PCB) | No | No | No |
| Prototyping | ProtoForge, Phaestus, Node0 | Yes (CLI agents) | Partial | Partial | No |
| Maker Education | Instructables, Hackaday, YouTube | No | Yes (manual) | Partial (manual) | Yes |
| Shopping | Octopart, LCSC, DigiKey | No | No | Yes | No |
| **BuildBuddy 10x** | **All layers** | **Yes** | **Yes (AI-generated + verified)** | **Yes (real-time pricing)** | **Yes (fork/remix)** |

**Nobody owns the full stack.** BuildBuddy can.

---

## VIII. What to Build Next (Immediate Implementation)

### High-Impact, Low-Effort (this week)

1. **Upgrade the AI prompt to the 3-pass architecture**
   - Pass 1 extraction prompt + Pass 2 gap analysis prompt + Pass 3 synthesis prompt
   - Add structured uncertainty tags (`<inferred>`, `<blocker>`, `<safety-note>`)
   - Add Layer 1 embedded domain knowledge (wire gauge table, common pinouts, voltage standards)

2. **Add hardcoded safety post-processing**
   - Wire gauge validator
   - Li-ion protection detector
   - Voltage compatibility checker
   - All as TypeScript functions that run after Claude returns

3. **Implement the three build modes in UI**
   - Quick Test / Full Build / Production toggle
   - Different BOMs and steps per mode

4. **Add verification checkpoints to step rendering**
   - Each step has a "verify" section with expected output
   - "I'm Stuck" button reveals debug checklist

### Medium-Effort (next 2 weeks)

5. **Component RAG database MVP** — top 100 most-used hobby modules with verified pinouts
6. **Real-time price comparison** — Nexar API integration for 3+ vendor pricing on every part
7. **SVG wiring diagram generation** — Claude → Mermaid → SVG rendering
8. **Progressive disclosure UI** — collapsible Quick Start → Step-by-Step → Reference tiers

### Strategic (next month)

9. **Parts bin photo analysis** — Claude Vision integration
10. **Fork/remix system** — Git-backed project versioning
11. **One-click PCB ordering** — PCBWay API integration
