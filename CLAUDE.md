# Forge — a build that proves itself

*Rewritten 2026-08-24, after the rebuild. The previous version described a product that no longer exists.*

## What Forge Is

You are at a bench holding a soldering iron and two modules. Forge tells you **the next single action, in your world — your parts, your colours, your hole coordinates — and proves it worked before you trust it.**

That sentence is the whole product. It is also the exact thing the owner needed and could not get from the previous version, which he abandoned in the first hour of a real build and replaced with a chat window.

## Who It's For

Beginners, at NASA-grade rigor. Those are not in tension: the rigor is what makes it safe to hand to a beginner. Someone who has never soldered should be able to finish a build, and every claim the product makes along the way should be one it can account for.

The question to design against is the one that was actually asked, over and over: **"where do I put each wire, where do I plug each breadboard thing."**

## The Contract (read this before writing any UI)

Every fact that can reach a builder's eye is a `Claim` (`src/lib/claim/`):

```ts
Claim<T> = { kind: "derived";   value: T; from: string }        // computed; `from` cites what
         | { kind: "declared";  value: T; at: string }          // the builder said so
         | { kind: "evidenced"; value: T; tier; at: string }    // an instrument answered
         | { kind: "unknown";   need: string }                  // and what would close it
```

**`unknown` has no `value` field.** That is the mechanism, not a convention — you cannot read a value off it, so you cannot render one. `<Fact claim={...}/>` (`src/components/claim/fact.tsx`) takes a Claim and nothing else; `<Fact value={x ?? "guess"}/>` does not compile, and three `@ts-expect-error` directives in its test fail the build if that ever changes.

Precedence is **evidenced > declared > derived > unknown**. Declared beats derived deliberately: the plan says the pad is `GND`, his board says `G`, and about his own bench he is right.

`derivedOr(maybe, from, need)` replaces `a ?? b` anywhere a fallback used to invent an answer.

**Why this exists.** On 2026-08-24 the live screen told a builder to buy a `0.96" SSD1306 OLED module` when they needed a 1S battery level indicator, because seven regexes matched product names and "capacity **display**" hit `/oled|ssd1306|display/`. That same wrong spec drove the life-size hold-it-up card, so the feature built to identify parts was drawing a different part at actual size. Nothing threw. Every layer did what it said. More validation would not have helped — there was nowhere for "we don't know" to live.

Expect screens to look emptier than ones that guessed. That emptiness is the honest reading.

## North Star

**Make builders' lives simpler.** Unchanged, and now with a second test beside it: *can the product account for everything it just said?* A screen that is confidently wrong fails the north star harder than a screen that admits a gap.

## How It Works

```
describe a project / paste a link → /api/analyze → BuildPlan
                                                      ↓
                                   applyTrustPipeline(plan, reality)   ← ONCE per load
                                                      ↓
   safety gate → bench: one action · one picture · one proof → live check → done
```

### File Map

| Path | Purpose |
|---|---|
| `src/lib/claim/` | **The contract.** Read it first. |
| `src/components/claim/fact.tsx` | The render boundary that enforces it |
| `src/components/bench/` | **The product.** action-card · bench-screen · bench-session · safety-gate · parts-sheet · declare-color · declare-hole · board-sheet · power-gate · proof-strip · chapter-sheet · stuck-sheet |
| `src/lib/actions/cursor.ts` | The spine — ONE ordered action list, ONE position |
| `src/lib/build-reality/` | The builder's own world: joints, evidence tiers, declared colours, hole coordinates. Contract: `docs/BUILD-REALITY.md` |
| `src/lib/breadboard/` | Board geometry + the shared-column short-catch |
| `src/lib/electrical/` | Netlist, nets, voltage domains, ERC. The rigorous core; authority for gates |
| `src/lib/steps/` | classify · compile (netlist → per-step facts) · validate |
| `src/lib/serial/` | Web Serial, I²C scan, bus-proof. **The one capability a camera and an LLM cannot replicate** |
| `src/components/flash/` | Its surface: console, flash flow, missing-device panel |
| `src/lib/hazards.ts` | Hazard tokens → human words; which ones gate a build |
| `src/lib/cost.ts` | One cost answer, as a Claim. Real prices beat authored guesses |
| `src/lib/part-identity.ts` | Catalog id → measured spec, via **seven explicit entries and nothing else** |
| `src/lib/trust.ts` | `applyTrustPipeline` + `trustPipelineRuns` (a counter, because "we think it runs once" is the claim this rebuild exists to stop making) |
| `src/lib/step-media/circuit-diagram.ts` | The whole-circuit picture, current wire lit |
| `src/lib/unstick.ts` | Diagnosis trees, reality-aware |
| `src/lib/capability.ts` | Web Serial is desktop-Chromium only — degrade honestly, never block |
| `src/lib/core-loop.golden.test.ts` | **The contract the product may not break.** Six assertions, one per wall the real build hit |

