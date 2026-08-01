# MATLAB / MathWorks 3D rendering vendor evaluation

**Date:** 2026-07-29  
**Purpose:** NASA-level comparison of MathWorks 3D visualization products against Forge’s product-3D stack, for two distinct jobs:  
1. **Entire product renderer** (orbitable assembly stage, life-mm BOM authority, harness, explode, beauty)  
2. **Step-by-step walkthrough** (per-step focus, pin framing, scrub/presence, wire-color consistency, kitchen-table browser)  

**Pattern:** Same rigor as `docs/AR-VENDOR-EVAL.md` — job match first, license/size/browser second, adopt / pass / later only after scoring.  
**Product interface (Forge authority):** `src/lib/product-3d/*` → `ProductAssemblyApp` / step hero (`variant="step"`) → pure-TS audits (`step-render-audit.ts`, `pin-focus.ts`, `real-parts.ts`).

---

## TL;DR

| Rank | MathWorks surface | Use for | Entire renderer | Step walkthrough | Verdict |
|------|-------------------|---------|-----------------|------------------|---------|
| **1** | Ideas only: Unreal *look* / synthetic stills pipeline | Offline beauty frames, marketing stills, future AR synthetic data | ★★☆☆☆ as runtime | ★☆☆☆☆ | **Later / offline authoring only** |
| **2** | Robotics System Toolbox `Simulation 3D *` blocks | Industrial robot/UAV digital twin demos | ★★☆☆☆ | ★☆☆☆☆ | **Pass for Forge product** |
| **3** | Simulink 3D Animation (Unreal co-sim) | Photoreal dynamics, sensor-in-loop, virtual commissioning | ★★★☆☆ fidelity / ★☆☆☆☆ product fit | ★☆☆☆☆ | **Do not adopt as product kernel** |
| **4** | Aerospace Toolbox 3D / globe assets | Flight/space vehicle viz | ★☆☆☆☆ | ★☆☆☆☆ | **Wrong domain** |
| **5** | UAV Toolbox Unreal scenes | Drone HIL / perception | ★☆☆☆☆ | ★☆☆☆☆ | **Wrong domain** |
| **6** | Simscape Multibody Mechanics Explorer | Multibody dynamics auto-animation | ★★☆☆☆ mech only | ★☆☆☆☆ | **Pass** (no pin/BOM job) |
| **7** | Base MATLAB Graphics (`patch`/`surf`/`hgtransform`) | Quick offline plots | ★☆☆☆☆ | ★☆☆☆☆ | **Not a product renderer** |
| **8** | [mathworks-robotics/mobile-robotics-simulation-toolbox](https://github.com/mathworks-robotics/mobile-robotics-simulation-toolbox) | Free kinematics + simple viz | ★☆☆☆☆ | ★☆☆☆☆ | **Ideas only** |
| **9** | [mathworks/Simulation-Animation-Deployment-for-Simulink-Compiler](https://github.com/mathworks/Simulation-Animation-Deployment-for-Simulink-Compiler) | Standalone desktop deploy of SL3D anim | ★☆☆☆☆ web | ★☆☆☆☆ | **Pass** (desktop compiler path) |
| **10** | [mathworks/robot-vla-simulink](https://github.com/mathworks/robot-vla-simulink) | VLA + Unreal robot manip | ★★☆☆☆ research | ★☆☆☆☆ | **Wrong job** (manipulation, not kit coach) |

**One-line decision:**  
MathWorks is a **desktop industrial co-simulation graphics stack**, not a **browser kit-assembly coach**. It must **not** replace Three.js/`product-3d` for either the entire renderer or the step walkthrough. Optional later use is **offline still generation / synthetic camera data**, never the live product runtime.

**Forge today** is the correct kernel for both jobs: parametric life-mm scene graph, pin-level framing, step scrub, harness nets, pure-TS audit gates, phone browser, zero MATLAB license on the critical path.

---

## 0. Evaluation charter (NASA specificity)

### 0.1 Jobs under test

| Job ID | User outcome | Success metric | Runtime constraint |
|--------|--------------|----------------|--------------------|
| **J1 Entire renderer** | Builder orbits a truthful 3D product built from their BOM | Scene nodes within **0.5 mm** of `RealPartSpec`; harness pin-to-pin; explode/solo/inspect | **Browser** (Next.js client), interactive ≥30 fps mid tier, optional GLB underlay |
| **J2 Step walkthrough** | On step *n*, camera frames the right part(s)/pins; wire color = connections table = 3D harness | `step-render-audit` zero `error`; pin resolve exact→prefix; kitchen-table phone | Same canvas stack; scrub = phase authority; no black stage |

### 0.2 Non-goals (explicit)

- Digital twin of factory robot arms  
- Photoreal Unreal city/airfield for vehicle dynamics  
- Hardware-in-the-loop sensor sim (lidar/camera rays)  
- Multibody contact solvers for mechanism design  
- Replacing KiCad/CAD for board layout  

MathWorks products **win** many of those non-goals. Scoring them highly on non-goals would falsify the eval.

### 0.3 Scoring rubric (every candidate)

| Criterion | Weight J1 | Weight J2 | What “5★” means |
|-----------|-----------|-----------|-----------------|
| Correct problem (kit DIY product / pad coach) | 25% | 30% | Built for BOM parts, silkscreen pins, hand assembly |
| Browser / mobile runtime | 20% | 25% | Ships in Forge web app without desktop MATLAB |
| Life-mm + pin authority | 20% | 20% | Datasheet mm + named pins, testable without GPU |
| Step / sequence integration | 5% | 15% | Per-step focus, presence, scrub, audit |
| License / cost / redistribution | 15% | 5% | Can ship to public users without per-seat MATLAB |
| Fidelity / photoreal option | 10% | 3% | Looks real when we want beauty |
| Integration effort into Forge TS kernel | 5% | 2% | Days not quarters; adapter not rewrite |

**Verdict bands**

| Band | Rule |
|------|------|
| **Adopt** | ≥4★ weighted on target job AND license-safe for product path |
| **Later** | Strong offline/authoring value; not runtime |
| **Pass** | Wrong job, wrong runtime, or cost/risk dominates |
| **Do not replace core** | Fidelity may be high; product architecture must not re-kernel |

### 0.4 Hard constraints from MathWorks product facts

| Fact | Impact on Forge |
|------|-----------------|
| Simulink 3D Animation **requires MATLAB**; Simulink required for block library | Cannot embed as npm dep |
| Unreal co-sim path: **not supported on Mac** (MathWorks platform requirements) | Founder/dev Mac bench blocked for Unreal path |
| Target industries: automotive, aerospace, robotics, virtual commissioning, synthetic data, industrial manufacturing | Adjacent to “DIY kit coach,” not the same product |
| Custom Unreal scenes need **separate Unreal Editor license** | Extra toolchain + IP surface |
| VR Sink / classic VRML path: **deprecated** in favor of Simulation 3D blocks | Any “old MATLAB VR” blog tutorial is a dead end |
| Pricing: commercial Individual/Standard/Enterprise — **not** MIT/Apache OSS for redistribution of the runtime | SaaS critical path would force every builder (or us) into MathWorks seats or Compiler packaging |

---

## 1. What Forge built (baseline)

### 1.1 Entire renderer (J1)

| Layer | Implementation | Strength | Weakness vs industrial MathWorks |
|-------|----------------|----------|----------------------------------|
| Dimension authority | `real-parts.ts` RealPartSpec (bbox + pins + source citations) | Life-mm, golden tests ±0.5 mm | No multibody physics |
| Scene graph | `build-scene.ts`, recipes (`sat-clock-recipe`, `assembly-recipe`) | Deterministic, template-driven | Manual recipe authoring for new products |
| Meshes | Parametric composites + optional `public/models/parts/*.glb` | Always-on fallback; GLB underlay | Not photoreal Unreal materials |
| Harness | `harness.ts` pin-to-pin routes from nets | Electrical truth in 3D | Craft droop, not cable FEM |
| Stage UX | `ProductAssemblyApp` — play build, phase chips, scrub, solo, explode, inspect | Product-shaped | Desktop sim polish lower than Unreal |
| Materials / post | MeshPhysical + HDRI + N8AO/Bloom tiers | Palantir-grade parametric; adaptive dpr | Not cinematic ray tracing |
| Spatial brain | `applySpatialReasoning` design-intent rules | Solar sky / OLED user / power low | Heuristic, not optimizer |

**Authority rule (non-negotiable):** parametric scene graph is truth; beauty underlay is optional; never cage×factor electronics sizes.

### 1.2 Step walkthrough (J2)

| Layer | Implementation | Strength | Weakness |
|-------|----------------|----------|----------|
| Compiler facts | `steps/compile` → focusPartIds, connections, silkscreen pins | Text/2D/3D consistency | LLM netlist for generated plans (ERC only) |
| Scrub authority | `scrubForStep` shared app + audit | Single source of truth | Recipe-less templates weaker |
| Pin focus | `pin-focus.ts` world mm + `frameForPin` | Pure math, testable | Pin alias map (GPIO4→GPIO) needed |
| Presence | `step-presence` + phase filter | No ghost future parts | Needs recipe phases |
| Audit gate | `step-render-audit.ts` | Catches black stage / NaN camera / unresolved focus | Does not prove physical correctness |
| Wire color | `wire-colors.ts` single authority | No SDA green-vs-blue drift | — |

**Kitchen-table constraint:** beginner on phone; 3D hero frames the two pins; Connections table and harness share color; no MATLAB install.

### 1.3 Architectural invariant

```
BuildPlan / BOM / netlist
        │
        ▼
product-3d (TS, mm, pins)  ──►  R3F canvas (browser)
        │
        ├── step-render-audit (CI / grader)
        └── Live AR (separate, camera) — not MathWorks
```

Any MathWorks path that **breaks** “pure-TS authority + browser canvas” fails the charter even if pixels look better.

---

## 2. MathWorks product map (inventory)

### 2.1 Commercial products (visualization-relevant)

| Product | 3D role | Depends on | Host OS notes |
|---------|---------|------------|---------------|
| **Simulink 3D Animation** | Primary bridge MATLAB/Simulink ↔ **Unreal Engine** photoreal env; Simulation 3D Scene Configuration, Actor, Camera, … | MATLAB; Simulink for blocks | Unreal 3D sim **not on Mac** |
| **Robotics System Toolbox** | Manipulators, mobile robots; Simulation 3D Robot / scene blocks; co-sim with SL3D | MATLAB (+ often Simulink) | Same Unreal limits |
| **UAV Toolbox** | UAV scenarios, Unreal scenes, sensors | MATLAB/Simulink + often SL3D | Flight/perception domain |
| **Aerospace Toolbox / Blockset** | Aircraft/spacecraft viz; globe; flight instruments; Unreal assets; FlightGear option | MATLAB (+ Simulink for blockset) | Aerospace domain |
| **Simscape Multibody** | Multibody mechanics; **Mechanics Explorer** auto 3D animation | MATLAB + Simscape | Great for linkages; not electronics kits |
| **MATLAB (base)** | `plot3`, `patch`, `surf`, `hgtransform`, App Designer 3D axes | MATLAB only | Desktop figures, not web product |
| **Simulink Compiler + Web App Server** (deployment family) | Package sims for non-MATLAB users (desktop or enterprise web) | Compiler licenses; not free embed | Heavy; not Next.js SPA |

Legacy: VRML/X3D virtual worlds + VR Sink — **deprecated**; do not plan on them.

### 2.2 Public MathWorks GitHub (adjacent, not a free Unreal)

| Repo | What it actually is | License posture |
|------|---------------------|-----------------|
| [mathworks-robotics/*](https://github.com/mathworks-robotics) | Examples, walking robot, mobile robotics toolbox | Example code often BSD-ish; **runtime still needs MATLAB toolboxes** |
| [mobile-robotics-simulation-toolbox](https://github.com/mathworks-robotics/mobile-robotics-simulation-toolbox) | Vehicle kinematics, simple visualization, sensors | Free toolbox files; host is MATLAB |
| [Simulation-Animation-Deployment-for-Simulink-Compiler](https://github.com/mathworks/Simulation-Animation-Deployment-for-Simulink-Compiler) | Example: trajectory + SL3D + **deploy standalone** | Requires Compiler + licensed products to rebuild |
| [robot-vla-simulink](https://github.com/mathworks/robot-vla-simulink) | VLA models + Unreal robot manip + camera greenscreen | Research framework; full MW + Unreal stack |

**Critical distinction vs AR-VENDOR-EVAL:** SanderGi ships **MIT weights** we can run in-browser. MathWorks GitHub ships **examples that still assume a paid MATLAB seat**.

---

## 3. Detailed evaluations

### 3.1 Simulink 3D Animation — **Do not replace core** (fidelity high, product fit low)

- **Vendor page (concept):** Connects Simulink models and MATLAB algorithms to **Unreal Engine** for photoreal 3D simulation of dynamic systems.  
- **Blocks / APIs:** Simulation 3D Scene Configuration, Actor, Camera, sensor blocks; MATLAB APIs for scene control.  
- **Industries (vendor claim):** automotive, aerospace, robotics, virtual commissioning, **synthetic data generation**, industrial manufacturing.  
- **Requirements:** MATLAB required; Simulink for block library; Unreal path not on Mac; custom scenes → Unreal Editor separately.

#### Fit matrix

| Criterion | J1 score | J2 score | Notes |
|-----------|----------|----------|-------|
| Correct problem | ★☆☆☆☆ | ★☆☆☆☆ | Dynamic systems in game engine ≠ DIY sat-clock kit coach |
| Browser / mobile | ★☆☆☆☆ | ★☆☆☆☆ | Desktop Unreal co-sim; not R3F in Next |
| Life-mm + pin authority | ★★☆☆☆ | ★☆☆☆☆ | Can import meshes with transforms; **no** first-class silkscreen pin map / BOM netlist coach |
| Step sequence | ★☆☆☆☆ | ★☆☆☆☆ | Simulation time ≠ assembly step scrub; no `focusPartIds` |
| License / redistribute | ★☆☆☆☆ | ★☆☆☆☆ | Commercial; cannot ship Unreal co-sim to free web users |
| Photoreal fidelity | ★★★★★ | ★★★☆☆ | Best-in-class if you buy the stack |
| Integration into Forge TS | ★☆☆☆☆ | ★☆☆☆☆ | Would replace kernel, not adapter |

**Weighted (approx):** J1 ~1.7/5 · J2 ~1.2/5 → **Pass as runtime / Do not replace core**.

#### What we could steal (ideas only)

| Idea | Forge translation (without MATLAB) |
|------|-------------------------------------|
| Photoreal stills for marketing | Offline Blender/Unreal **outside** app; bake PNG/GLB underlay |
| Simulation 3D Camera → labeled frames | Synthetic data for **AR** board detectors (SanderGi train loop) — later |
| Actor place/pose API | We already have `PoseLayout3D` + gizmo |
| Sensor co-sim | Out of scope for kit coach |

#### Integration path if someone forces it (do not schedule)

1. Buy MATLAB + Simulink + SL3D + Windows/Linux Unreal machine.  
2. Rebuild sat-clock as Unreal actors driven by Simulink signals.  
3. Capture video or stream pixels to web (WebRTC / pixel streaming).  
4. Lose pure-TS audit, phone-first UX, OSS path, Mac dev, pin golden tests.  

**Estimate:** multi-quarter product rewrite. **Risk:** existential architecture change for cosmetics.

**Do not:** put MathWorks runtime on the critical path of `ProductAssemblyApp`.

---

### 3.2 Robotics System Toolbox (+ Simulation 3D Robot) — **Pass for product**

- **Job (vendor):** Model robots, plan motion, simulate sensors, visualize manipulators/mobile bases; often with Unreal via SL3D.  
- **GitHub adjacency:** walking robot examples, MRST, robot-vla-simulink.

| Criterion | J1 | J2 | Notes |
|-----------|----|----|-------|
| Correct problem | ★★☆☆☆ | ★☆☆☆☆ | Robot twin ≠ electronics assembly story |
| Browser | ★☆☆☆☆ | ★☆☆☆☆ | MATLAB desktop |
| Pins / BOM | ★☆☆☆☆ | ★☆☆☆☆ | Joint frames, not GPIO silkscreen |
| Step walkthrough | ★☆☆☆☆ | ★☆☆☆☆ | Trajectory time, not “solder SDA” |
| License | ★☆☆☆☆ | ★☆☆☆☆ | Toolbox add-on |
| Fidelity | ★★★★☆ | ★★☆☆☆ | Strong robot meshes / scenes |

**Verdict:** **Pass.** Useful only if Forge ever ships a **robotics education** vertical with institutional MATLAB labs — not current kitchen-table product.

---

### 3.3 UAV Toolbox / Aerospace Toolbox — **Wrong domain**

| Product | 3D strength | Why it fails J1/J2 |
|---------|-------------|---------------------|
| UAV Toolbox | Unreal UAV scenes, sensors | Drones, not sat-clock modules |
| Aerospace Toolbox | Globe viewer, cockpit instruments, photoreal aerospace assets, FlightGear bridge | Aircraft/spacecraft dynamics |

| Criterion | Score both jobs |
|-----------|-----------------|
| Domain match | ★☆☆☆☆ |
| Browser kit coach | ★☆☆☆☆ |
| Pin/harness BOM | ★☆☆☆☆ |

**Verdict:** **Pass.** Cite only as “MathWorks 3D investment is deep in vehicle dynamics, not hand assembly.”

---

### 3.4 Simscape Multibody (Mechanics Explorer) — **Pass**

- **Job:** Multibody mechanical systems; **auto-generated 3D animation** of joints/bodies during simulation.  
- **vs SL3D:** Mechanics Explorer is the right viz for *linkages and CAD assemblies under physics*; SL3D/Unreal is for *photoreal world + sensors*. Community consensus: don’t use Multibody “just for pretty 3D.”

| Criterion | J1 | J2 |
|-----------|----|----|
| Correct problem | ★★☆☆☆ (mechanical only) | ★☆☆☆☆ |
| Electronics pin coach | ★☆☆☆☆ | ★☆☆☆☆ |
| Browser | ★☆☆☆☆ | ★☆☆☆☆ |
| Auto animation of assemble sequence | ★★☆☆☆ | ★★☆☆☆ (time-based, not instruction-compiled) |

**Verdict:** **Pass.** If we needed hinge/door kinematics later, evaluate **Three.js constraints** or a light physics lib first — not a Simscape seat.

---

### 3.5 Base MATLAB Graphics — **Not a product renderer**

- `patch` / `surf` / `trimesh` / `hgtransform` / App Designer.  
- Fine for internal engineering plots of pin coordinates.  
- **Cannot** ship as Forge’s product-3D or step hero.

| Criterion | Score |
|-----------|-------|
| Correct problem | ★☆☆☆☆ |
| Browser | ★☆☆☆☆ |
| Quick offline debug of mm data | ★★★★☆ (engineers who already have MATLAB) |

**Verdict:** **Pass** for product. Optional personal workflow for founder if they already own MATLAB: dump `RealPartSpec` to CSV and plot pins — zero product dependency.

---

### 3.6 Mobile Robotics Simulation Toolbox (GitHub) — **Ideas only**

- **URL:** https://github.com/mathworks-robotics/mobile-robotics-simulation-toolbox  
- **Job:** Vehicle kinematics, visualization, sensor simulation utilities for MATLAB/Simulink.  
- **Extensive vs us:** Sensor models, occupancy, differential drive viz.  
- **Not adoptable as-is:** MATLAB host; mobile robot domain.

**Action:** Steal **nothing** for product-3D. Optional conceptual parallel: “simple viz layer over kinematics” ≈ our parametric mesh over pose — we already have that in TS.

---

### 3.7 Simulation-Animation-Deployment-for-Simulink-Compiler — **Pass**

- **URL:** https://github.com/mathworks/Simulation-Animation-Deployment-for-Simulink-Compiler  
- **Job:** Example of trajectory tracking (Robotics System Toolbox) + SL3D viz + **standalone deploy** via Simulink Compiler.  
- **Lesson:** MathWorks’ answer to “users without MATLAB” is **Compiler packaging**, not open WebGL.  
- **vs Forge:** We already ship to users with zero install beyond a browser. Compiler path is the **opposite** of our distribution model.

**Verdict:** **Pass.** Validates that even MathWorks does not treat browser SPA as the SL3D delivery model.

---

### 3.8 robot-vla-simulink — **Wrong job** (research only)

- **URL:** https://github.com/mathworks/robot-vla-simulink  
- **Stack:** Simulink + Unreal + MATLAB–Python co-sim + VLA (Octo, RT-1-X) + Simulation 3D Camera + greenscreen composite.  
- **Extensive:** Closed-loop vision-language-action robot manip; sim-to-real visual tricks.  
- **Forge gap it does *not* close:** step instruction consistency, BOM pins, kitchen-table solder coach.

| Interesting for | Not interesting for |
|------------------|---------------------|
| Future “robot arm builds the kit” research | J1 product renderer |
| Synthetic camera streams for ML | J2 step walkthrough |
| Greenscreen / composite ideas for AR marketing | Replacing R3F |

**Verdict:** **Pass** for current product. Bookmark for **agentic robotics** expansion only (`FORGE-AGENTIC-EXPANSION.md` long horizon).

---

## 4. Head-to-head: MathWorks stack vs Forge product-3d

### 4.1 Capability matrix

| Capability | MathWorks (SL3D + toolboxes) | Forge product-3d | Winner for kit product |
|------------|------------------------------|------------------|------------------------|
| Photoreal world | Unreal | Parametric PBR + HDRI | MathWorks (fidelity) / Forge (job) |
| Life-mm datasheet parts | Manual mesh import | `RealPartSpec` + tests | **Forge** |
| Silkscreen pin framing | Custom actors | `pin-focus` + sat-pins | **Forge** |
| Netlist → 3D harness | Manual | `harness.ts` | **Forge** |
| Assembly phase scrub | Simulation time hacks | `AssemblyRecipe` phases | **Forge** |
| Step audit without GPU | N/A | `step-render-audit` | **Forge** |
| Browser phone | No (Compiler/Web App Server ≠ SPA) | Yes | **Forge** |
| Mac founder bench | Unreal path no | Yes | **Forge** |
| Multibody contact physics | Simscape Multibody | None | MathWorks (non-goal) |
| Sensor sim (lidar/cam) | Yes | No | MathWorks (non-goal) |
| License for public SaaS | Seat / Compiler | OSS stack | **Forge** |
| Synthetic training images | Strong | Manual / future | MathWorks *as offline tool* |
| BOM-driven generative templates | Weak | Templates + spatial brain | **Forge** |

### 4.2 Job scores (summary)

| Candidate | J1 Entire renderer | J2 Step walkthrough | Action |
|-----------|--------------------|---------------------|--------|
| Forge product-3d (baseline) | **5.0 product fit** | **5.0 product fit** | Keep kernel |
| SL3D + Unreal | 1.7 | 1.2 | Do not replace core |
| Robotics ST | 1.5 | 1.0 | Pass |
| UAV / Aerospace | 1.0 | 0.8 | Pass |
| Simscape Multibody | 1.8 | 1.1 | Pass |
| MATLAB Graphics | 1.2 | 0.9 | Pass |
| MRST GitHub | 1.1 | 0.9 | Ideas only |
| Compiler deploy example | 1.3 | 1.0 | Pass |
| robot-vla-simulink | 1.6 | 1.0 | Later research only |
| Offline Unreal/Blender stills (non-MW or MW lab) | 2.5 as *asset pipeline* | 1.5 | **Later optional** |

---

## 5. Two-job deep dive

### 5.1 Job J1 — Entire product renderer

**Question:** Should we rewrite or dual-run the product assembly stage on MathWorks 3D?

| Option | Description | Cost | Residual risk |
|--------|-------------|------|---------------|
| **A. Status quo (recommended)** | Keep Three.js/R3F + `product-3d` | $0 license | Fidelity ceiling vs Unreal |
| **B. Unreal pixel stream into page** | SL3D server streams frames | High seats + GPU host + stream infra | Latency, Mac, offline, pin tests dead |
| **C. MATLAB Web App for 3D only** | Separate MW web app | Enterprise Web App Server | Split UX, identity, deploy |
| **D. Offline beauty bake** | Use any DCC (Blender primary; Unreal optional) to bake GLB/PNG; load in Forge | Artist time | Authority still parametric |

**Decision: A + optional D.**  
MathWorks does not improve J1 **product truth** (mm, pins, nets). It only improves **cinema**. Cinema is an underlay problem we already solved with GLB + materials tiers.

**NASA-level reject criteria for B/C**

1. Cannot run `npm run test:3d` / pure-TS pin math without MATLAB.  
2. Cannot guarantee 0.5 mm geom tests in CI Linux without licensed runner.  
3. Cannot serve anonymous web users without redistributing MW IP or streaming from licensed hosts.  
4. Breaks Mac platform parity for Unreal co-sim.  
5. Step audit would need pixel/vision regression instead of deterministic scrub math.

### 5.2 Job J2 — Step-by-step walkthrough

**Question:** Can MATLAB improve “camera zooms to the right pins on step 6”?

Map J2 pipeline to MathWorks equivalents:

| Forge step-walk need | Closest MathWorks concept | Gap |
|----------------------|---------------------------|-----|
| `compiled.focusPartIds` | Actor selection by name | No compiler from kit netlist |
| `scrubForStep` / phases | Simulation time `t` | Different semantics; not instruction phases |
| `frameForPin` / pin locals | Socket frames on CAD | No silkscreen alias graph |
| `step-render-audit` | Manual visual check / Simulink Test | No portable pure function in our CI |
| Wire color authority | Material instance on cable mesh | Not tied to `wire-colors.ts` |
| Technique inset + Connections table | Separate App Designer UI | Not unified step screen |
| Phone browser | Pixel stream or nothing | Fails kitchen-table |

**Decision: no MathWorks component on J2 critical path.**  
Improving J2 means more **recipe fidelity**, **pin maps**, **audit gates**, and **hero UX** — all inside `product-3d` + steps compiler. See `docs/designs/step-instruction-overhaul.md`.

If photoreal step *stills* are desired later: bake one PNG per step offline (D), serve under `public/build-photos/` (E1 pattern) — still not MATLAB runtime.

---

## 6. Cost, license, and operational risk (honest)

| Factor | MathWorks path | Forge path |
|--------|----------------|------------|
| Dev seats | MATLAB + Simulink + SL3D + domain toolbox(es); annual commercial | Node + browser; already paid |
| Unreal Editor | Separate for custom scenes | Not required |
| Host OS for Unreal co-sim | Windows/Linux (not Mac) | Mac/Win/Linux browsers |
| CI | Licensed MATLAB runners or skip 3D tests | `vitest` pure TS + optional playwright |
| End-user license | Compiler / Web App Server / institutional | Browser free |
| Export control / procurement | Enterprise friction | Normal SaaS deps |
| Vendor lock | High (scene in Unreal + models in SLX) | Low (TS + GLB + JSON plan) |
| Exit cost | Rebuild meshes + logic in web | Stay |

**Order-of-magnitude:** even a single Individual + add-ons is typically **thousands USD/year**; institutional standard seats higher. Exact quotes via MathWorks sales — treat as **blocking** vs free OSS web kernel, not a rounding error.

---

## 7. Gap analysis: extensive MathWorks vs Forge one-shot

| Capability | MathWorks depth | Forge now | Priority for kit product |
|------------|-----------------|-----------|---------------------------|
| Photoreal environment | Deep (Unreal) | Mid (PBR parametric) | P3 beauty only |
| Dynamics / multibody | Deep | None | Non-goal |
| Sensor synthetic data | Deep | None | P2 for AR train only |
| BOM → life-mm electronics | Shallow | Deep | **Already won** |
| Pin-level solder coach | Shallow / custom | Deep + audits | **Already won** |
| Step instruction compile | None | Deep (overhaul) | Keep investing |
| Browser deploy | Weak for 3D | Native | **Already won** |
| Open license | No | Yes | **Already won** |

**Conclusion:** Unlike SanderGi for AR (correct problem, MIT weights, browser-exportable), **no MathWorks 3D product is a SanderGi-class pull**. The “extensive” systems are extensive at **vehicle/robot simulation**, not at **hand-assembly product visualization**.

---

## 8. Recommended policy (adopt / pass / later)

### 8.1 Do now

1. **Keep** Three.js + `@react-three/fiber` + `src/lib/product-3d` as sole runtime renderer for J1 and J2.  
2. **Keep investing** in pin maps, recipes, `step-render-audit` as ship gates, GLB underlays from `RealPartSpec`.  
3. **Document this eval** as authority when “why not MATLAB Unreal?” appears in roadmap debates.

### 8.2 Do not

1. Do **not** replace product-3d with Simulink 3D Animation.  
2. Do **not** require MATLAB seats for builders or CI.  
3. Do **not** plan VRML/VR Sink revival.  
4. Do **not** confuse MathWorks GitHub examples with redistributable browser engines.  
5. Do **not** use Unreal co-sim on Mac-blocked path as a founder-critical workflow.

### 8.3 Later (optional, offline only)

| Track | When | How without locking product kernel |
|-------|------|-------------------------------------|
| **Beauty stills** | Marketing / share cards | Blender (preferred OSS) or any DCC → PNG/GLB; parametric remains authority |
| **Synthetic AR data** | After SanderGi production lock is stable | If a lab already has MATLAB+SL3D, generate labeled board images; train/export ONNX **outside** monorepo (same rule as AR-VENDOR-EVAL: don’t check 13 GB into git) |
| **Institutional twin demos** | University partner with campus MATLAB | Separate demo reel; link out; not Forge SPA |
| **Robotics education vertical** | New product line | Re-open Robotics ST / robot-vla as greenfield — not a sat-clock dependency |

### 8.4 If leadership demands “photoreal like MATLAB Unreal”

Ordered alternatives that preserve architecture:

1. Raise R3F quality tier (HDRI, AO, GLB fidelity) — already in design (`3d-fidelity-flux-parity.md`).  
2. Offline Blender Cycles/Eevee beauty underlay.  
3. Third-party web pixel streaming of **our** Unreal scene (no MATLAB) — still expensive; last resort.  
4. MATLAB SL3D — only as offline render farm operated by humans, never user-facing runtime.

---

## 9. Comparison table (honest)

| | Forge product-3d | SL3D + Unreal | Simscape Multibody | MATLAB Graphics | robot-vla-simulink |
|--|------------------|---------------|--------------------|-----------------|---------------------|
| Time to first kit 3D | Shipped | Quarters + seats | Wrong domain | Hours (plot only) | Research stack |
| Step pin coach | Yes | Custom only | No | No | No |
| Works in phone browser | Yes | No | No | No | No |
| Life-mm tests in CI | Yes | Licensed runner | Partial mech | No | No |
| Photoreal | Mid | Highest | Low–mid | Low | High robot scenes |
| Public SaaS cost | Low | Very high | High | High | Very high |
| Mac Unreal | N/A | Unsupported | N/A | N/A | Unsupported |
| Correct job (DIY kit) | Yes | No | No | No | No |

---

## 10. Traceability to Forge files

| Concern | Authority file(s) |
|---------|-------------------|
| Product 3D goals / stack | `docs/PRODUCT-3D.md` |
| Life-mm parts | `docs/PRODUCT-3D-REAL-PARTS.md`, `src/lib/product-3d/real-parts.ts` |
| Scene build | `src/lib/product-3d/build-scene.ts` |
| Harness | `src/lib/product-3d/harness.ts` |
| Pin focus | `src/lib/product-3d/pin-focus.ts`, `sat-pins.ts` |
| Step scrub + audit | `src/lib/product-3d/step-render-audit.ts`, `assembly-recipe.ts` |
| Step instruction product | `docs/designs/step-instruction-overhaul.md` |
| Fidelity roadmap | `docs/designs/3d-fidelity-flux-parity.md` |
| AR vendor pattern (this doc’s sibling) | `docs/AR-VENDOR-EVAL.md` |

---

## 11. Final recommendation (executive)

| Question | Answer |
|----------|--------|
| Use MATLAB for the **entire renderer**? | **No.** Wrong runtime, license, OS, and job. Keep product-3d. |
| Use MATLAB for the **step-by-step walkthrough**? | **No.** Walkthrough is compiler + pin focus + audit in TS; MathWorks has no product surface for that. |
| Is MathWorks 3D “extensive”? | **Yes** — for industrial dynamics and Unreal co-sim. |
| Is that extensiveness useful to Forge now? | **Almost only as a foil** and optional offline synthetic-data lab. |
| Closest “adopt” analogue to SanderGi? | **None.** Do not force an adopt for optics. |
| Next engineering dollars | Pin maps, recipes, step audit gates, GLB fidelity — **not** MATLAB integration. |

**Signed decision:** **Do not adopt MathWorks 3D products as Forge product or step runtime. Pass for J1/J2. Later = offline beauty/synthetic only, if ever.**

---

## Appendix A — Source notes (vendor claims used)

- Simulink 3D Animation: Unreal connection; MATLAB required; Simulink for blocks; industries include synthetic data and industrial manufacturing; custom Unreal scenes need separate Unreal Editor.  
- Platform: Unreal-based 3D simulation **not currently supported on Mac** (MathWorks product requirements for Simulink 3D Animation).  
- Aerospace / UAV / Robotics toolboxes: domain-specific Unreal/globe/robot visualization layered on the same Simulation 3D ecosystem.  
- Simscape Multibody: automatic Mechanics Explorer animation for multibody dynamics.  
- MathWorks GitHub orgs (`mathworks`, `mathworks-robotics`): examples and research frameworks that **assume** licensed MATLAB/Simulink/SL3D rather than shipping a free browser engine.  
- Community/docs: VR Sink / classic VR path deprecated in favor of Simulation 3D blocks.

Exact list prices intentionally omitted (quote-only); treat commercial seats as **order-of-thousands USD/year** and architecture-blocking for a free web coach.

## Appendix B — Anti-patterns (do not do these)

1. “Embed MATLAB figure in iframe” as product 3D.  
2. Dual-maintain sat-clock in SLX and `build-scene.ts`.  
3. Replace `step-render-audit` with “looks good in Unreal.”  
4. Require builders to install MATLAB Runtime for assembly steps.  
5. Use campus-wide MATLAB availability as justification for product kernel choice (users are not all students with campus licenses).

## Appendix C — One-page scorecard (print / paste to PR)

```
CANDIDATE: MathWorks 3D family (SL3D, Robotics, UAV, Aero, Multibody, Graphics, GH examples)
JOB J1 (entire renderer):  PASS / DO NOT REPLACE CORE
JOB J2 (step walkthrough): PASS
ADOPT ANY RUNTIME PIECE?   NO
OFFLINE LATER?             Beauty stills / synthetic AR data only
KERNEL REMAINS:            src/lib/product-3d + R3F
SIBLING EVAL:              docs/AR-VENDOR-EVAL.md (SanderGi = adopt; this stack = pass)
DATE:                      2026-07-29
```
