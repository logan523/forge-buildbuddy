# Plan: 3D Fidelity — Flux-parity for Forge's assembly viewer

> **SHIPPED, THEN REVERTED (2026-08-24).** Track A's postfx work was deleted by 332e1be.
> Its actual conclusion is the durable part: chase recognizability, not cinema.


Date: 2026-07-10 · Branch: main · Author: Forge
Source research: deep-research on flux.ai (verified, 17/25 claims confirmed) + full audit of Forge's current 3D stack.

## Context & premise

The founder wants Forge's 3D modeler to reach the fidelity of flux.ai's board viewer. Two things the research settled:

1. **Same engine.** Flux's in-browser 3D runs on three.js + react-three-fiber over **WebGL** (not WebGPU/Babylon), scaling to ~10k components ([Flux WebGL/Three.js job req](https://coda.io/@flux-ai/flux-jobs/graphics-software-engineer-webgl-three-js-all-remote-11); tech-lead R3F-scaling talk). **Forge is already on this exact stack.** No engine rewrite is warranted; the fidelity ceiling is *content + technique*, not the renderer.
2. **The realism is mostly content, not a secret shader.** Flux does not publish its real-time board shader, and its flashiest "photorealistic renders" are likely a separate offline/server-side pipeline (research refuted the "one-click in-browser free render" framing 1-2/0-3). The reproducible levers are: real per-component 3D models, mask-driven board material compositing, SDF text, and `transmission` for clear parts.

Current Forge state (from audit): **100% parametric primitives** (the 7 GLB slots are all `glbReady:false` and never load); N8AO gated to `high` tier only; 64–256px procedural CanvasTextures with no mipmaps; over-layered analytic lights (~2.3 fill vs 1.35 key) washing out a 1k HDRI; single 1024² shadow; bloom threshold 1.0 excludes the LEDs; silkscreen/labels are canvas textures that blur on zoom.

**North-star check:** does higher fidelity serve "make builders' lives simpler"? Yes, conditionally — a *recognizable* rendering of the real part (right footprint, right silkscreen, right connector) reduces "is this the thing I'm holding?" confusion. Fidelity that's just prettier pixels does not. This plan prioritizes recognizability (real models, crisp labels) over cinematic polish (SSR, DoF).

## Eng review outcome (2026-07-10) — THE PIVOT

The eng review + an independent outside-voice challenge reframed this plan. Founder decision (D2): **"in some ways that platform is clearer and more specific. If anything do both, but we definitely have to have the pivot."** So both tracks stay, but the framing pivots.

**The pivot (mandatory):** the goal is NOT "Flux parity" (cinema). Flux serves EEs *inspecting* dense boards; a Forge beginner is *identifying* a part and *tracing a wire* — the opposite job. What Flux does that actually helps our user is being **clear and specific**: a part you can recognize, a label you can read, a pin you can trace. So the goal is **recognizability**, and it's measured against the North Star ("simpler for builders"), not against a render.

**What the outside voice caught that the original plan got wrong (corrected here):**
- The committed-GLB experiment was **already run and rejected**. `public/models/parts/README.md` states the parametric meshes have better detail and the auto-GLBs are low-poly placeholders; `scripts/generate-part-glbs.mjs` is that (disabled) factory. The original Slice 3 claim "no committed GLBs yet" was **factually wrong** — 7 exist.
- The GLB **load path + golden/fallback tests already exist** (`product-node-mesh.tsx` `CatalogGlbUnderlay`/`GlbErrorBoundary`/Suspense; `real-parts.test.ts:71-92`). Half of "Tier-1 high-effort" (D5/D6) is duplicative.
- Real vendor models would **regress the hero parts**: the parametric ESP32/OLED/TP4056 carry beginner-critical signal a generic model destroys — silkscreen labels, the live SSD1306 clock face, and **net-colored pin rings wired to the same color authority as the harness** (blue SDA ring → blue SDA wire). That IS the "where does the wire go" job.
- Hero SKUs are commodity clones (SuperMini ESP32-C3, generic 0.96 OLED) with no clean LCSC C-number, so coverage is weakest exactly where it'd matter; best case, boring parts get models and hero parts fall back to parametric — net gain ≈ zero.
- Concrete corrections applied to the quick wins: **bloom = per-material LED emissive bump, NOT a global threshold cut** (a threshold cut blooms all silkscreen/specular); **2k HDRI + 2048² shadow gated to `high` tier only**, not global (protects the demotion path); **AO-on-medium needs real-device validation** (N8AO even half-res can pressure mobile GPUs and flap the PerformanceMonitor ratchet).

