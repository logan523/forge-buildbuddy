# TODOS

Deferred work with enough context to pick up cold. Newest first.

## After the 2026-08-24 rebuild

The rebuild deleted `src/components/build/` and replaced it with
`src/components/bench/`. Several subsystems lost their only UI along with it.
None were deleted — none were asked to be — but nothing reaches them from the
build flow, and that is a decision waiting rather than a state to leave alone.

- **The 3D system is down to one hero.** `src/components/stage/` +
  `src/lib/stage/` + `src/lib/product-3d/` is ~9,900 lines reached only by the
  homepage demo hero and `/dev/stage`. It was explicitly kept, and it works.
  But it is now the single largest thing in the repo serving the smallest
  surface. Either it earns a place on the bench (a "show me on the board" view
  keyed to the current action is the obvious candidate) or it shrinks. P2.
- **`src/lib/product-visual/` (1,515 lines) has zero UI importers.** It fed the
  deleted product hero and is now reachable only through product-3d and the
  analyze pipeline. Decide: wire it to something, or drop it. P2.
- **`src/lib/part-scan/` (1,941 lines) is API-only.** The camera components
  lived in `components/build/` and went with the delete. "What is this part I'm
  holding" is a real job from the retro; it currently has no surface. P2.
- **`src/lib/pcb/`, `enclosure/`, `skills/`, `tasks/` (~1,150 lines) reach
  nothing.** They were drawer-only before and the drawers are gone. P3.
- **`src/lib/mcp/` stays parked.** MCP was deferred by decision ("I dont think
  we need to do an MCP yet") and the rebuild did not revive it. Worth knowing:
  `mcp/handlers.ts` is a second full entry point into 11 domain modules, so it
  constrains refactors of `steps/`, `electrical/`, `stage/` and `serial/`
  without serving a screen. P3.

Carried, unchanged in substance:

- **Electrons on the wire** — current-flow animation on the 3D tubes. Needs KCL
  subtree-sum currents, direction by role not sign(ΔV), ordinal brightness only.
  Do not ship numeric mA on tubes. P3.
- **Printable wiring card** — post-compiler; revisit any time. P3.
- **Public-deploy limiter** — the go-gate for exposing the AI step-help and
  photo-check routes publicly. P2 if this is ever deployed.
- **Two-tab reality sync** (BroadcastChannel). Single-tab is today's honest
  answer; a banner when a second tab is detected would be enough. P3.
- **Desktop-holds-serial / phone-shows-actions.** The real fix for the
  capability split: Web Serial is desktop-Chromium only, and the bench is where
  your hands are. Ranked above two-tab sync. P2.

Closed by the rebuild (were open, no longer apply): dual solar panel node map
· T07-T10 task-explorer variants (their blocking fixtures now exist, but the
task explorer itself reaches nothing) · the step-partitioned wirecheck
migration (now runs once via `migrateLegacyWirechecks`).


---

## Pre-rebuild backlog (historical)


## Done foundation (was open 2026-07-10; closed 2026-07-27)

- **Harness power/GND from netlist** — `buildHarnesses` fans multi-member nets hub→spoke via shared `pickHub`; teaching table removed. Demo harness audit: 17/17 tubes traced.
- **3D harness conformance** — `auditPlanHarness` / `auditHarnessRoutes`; ConformanceSeal reports **both** instruction table and 3D tubes; overall green only when both clean.
- **Step isolation + wiring prose diet** — stage filters to focus parts; goals dieted from connections; see `step-isolation.ts`, `instruction.ts`.
- **Render audit ship gate** — `npm run audit:steps` exits 1 on render *errors* (demo clean).
- **Generated-plan shell** — CoverageBanner surfaces `failed` / `unavailable` compiler status.
- **Tools facade** — `src/lib/tools/` re-exports ability surface (P1.1 start). Strategy: `docs/FORGE-AGENTIC-EXPANSION.md`.

## Electrons on the Wire — current-flow animation (DEFERRED)

**What:** Animate current flowing along the 3D wire tubes driven by real per-wire current.

**Why still deferred:** Foundation (netlist tubes) landed; still need: KCL subtree-sum currents (not MNA theater), direction by role not sign(ΔV), ordinal brightness only, physical-plausibility gate for negative rail voltages. Browser visual verification required. Do not ship numeric mA on tubes.

**Depends on:** visual QA of isolated step chrome + harness still reading after any route tweak.

## Skills catalog v0 (P1.2) — LANDED 2026-07-27

`src/lib/skills/` — six skills + match (cap 3) + goldens. UI: Ask-step shows matched skill digest. **P2:** full guidance fed into `/api/step-help` as SKILLS block (connections still win).

## Task explorer v1 (P1.4) — LANDED 2026-07-27

`src/lib/tasks/` T01–T06 offline runners; `npm run audit:tasks` ship gate. Extend with T07–T10 when photo-check/flash e2e fixtures exist.

## Demo live-verify gate (P1.3) — LANDED 2026-07-27

`build-done-gate.ts` + BuildScreen end card. **P2:** FlashConsole calls `onWiringVerified` when `allExpectedFound` — auto-clears gate to celebrate.

## Forge MCP (P2.1) — LANDED 2026-07-27

- `invokeForgeTool` + `npm run mcp:invoke`
- **stdio JSON-RPC server:** `npm run mcp:server` (`scripts/forge-mcp-server.mjs`)
- Skill packs: `npm run skills:export` → `agent-skills/forge/`
- Kit agent pack: `exportKitAgentPack(plan)` (pure; wire to publish UI later)

**Also landed:**
- HTTP MCP: `POST /api/mcp` (`{ tool, arguments }` or MCP methods) + `resources/*`
- Publish drawer: **Download agent pack** (single `*-agent-pack.json` bundle) + post-publish CTA
- Classroom: `npm run classroom:export` + instructor `RUBRIC.md`
- `npm run audit:all` — steps + tasks + classroom

## Dual solar panel node map (SMALL residual)

`mapRefToNodeId` maps SOLAR/PV → `solar-l` only. Fine while the netlist has one solar module path; if a second panel gets its own net members, extend mapping (partId / side heuristic) so both wings light. Currently demo harness is fully traced without it.

## E4 printable wiring card (DEFERRED)

Post-compiler; revisit any time.

## Public-deploy limiter story (DEFERRED)

Go-gate for exposing E2/E3 Ask-step / photo-check publicly.
