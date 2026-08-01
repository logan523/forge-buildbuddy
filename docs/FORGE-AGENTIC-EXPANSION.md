# Forge Agentic Expansion

**Status:** STRATEGY — durable north-star for product expansion  
**Date:** 2026-07-27  
**Audience:** Founder + agents working in this repo  
**Related:** `PRODUCT.md`, `CLAUDE.md`, `docs/SENIOR-REVIEW.md`, `docs/ELECTRICAL-CORE.md`, `docs/designs/step-instruction-overhaul.md`, `docs/designs/3d-fidelity-flux-parity.md`, `TODOS.md`

---

## Why this document exists

A thin read of [github.com/matlab](https://github.com/matlab) yields “add skills and serial flash.” A full read yields a **product architecture** MathWorks is shipping for agentic engineering:

```
Agent  ──reads──► Skills (expertise, loaded only when relevant)
  │
  └──calls──► MCP tools (ability to act on a live system)
                │
                ▼
         Live runtime (MATLAB / Simulink session)
         eval · test · check · model ops
```

Forge already has fragments of that stack (ERC, step compiler, serial, flash, render audit). This doc maps the **full** MathWorks system onto Forge so future work expands the product coherently — instead of collapsing into one-off UX patches.

**North star (unchanged):** make builders’ lives simpler. Every expansion must pass that test.

**Honest framing:** We steal the *architecture*, not the MATLAB dependency. Weekend makers must never need MATLAB. Advanced users / classrooms may co-exist with MathWorks tooling later.

---

## Source map — what MathWorks actually shipped

| Layer | Repo | What it is |
|-------|------|------------|
| Live runtime | [matlab/matlab-mcp-server](https://github.com/matlab/matlab-mcp-server) | Go MCP bridge: start/attach MATLAB, evaluate, run file, run tests, static analysis, detect toolboxes; guidelines as MCP **resources** |
| Domain knowledge | [matlab/matlab-agentic-toolkit](https://github.com/matlab/matlab-agentic-toolkit) | Skills catalog by domain + installer that wires MCP + skills into Claude / Copilot / Codex / Gemini / Amp |
| System knowledge | [matlab/simulink-agentic-toolkit](https://github.com/matlab/simulink-agentic-toolkit) | MCP **extension tools** (`model_read/edit/check/test/…`) + MBD skill groups + `AGENTS.md` + install validation |
| Skill R&D | [matlab/agent-skills-playground](https://github.com/matlab/agent-skills-playground) | Experimental skills + self-contained demos (skills + tutorial README); test-first skill authoring |
| Always-on contracts | [matlab/rules](https://github.com/matlab/rules) | Coding standards agents pull on demand (not stuffed into every prompt) |
| Prompt library | [matlab/prompts](https://github.com/matlab/prompts) | Task-shaped prompts by category (incl. **hardware connectivity**) |
| Workflow UX | [matlab/slash-commands](https://github.com/matlab/slash-commands) | 13 commands; **static fallback + MCP-enhanced** when live tools exist |
| In-environment | [matlab/terminal-in-matlab](https://github.com/matlab/terminal-in-matlab), [matlab/matlab-ai-agent-sdk](https://github.com/matlab/matlab-ai-agent-sdk) | Agent stays in the engineer’s tool; or build agents *in* MATLAB |
| Production surface | [matlab/mcp-framework-matlab-production-server](https://github.com/matlab/mcp-framework-matlab-production-server) | Publish MATLAB functions as MCP tools |

### Stealable principles (not slogans)

1. **Ability ≠ knowledge** — tools act on reality; skills teach expert use; rules are on-demand resources.
2. **Extension files, not forks** — Simulink adds tools via `--extension-file`; don’t rewrite the bridge for every domain.
3. **Static-first, live-enhanced** — every command works offline; MCP adds validation/execution.
4. **Install only skill groups you need** — fewer skills → better trigger reliability + less token burn.
5. **Task explorer as GTM** — curated multi-step tasks prove the stack; not a feature dump.
6. **Multi-agent packaging** — plugin / Copilot prompts / Cursor rules / MCP from day one.
7. **Human in the loop** on tool calls that mutate the real system.
8. **Bug-report skill** — capture env + repro from the session where it broke.

### What not to steal

- Requiring MATLAB for core Forge (wrong ICP for weekend makers)
- Dumping 50 skills at once (MathWorks warns agents fail to trigger)
- Autonomous dangerous actions without confirmation
- Marketing “agentic” without tools that touch a board or a netlist
- Cinema 3D as the product bar (their value is inspect/edit/test — ours is identify/wire/verify)

---

## Current Forge state (honest)

| Fragment | Where it lives | Gap |
|----------|----------------|-----|
| Netlist + ERC | `src/lib/electrical/` | Authority exists; not exposed as a stable tool API |
| Step compiler | `src/lib/steps/compile.ts` | Facts exist; generated plans still uneven |
| Wire color authority | `src/lib/wire-colors.ts` | Must stay single source for text + 2D + 3D |
| 3D stage | `src/components/stage/`, `src/lib/product-3d/` | Isolation default landed; harness power/GND still teaching table (`TODOS.md`) |
| Step render audit | `src/lib/product-3d/step-render-audit.ts` | Exists; not a hard ship gate everywhere |
| Serial + flash | `src/lib/serial/`, `src/components/flash/` | Live loop started; not the center of “done” |
| Photo check | `src/app/api/photo-check/`, eval harness | Demo-scoped, kill criteria designed |
| Unstick trees | `src/lib/unstick.ts`, isolation walk | Domain expertise not packaged as skills |
| Kit publish | `src/lib/kits/` | Recipe board, not marketplace |

**Pain the expansion must fix:** renderer and step-by-step feel unfinished because the UI is not a clean *client* of ability + knowledge. Demo path is rich; any-project path degrades.

---

## Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Surfaces                                                    │
│  Web workbench · Bench agent · MCP · Skills packs · Tasks    │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   ┌──────────┐       ┌────────────┐       ┌──────────┐
   │  Skills  │       │ Forge tools│       │ Resources│
   │ (load on │       │ (ability)  │       │ (rules)  │
   │  demand) │       └─────┬──────┘       └──────────┘
   └──────────┘             │
                            ▼
              ┌─────────────────────────┐
              │  Plan + board runtime   │
              │  netlist · compiled     │
              │  steps · serial/flash   │
              │  stage scene            │
              └─────────────────────────┘
```

**Invariant:** text, ConnectionsTable, wire tubes, and serial expected-devices all derive from the same plan authorities. Grades stay “consistent” / “derived”, never “verified”, unless a live check passed.

---

## Layer A — Forge tools (ability)

Expose existing domain logic as a stable API first used by the web app, later by MCP / external agents.

| Tool | Purpose | Primary code today |
|------|---------|-------------------|
| `get_plan` | Current BuildPlan + status | `storage`, session |
| `compile_plan` | Attach compiled facts to steps | `steps/compile.ts` |
| `run_erc` | Electrical rule check; block unsafe | `electrical/` |
| `get_step_facts(n)` | Connections, checks, micro-steps, focusPartIds | `step.compiled` |
| `validate_step_content(n)` | Color/pin/net coverage issues | `steps/validate.ts` |
| `audit_step_render(n)` | Camera/presence/focus integrity | `step-render-audit.ts` |
| `build_wire_plan` | Exact wires, colors, cut lengths | `stage/wire-plan.ts` |
| `isolate_step(n)` | Node/wire set for step focus | `stage/step-isolation.ts` |
| `serial_connect` / `serial_read` / `serial_disconnect` | Live board I/O | `lib/serial/session.ts` |
| `flash_firmware` | One-tap flash path | `flash/`, firmware manifest |
| `verify_expected_devices` | I2C scan vs catalog | `serial/expected-devices.ts` |
| `photo_check(step)` | Abstain-biased vision | photo-check API (demo gate) |
| `conformance_seal` | Table + (future) 3D harness honesty | `conformance.ts`, `TODOS.md` |
| `diagnose(symptom)` | Unstick tree | `unstick.ts` |
| `part_identity(catalogId)` | Recognizable part card data | `part-identity.ts`, GLB registry |

### Tool design rules

1. **Pure core where possible** — no WebGL in tool contracts; stage consumes tool outputs.
2. **Fail closed on safety** — ERC errors block flash/kit publish paths that claim readiness.
3. **Human confirm** for flash and any write that can brick or energize Li-ion paths.
4. **Static works without board** — serial/flash tools return clear `unavailable` states.

### Future MCP packaging

- `tools/tools.json` (or equivalent) registers the table above for Claude / Cursor / etc.
- Optional extensions later: Wokwi sim, MATLAB co-analysis, classroom fleet endpoints.
- Do **not** block P0/P1 on shipping external MCP; internal tool module first.

---

## Layer B — Skills catalog (knowledge)

Each skill is a self-contained pack: `SKILL.md` + optional scripts + **golden fixtures**. Load only when step kind, net class, or symptom matches.

### Groups (selective install)

| Group | Skills | Job |
|-------|--------|-----|
| **core-build** | `part-identify`, `wire-one-net`, `power-gnd-order`, `check-your-work` | Kitchen-table steps |
| **buses** | `i2c-ssd1306`, `i2c-scan-unstick`, `pull-ups` | Blank display / bus class |
| **power-safety** | `tp4056-safe`, `domain-voltage-check`, `li-ion-never-unprotected` | Safety + multimeter |
| **flash-serial** | `esp32c3-flash`, `first-blink`, `i2c-scanner-sketch`, `computer-ready` | After wiring |
| **stage-3d** | `step-isolate`, `pin-focus`, `recognizable-part` | Renderer job (identify, not cinema) |
| **shopping** | `right-interface-oled`, `mpn-not-keyword`, `substitutes` | Wrong part bought |
| **debug** | `isolation-walk`, `filing-bug-report` | Stuck recovery |
| **authoring** (internal) | `engineer-a-kit-skill`, `golden-netlist-fixture` | Playground → catalog |

### Skill authoring standard (from MathWorks playground)

1. Write failing goldens first (wrong wire color, inverted SDA/SCL, missing focusPartIds).
2. Skill must call tools — not invent pins in prose.
3. Demo folder = skill + tutorial README + fixtures (self-contained).
4. Graduate from playground → official catalog only when goldens green.

### Packaging targets (multi-agent)

| Host | Format |
|------|--------|
| Forge web | In-app skill loader + Ask-step / stuck routing |
| Claude Code | `~/.claude/skills/` or plugin |
| Cursor | rules / skills dir |
| Copilot | prompt packs |
| Any MCP agent | skills + Forge MCP tools |

---

## Layer C — Resources (rules on demand)

Publish authorities as pullable resources — not a growing system prompt.

| Resource URI (conceptual) | Content | Source of truth |
|---------------------------|---------|-----------------|
| `forge://wire-color-authority` | Class → color name + hex | `wire-colors.ts` |
| `forge://li-ion-rules` | Hardcoded safety gates | validators / electrical |
| `forge://pin-label-only` | Silkscreen only; no ordinal pin positions | compile.ts policy |
| `forge://electrical-model` | Netlist contract | `docs/ELECTRICAL-CORE.md` |
| `forge://step-grade-meanings` | consistent / derived / unavailable | types + compile docs |
| `forge://renderer-recognizability` | Isolation > cinema; net-colored pins | 3D fidelity pivot |

---

## Layer D — Workflow UX (static + live)

| Command / action | Static (always) | Live-enhanced (when board connected) |
|------------------|-----------------|--------------------------------------|
| `/next-wire` | Next micro-step from compiler | Light + pin-focus that wire in stage |
| `/check-work` | Multimeter / continuity copy from domains | Serial expected-devices green/red |
| `/stuck` | Isolation walk + unstick tree | Re-scan bus; re-run diagnose with live data |
| `/flash` | Wiring prerequisites + computer-ready | Web Serial flash |
| `/explain-part` | Catalog identity + GLB/parametric | Optional photo match |
| `/audit` | Coverage banner + render audit findings | — |
| `/ask` | Answer only from compiled facts | — |

UI principle: **one primary CTA per state** (already in PrimaryActionBar). Commands are the agent-facing and power-user surface of the same state machine.

---

## Layer E — Task explorer (GTM + quality bar)

Curated tasks that **fail CI** if tools/skills/renderer regress. Each task has: frozen plan, optional broken variant, reference photos, step prompts, pass criteria.

### v1 task list (Sat Line / ESP32-C3 class)

| ID | Task | Pass criteria |
|----|------|---------------|
| T01 | Identify every part on the table | Part identity cards match BOM |
| T02 | Wire OLED I2C only (SDA/SCL + power) | Micro-steps complete; colors match authority; stage isolates two modules |
| T03 | Desolder / prep step does not absorb nets | No connection legs on prep steps |
| T04 | Power + GND star honesty | Conformance seal includes harness tubes (after foundation) |
| T05 | Flash Blink | Computer-ready → flash → serial evidence |
| T06 | I2C scanner finds expected addresses | `verify_expected_devices` pass |
| T07 | Blank display unstick | Skill + diagnose path; no invented pins |
| T08 | Buy the right 0.96" OLED | Shopping skill rejects wrong interface |
| T09 | Photo check abstains on deliberate miswire | Zero false “looks right” on fixtures |
| T10 | Generated-plan shell | Non-demo plan: compiler banner, coverage, no blank wiring UI |

### Broken variants (required for hard skills)

- Swapped SDA/SCL  
- 5V OLED on 3.3V logic without level note  
- Wrong wire color in prose (validator must catch)  
- focusPartIds pointing at phantom part (render audit)  
- Missing GND leg in multi-member net  

---

## How this fixes renderer + step-by-step

MathWorks would not “polish the viewer.” They split **overview vs read vs check**.

| Mode | Forge meaning | User job |
|------|---------------|----------|
| Overview | Prep / hero full product | “What am I building?” |
| Read / isolate | Step workbench: focus parts + wires only | “Where does this wire go?” |
| Check | Render audit + conformance + serial/photo | “Did I do it right?” |

### Renderer bar (recognizability, not Flux cinema)

- Step chrome defaults to isolation (`step-isolation`, stage focusPartIds).
- Net-colored pin rings share wire-color authority.
- Power/GND tubes derived from multi-member nets (`TODOS.md` foundation).
- `audit_step_render` is a ship gate for demo + goldens.
- GLB bake-off remains gated; parametric keeps beginner-critical signal.

### Steps bar (compiler product)

```
extract → ERC → compile steps → render audit → buy → wire → flash → verify
```

- Prose diet: short goal; connections/micro-steps first; LLM walls only in deep notes.
- Progress: micro-step checks; optional live verify hard-gates “working.”
- Help: skill + tools against *this* plan, not more essay.

---

## Roadmap

### P0 — Product truth (core loop)

| # | Work | Exit criteria |
|---|------|---------------|
| P0.1 | Step isolation default + wiring prose diet | Wiring steps show focus parts; short goal; facts first |
| P0.2 | Harness power/GND from multi-member nets | Tubes match netlist; visual verify in browser |
| P0.3 | Conformance seal audits 3D tubes | Seal honest about decorative vs derived |
| P0.4 | Step-render audit as ship gate | Demo + goldens fail CI on FOCUS_* errors |
| P0.5 | Generated-plan shell parity | One non-demo plan: banner, coverage, no blank wiring UI |

### P1 — Agentic architecture on Forge

| # | Work | Exit criteria |
|---|------|---------------|
| P1.1 | Internal `src/lib/tools/` facade | UI calls tools only for compile/ERC/facts/audit/serial |
| P1.2 | Skills catalog v0 (6 skills + goldens) | core-build + buses + flash-serial load on demand |
| P1.3 | Static + live verify | Demo “done” can require serial green; soft complete remains |
| P1.4 | Task explorer v1 (T01–T06) | Tasks runnable; 3+ in automated checks |
| P1.5 | Resources doc + agent-facing exports | wire-colors + li-ion rules published as single sources |

### P2 — Expansion surfaces

| # | Work | Exit criteria |
|---|------|---------------|
| P2.1 | Forge MCP server package | External agent can `get_step_facts` + `run_erc` |
| P2.2 | Classroom pack | Tasks + expected-device maps for one lab kit |
| P2.3 | Multi-agent skill packaging | Claude + Cursor install paths documented |
| P2.4 | Optional MATLAB bridge skill | “Analyze log in MATLAB” via their MCP; Forge owns bench |
| P2.5 | Kit publish exports tools+skill stub | Published kit is agent-callable lab unit |

### P3 — Ambition (do not start early)

| # | Work | Notes |
|---|------|-------|
| P3.1 | RFLP-lite project mode | Course-scale; after P1 solid |
| P3.2 | Embedded firmware size/skill constraints | Inspired by embedded-ai-deployment demos |
| P3.3 | Production multi-user MCP | School fleets; auth + observability first |
| P3.4 | Full marketplace | Only after identity, moderation, versioning |

---

## Markets (ordered)

| Market | Fit | Gate |
|--------|-----|------|
| Weekend makers | Core ICP | P0 must feel excellent |
| Engineering students / labs | Skills + tasks + verify | After P1.3–P1.4 |
| MATLAB-using students | Co-existence, not dependency | Optional P2.4 |
| Instructors | Task explorer + frozen kits | P2.2 |
| MBSE / course projects | RFLP-lite | P3 only |
| Enterprise fleets | Production MCP | Auth + observability |

---

## Anti-patterns (do not repeat)

From `CLAUDE.md` and this architecture:

1. **Over-engineering** — do not rebuild a 14-component agent IDE before tools work.
2. **Under-engineering** — do not strip working verify paths.
3. **Broken visuals** — no new AI image pipeline as primary step media; derive from data.
4. **Prompt-only expansion** — skills without tools are essays.
5. **Demo-only quality** — tasks and goldens must cover generated-plan shell.
6. **Harness lies** — never animate current on teaching tubes before netlist reconciliation.
7. **Scope theater** — PCB/marketplace/cinema do not fix kitchen-table step N.

---

## Success metrics

| Metric | Target |
|--------|--------|
| Demo wiring step: focus parts only on stage | Default on |
| Demo step: goal ≤ ~110 chars when compiled | Default on |
| Render audit errors on Sat Line | 0 |
| Conformance: table and tubes same nets | 100% after P0.2–P0.3 |
| Time to first successful Blink on demo path | Declining; measured in task T05 |
| False “looks right” on photo-check fixtures | 0 (kill feature if violated) |
| Skills loaded for a typical wire step | ≤ 3 relevant skills |

---

## Implementation notes for agents

1. Prefer **editing** existing modules over new parallel systems.
2. New tool surface: start as TypeScript functions under `src/lib/tools/` with tests; UI adapters second; MCP last.
3. New skill: playground-style folder with goldens; do not bloated-prompt `analyze` route.
4. Before claiming renderer/step work “done”: `npx tsc --noEmit`, demo loads, wiring step isolated, connections table present.
5. Re-read this doc when the user asks “expand the product” or links MathWorks/agentic tooling.

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-27 | Initial strategy from full matlab.org extract + Forge codebase audit. |
| 2026-07-27 | **Execution pass:** P0.1 isolation+prose diet; P0.2/P0.3 harness already netlist-derived (seal UI updated for dual-channel honesty); P0.4 `npm run audit:steps` exits 1 on render errors; P0.5 CoverageBanner for failed/unavailable; P1.1 start `src/lib/tools/` facade. Demo harness 17/17 traced. |
| 2026-07-27 | **P1 pass:** skills catalog v0 (`src/lib/skills/`, 6 skills + goldens); task explorer T01–T06 + `npm run audit:tasks`; build-done gate (verify-board / soft-skip / celebrate) on BuildScreen. |
| 2026-07-27 | **P2 pass:** step-help gets SKILLS digest; FlashConsole auto `wiringVerify=passed` via `allExpectedFound`; `src/lib/mcp/handlers` + `npm run mcp:invoke`. |
| 2026-07-27 | **P2.1+:** MCP stdio server (`npm run mcp:server`); skill pack export (`npm run skills:export`); kit agent pack (`exportKitAgentPack`). |
| 2026-07-27 | **P2 close:** Publish → Download agent pack; `POST /api/mcp`; `npm run classroom:export` (lab-sat-line). |
| 2026-07-27 | **Polish:** single-file agent pack JSON; MCP `resources/list|read` (wire colors, pin policy, Li-ion); `npm run audit:all`; lab `RUBRIC.md`. |

---

## One-line summary

**Become the MathWorks of beginner hardware benches:** tools that touch netlist and board, skills that load on demand, rules as resources, static+live workflows, and task-based proof — with the web workbench as the first client, not the only form of the product.