**Both tracks, re-prioritized:**
- **Track A — recognizability (do now, primary):** the quick wins below serve legibility, not cinema. LEDs that glow, net-colored pins that read, lighting that isn't washed flat, contact shadows so parts sit on the board.
- **Track B — real models (kept, but gated):** NOT built blind. Gate behind a **one-part bake-off**: drop the single best real ESP32-C3 next to the parametric one and look. Build the pipeline only if the real model visibly wins AND carries (or can be given) the net-colored-pin signal. One screenshot answers the question a pipeline would spend days on.

## Ranked roadmap

| Tier | Item | Impact | Effort | Files |
|---|---|---|---|---|
| 1 | Real component GLB models (build-time pipeline) | ★★★ | High | new `scripts/`, `real-parts.ts`, `build-scene.ts`, `product-node-mesh.tsx` |
| 1 | Ungate AO to `medium` (lighter radius) | ★★ | XS | `quality.ts`, `product-viewer-3d.tsx` |
| 1 | Bloom threshold + LED emissive so LEDs glow | ★★ | XS | `product-viewer-3d.tsx`, `product-node-mesh.tsx` |
| 2 | Lighting rebalance (cut flat fills, boost IBL/contrast, 2k HDRI, bigger shadow) | ★★ | S | `product-viewer-3d.tsx`, `public/hdri/` |
| 2 | Mask-composited board material (silkscreen/soldermask/copper) | ★★ | M | `materials.ts`, `procedural-maps.ts` |
| 2 | SDF text for labels/silkscreen | ★ | M | new; `product-node-mesh.tsx` |
| 3 | `transmission` on LED lenses/plastic; anisotropy on metals | ★ | S | `materials.ts` |
| 3 | Texture resolution + mipmaps + anisotropic filtering | ★ | S | `procedural-maps.ts` |

Execution order (founder-approved): **quick wins (AO, bloom, lighting) first, then the models pipeline.** Slices 6–8 are core-but-deferrable.

## Architecture — real component models (the review-critical piece)

This is a **build-time (offline) pipeline that produces static GLBs committed to the repo**, not a runtime fetch. The runtime already has the load path (`node.assetUrl ? GLB : parametric`, `product-node-mesh.tsx`); it's gated `false` today.

```
Forge catalogId (e.g. esp32_c3)
   │  1. ID resolution table  catalogId → LCSC C-number (hand-authored, small, tested)
   ▼
LCSC C-number (e.g. C2040)
   │  2. easyeda2kicad.py --lcsc_id=Cxxxx  → WRL/OBJ + STEP (colored 3D model)
   ▼  3. convert WRL/STEP → glTF → GLB (Blender headless or assimp; CAD kernel for STEP)
   │  4. decimate + Draco/meshopt compress, center to part origin, scale to mm
   ▼
public/models/parts/<catalogId>.glb   (committed; glbReady:true in real-parts.ts)
   │  5. runtime: useGLTF(assetUrl) behind Suspense + error boundary
   ▼  6. fallback: any missing/failed GLB → existing parametric primitive (unchanged)
```

Decisions to lock in eng review:
- **D1 Sourcing authority.** Primary: EasyEDA/LCSC via easyeda2kicad.py (keyed by C-number). Gaps (not every part has a model) fall back to parametric. Alternative sources (manufacturer STEP, Ultra Librarian) are per-part manual adds. → *review: is LCSC coverage enough for the ~13 demo parts?*
- **D2 Licensing.** LCSC/EasyEDA 3D models and manufacturer STEP files have varying redistribution terms. Committing GLBs to a public repo requires per-source license clearance. → *review: licensing gate before committing any third-party GLB; document provenance per file.*
- **D3 Toolchain boundary.** Conversion needs FreeCAD/OpenCASCADE (STEP) or Blender (WRL→glTF) — a **developer/CI toolchain, not a runtime dep, not an npm install.** Produces static artifacts. → *review: keep the toolchain out of the Next build; a documented `scripts/build-part-models.mjs` run manually.*
- **D4 Runtime budget.** GLBs are heavier than primitives. Per-part budget (target ≤150 KB Draco-compressed), preload only present parts, keep parametric for LOD-far / low tier. → *review: does loading N GLBs regress the quality-tier frame budget the audit documented?*
- **D5 Coordinate/scale contract.** Each GLB must be centered to the part origin and unit-matched (1 unit = 1 mm, `rootScale ~0.012`) so it drops into the existing scene-node transform. → *review: a golden test asserting bbox center + dimensions vs the datasheet mm in real-parts.ts.*
- **D6 Fallback integrity.** The parametric path stays the default and the guaranteed floor; GLB is progressive enhancement. A broken/missing GLB must never blank a part. → *review: test that `glbReady:true` + 404 falls back cleanly (mirrors the PhotoCard probe discipline).*