### Kept but barely reached — know this before assuming coverage

The rebuild deleted the surface, and some subsystems lost their only UI along with it. They still compile and still have tests; nothing reaches them from the build flow:

| Subsystem | Lines | Reachable from |
|---|---|---|
| `src/components/stage/` + `src/lib/stage/` + `src/lib/product-3d/` | ~9,900 | the homepage demo hero only, and `/dev/stage` |
| `src/lib/product-visual/` | 1,515 | nothing in the UI (it fed the deleted product hero) |
| `src/lib/part-scan/` | 1,941 | its API route only; the camera UI was deleted |
| `src/lib/pcb/`, `enclosure/`, `skills/`, `tasks/` | ~1,150 | nothing |
| `src/lib/mcp/` | 608 | `/api/mcp` + scripts. A second full entry point into 11 domain modules — it will fight refactors |

None of this is deleted, because none of it was asked to be. But do not describe the 3D system as central: it renders one hero on one screen.

## Anti-Patterns (DO NOT REPEAT)

### 1. Confidently wrong beats admitting a gap — it doesn't
The wrong-part bug, the two contradictory prices, `getRealPart()` typed to always succeed while returning `undefined`. Every one was a `??` filling a hole with something plausible. **If you cannot account for it, render the gap.**

### 2. Over-engineering
A 14-component architecture, a 3-pass pipeline with research agents, a chat IDE, image generation, a Zustand store. All noise. *Amended:* "just parts + steps" was also too small — steps must be about **the builder's actual bench** or they get abandoned for a chat window. That layer is `build-reality/`, and it is deterministic, testable and local.

### 3. Under-engineering / deleting working features
A previous rewrite stripped the app to 165 lines and lost working features, because nothing defined "working" except the code being deleted. **This is why `core-loop.golden.test.ts` exists and why it passed BEFORE the delete.** Write the golden first, or don't delete.

### 4. Broken visuals
Higgsfield, Fritzing templates, Kroki — all abandoned. Wiring truth renders from the compiler (`steps/compile.ts` → the circuit diagram), so colours and pins cannot disagree with each other. **Derived from data, never LLM-drawn.**

### 5. Vague shopping queries
"Battery Level Indicator" returns garbage. Voltage, interface, form factor, key spec — or say you don't know.

### 6. Guessing identity from a name
Seven regexes over product names assigned physical specs and SKUs from unrelated parts. **A name is not evidence.** Bridge by explicit id, or return null.

### 7. Rewriting instead of editing
page.tsx was rewritten from scratch three times in one conversation. Small, surgical changes.

## Quality Bar (self-audit before reporting done)

1. `npx tsc --noEmit` — zero errors
2. `npm test` — **828 tests, 826 pass.** The 2 failures are long-standing `pins.test.ts`; anything else is yours
3. `src/lib/core-loop.golden.test.ts` — all six. If one fails you removed a capability, not a rendering
4. Dev server on **3007** (`.claude/launch.json`, `autoPort: true`) returns 200
5. A real plan opens on safety, then one action with both endpoints named
6. Count what you changed: rendering variants, progress readings, navigations. Report numbers, not adjectives
7. Does it pass "make builders' lives simpler" *and* "can we account for this"?

## Tech Stack

Next.js 16 App Router · TypeScript · Tailwind v4 · Anthropic Claude (single pass) · three.js / react-three-fiber (homepage hero) · **no state library** (useState + one external store for reality) · **IndexedDB** for build reality, localStorage for plans and progress.

## When to Use Skills

Proactively. Design/UX changes → `/general-design-review`, `/ux-heuristics-review`. Architecture → `/plan-eng-review`. Bugs → `/investigate`. Scope → `/plan-ceo-review`. Shipping → `/retro`.

**Review live screens, never mockups.** The owner rejects static mockups; build the real screen and critique it in the browser.

**If the user seems frustrated:** stop, re-read the north star, remove friction. Do not add features.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
