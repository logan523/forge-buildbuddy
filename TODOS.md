# TODOS

Deferred work with enough context to pick up cold. Newest first.

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