## Quick-win details (slices 1–3)

- **AO:** add a lighter N8AO (smaller `aoRadius`, `halfRes`) to `medium` in `quality.ts` (`ao: true` for medium with reduced intensity); keep `low` effects-off. Verify no frame regression on the mobile `detectQualityTier` path.
- **Bloom/LEDs:** either lower `luminanceThreshold` to ~0.8 or raise TP4056 LED `emissiveIntensity` above the threshold so charge LEDs actually glow; re-tune vignette if the scene over-blooms.
- **Lighting:** reduce ambient (0.62→~0.35) + the three fills; raise `envMapIntensity`/`environmentIntensity` toward IBL dominance; swap `studio_small_08_1k.hdr` → a 2k HDRI; raise key shadow map 1024²→2048². Guard against the GPU-blackout history (the `SoftShadows`/`MeshReflectorMaterial` ban stays).

## Assistance parity (non-3D, from the copilot research)

Flux Copilot runs describe → **reviewable plan → approval** → generate, with proactive design reviews (flags missing decoupling caps, etc.) — human-validated, *not* autonomous. Two adoptable, data-we-already-have ideas (out of this plan's 3D scope, listed for the roadmap): (a) a plan-approval checkpoint before step generation; (b) surface existing ERC/validator/step-render-audit findings as proactive "⚠ I noticed…" prompts.

## Test plan

- Quick wins: browser verification (AO visible on medium; LEDs bloom; lighting contrast) + no console errors + quality-tier frame budget holds. No new unit tests (rendering).
- Models pipeline: `real-parts` golden (GLB bbox center/dims vs datasheet mm, D5); fallback test (glbReady+missing → parametric, D6); a `scripts/build-part-models` dry-run over the demo catalog reporting coverage/gaps; licensing manifest per committed GLB.
- Regression: existing product-3d test suite green; the new step-render-audit stays green (models must not break focus framing).

## Risks

- **Licensing (D2)** — highest non-technical risk; a wrong redistribute could force removal. Gate: no third-party GLB commits without cleared provenance.
- **Coverage (D1)** — LCSC may lack models for some parts; mitigated by the parametric fallback (never worse than today).
- **Perf (D4)** — GLBs heavier; mitigated by budget + tier gating + present-only preload.
- **Toolchain drift (D3)** — conversion is a manual dev step; document it, don't wire it into the app build.
- **Marketing mirage** — do NOT try to reproduce Flux's offline "photoreal renders" in the live viewer; that's likely a different (server/path-traced) pipeline. Chase recognizability, not cinema.

## Slices

0. This plan + eng review (current).
1. AO ungate + bloom/LED fix (quick wins) — verify in browser, commit.
2. Lighting rebalance + 2k HDRI + shadow bump — verify, commit.
3. Models pipeline scaffolding: ID-resolution table + `scripts/build-part-models.mjs` + licensing manifest + fallback test (no committed GLBs yet).
4. First real GLBs for the demo hero parts (ESP32-C3, OLED, TP4056, 16340) with cleared provenance; flip `glbReady`; golden tests.
5. Remaining demo parts + coverage report.
6. Mask-composited board material. (deferrable)
7. SDF text for labels/silkscreen. (deferrable)
8. `transmission`/anisotropy + texture res/mipmaps. (deferrable)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES RESOLVED | 2 decisions (D1 sequencing, D2 reframe) both founder-resolved; premise scrutinized and pivoted |
| Outside Voice | Claude subagent | Independent 2nd opinion (Codex not installed) | 1 | ISSUES FOLDED | ~7 problems: already-rejected GLB experiment, duplicative D5/D6/load-path, hero-part regression, LCSC coverage gap, understated toolchain, bloom-threshold vs per-material, global HDRI/shadow perf; all folded or resolved via D2 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CROSS-MODEL:** The outside voice went further than the section review — it surfaced the pre-existing `public/models/parts/README.md` that already documents "parametric > auto-GLB", proving the flagship pipeline re-runs a rejected experiment. Presented as D2; founder chose "do both, but the pivot is mandatory" — recognizability now (Track A), real models gated behind a one-part bake-off (Track B). No open cross-model tension.

**VERDICT:** ENG CLEARED. Track A (recognizability quick wins) approved and implemented (AO ungate + per-material LED emissive + lighting rebalance + high-gated shadow; tsc clean, 287 tests green; in-browser visual tune pending — preview tooling unavailable at review close). Track B (real models) is a gated bake-off, not committed work.

NO UNRESOLVED DECISIONS
