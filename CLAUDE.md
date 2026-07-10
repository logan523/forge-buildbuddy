# Forge — AI-guided DIY electronics build platform

## What Forge Is

Paste a YouTube link or describe a project. Forge finds every part (with real buy links across 5 vendors) and generates step-by-step instructions a complete beginner can follow.

## Who It's For

Complete beginners who don't know electronics. They don't know what a pull-up resistor is. They don't know I2C from SPI. They need specific pin numbers, wire colors, and photos/diagrams.

## North Star

**Make builders' lives simpler.** Every change, every feature, every line of code must pass this test: does this make it easier for someone to build a project they found online?

## How It Works

```
User describes project → /api/analyze (Claude single pass) → BuildPlan JSON
                                                                    ↓
                                              page.tsx renders: parts + buy links + steps
```

### File Map

| File | Purpose |
|---|---|
| `src/app/page.tsx` | Homepage: generate plan, demos, your builds |
| `src/app/build/[id]/page.tsx` | Session route — resume plan by id |
| `src/app/build/import/page.tsx` | Import shared plan from URL hash |
| `src/components/build-session.tsx` | Orchestrator: state → PrepScreen/BuildScreen/BuildDrawers |
| `src/components/build/` | prep-screen, build-screen, build-drawers, step-hero, use-build-state (pure reducer) |
| `src/components/build-ui.tsx` | Part rows, safety panel, firmware/unstick drawers |
| `src/components/step-facts.tsx` | ConnectionsTable / CheckYourWorkCard / ActionChecklist / GlossaryText (render step.compiled) |
| `src/lib/steps/` | classify (THE step classifier), compile (netlist → per-step facts), validate (content vs truth), instruction resolvers |
| `src/lib/wire-colors.ts` | THE wire-color authority (text + 2D + 3D + legend; class wins, SDA blue / SCL yellow) |
| `src/lib/glossary.ts` | Beginner jargon definitions (step popovers + part tooltips) |
| `src/lib/diag.ts` | Local diagnostics ring buffer (every rescue path logs here) |
| `src/app/api/analyze/route.ts` | Claude → plan → trust pipeline (+ optional Nexar) |
| `src/lib/trust.ts` | Catalog match + safety validators + BOM estimate |
| `src/lib/catalog.ts` / `modules-catalog.json` | Module ground truth |
| `src/lib/cart.ts` | Multi-vendor offers, cart strategy |
| `src/lib/unstick.ts` | Diagnosis trees |
| `src/lib/firmware.ts` | Pin map + Arduino sketches |
| `src/lib/storage.ts` / `share.ts` / `modes.ts` | Persistence, share links, quick/full modes |
| `src/lib/transcript.ts` | YouTube transcript fetching |
| `src/data/sat-line.json` | Demo project |

**Core loop:** Homepage → `/build/[id]` → prep (safety + cart) → build (diagram | steps | code | PCB | case | unstick) → publish kit → `/kits`

### Moonshot modules
- `src/lib/pipeline/` — 6-layer analyze (L1 safety … L6 trust)
- `src/lib/electrical/` — **principal-EE netlist + ERC** (authority for gates)
- `src/lib/pcb/` — preview place/route; blocked when ERC errors
- `src/lib/enclosure/` — parametric OpenSCAD + SVG previews
- `src/lib/kits/` + `src/app/kits/` — free kit recipes; publish blocked on ERC errors
- `docs/ELECTRICAL-CORE.md` — electrical model contract
- `docs/SENIOR-REVIEW.md` — depth/specificity audit

## Anti-Patterns (DO NOT REPEAT)

### 1. Over-engineering
We built a 14-component architecture, 3-pass AI pipeline with research agents, cost tracking, chat IDE, debug modal, image generation, Fritzing diagrams, safety validators, community features, and a Zustand store. **All of it was noise.** The user just wants parts + steps. Start simple. Only add complexity when the simple version demonstrably fails.

### 2. Under-engineering / Deleting working features
We stripped everything to 165 lines with no demo project, no wiring diagrams, no mark-complete, no prep screen. The user lost all their existing projects. **Refine, don't destroy.** Before removing anything, ask: did the user ask for this to be removed? Does it serve the North Star?

### 3. Broken visuals
We tried Higgsfield AI (CLI tool, execSync, paid credits) for step images. It never worked. We tried Fritzing SVGs (template-based). It was half-baked. Kroki Mermaid was proven for a while, then its renderer went unused (dead code) and was deleted. **Wiring truth now renders from the instruction compiler** (`src/lib/steps/compile.ts` → ConnectionsTable, derived from the netlist — colors/pins can never disagree with the 3D view), plus local hand-authored technique SVGs (`src/lib/step-media/`). No network dependency for step visuals. Stick with derived-from-data over LLM-drawn.

### 4. Vague shopping search queries
"Battery Level Indicator" returns garbage. "1S 3.7V Li-ion battery capacity indicator LED bar module 4-segment" finds the right product. The AI prompt MUST enforce precision: voltage, interface, form factor, key spec.

### 5. Deleting code instead of editing it
We've rewritten page.tsx from scratch 3 times in one conversation. Each rewrite loses context and introduces new bugs. **Edit the existing file.** Small, surgical changes. One thing at a time.

## Quality Bar (self-audit before reporting done)

After every change, verify:
1. `npx tsc --noEmit` passes with zero errors
2. `curl localhost:3001` returns 200
3. Demo project loads, shows all parts with Buy buttons, all steps expandable
4. Each part's Buy link goes to a real search results page (not a homepage)
5. Wiring steps show a diagram (not blank)
6. The change passes "make builders' lives simpler"

## When to Use Skills

Proactively invoke without being asked. The goal: catch problems before the user sees them.

### Product & Strategy
- Scope/direction questions, "what should we build next" → `/plan-ceo-review`
- Before implementing any new feature → `/pm-spec-writing` (write a spec first, not code)
- Deciding between features → `/feature-prioritization` (impact vs effort matrix)
- Understanding WHY builders use Forge → `/jtbd-framing` (what job are they hiring Forge for?)
- After shipping → suggest `/retro`

### Design & UX (CRITICAL — use these constantly)
- **Every UI change** → `/general-design-review` (lightweight, catches the big stuff)
- **Before showing the user anything** → `/ux-heuristics-review` (Nielsen's 10 — catches what beginners will find confusing)
- **Anytime a flow feels long or complex** → `/cognitive-load-conversion` (finds friction, reduces drop-off)
- **To think like a beginner** → `/empathy-mapping` (what does a first-time builder think/feel/do?)
- **Visual polish** → `/craft` (bans gradient text, glow effects, generic AI aesthetics)
- **Accessibility** → `/accessibility` (WCAG 2.1 audit)
- **Full design system work** → `/impeccable critique` or `/design-consultation`

### Engineering
- Architecture decisions → `/plan-eng-review`
- Multi-perspective code review → `/council-review`
- Finding broken things → `/audit-swarm`
- Systematic debugging → `/investigate`

### Self-Audit Loop (run after every significant change)

Before reporting done, I must:
1. `npx tsc --noEmit` passes
2. `curl localhost:3001` returns 200
3. Demo project loads with parts + buy buttons + expandable steps
4. Run `/general-design-review` on the changed page
5. Ask: does this pass "make builders' lives simpler"?

### If the User Seems Frustrated
Stop immediately. Re-read the North Star. Run `/ux-heuristics-review` on the current state. Simplify. Do not add features — remove friction.

## Core Flow (the one thing that must always work)

```
Homepage → click demo OR describe project → loading → prep screen (safety + tools + parts checklist) → build view (split: wiring diagram | step instructions) → mark complete → next step
```

If this flow breaks, fix it before doing anything else.

## Tech Stack

- Next.js 16 App Router + TypeScript
- Tailwind CSS v4
- Anthropic Claude API (single pass, Sonnet 4.6)
- Kroki.io (Mermaid SVG diagrams via POST)
- No state library (just React useState)
- No database (localStorage for persistence)
