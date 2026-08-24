# Forge

You are at a bench holding a soldering iron and two modules. Forge tells you the next single
action — **which wire, from which pad, to which pad** — in your own colours and hole
coordinates, and proves it worked before you trust it.

It is for beginners, built to a rigour bar that suits people who cannot yet tell when they are
being lied to.

```bash
npm install
npm run dev          # http://localhost:3007
npm test             # 828 tests
npx tsc --noEmit
```

Open `/build/solar-weather-clock` for a real build, wiring and all.

## The one idea

Every fact that reaches your eye carries how it is known:

| | |
|---|---|
| **derived** | computed from the netlist or the catalog, and it names what computed it |
| **declared** | you told us — your wire is brown, your board says `G`, this end is in C1 |
| **evidenced** | an instrument answered: the display replied at 0x3C |
| **unknown** | we don't know, and here is what would close it |

`unknown` carries no value, so no code can read one, so no screen can render one. A part we
have not matched says *"we haven't matched this to a part we've measured"* instead of quietly
printing a different product's part number — which is what it used to do.

Screens look emptier than ones that guess. That is the point.

## What's in here

| Path | |
|---|---|
| `src/lib/claim/` | the contract above |
| `src/components/bench/` | the product: one action, one picture, one proof |
| `src/lib/actions/cursor.ts` | the spine — one ordered action list, one position |
| `src/lib/build-reality/` | your bench: joints, evidence, your colours, your coordinates |
| `src/lib/electrical/` | netlist, voltage domains, ERC |
| `src/lib/breadboard/` | board geometry, and the shared-column short that burns boards |
| `src/lib/serial/` | Web Serial + I²C scan — the proof half |
| `src/lib/core-loop.golden.test.ts` | the contract the product may not break |

`CLAUDE.md` is the working constitution and is more detailed than this file.

## Verification, not vibes

`src/lib/core-loop.golden.test.ts` encodes six moments from a real twelve-day build — *"which do
I pick up next"*, *"GND is brown"*, *"the ESP got super fucking hot"*, *"answered at 0x3C"* — and
it was written to pass **before** the rewrite that replaced the entire UI, so it describes the
product rather than the code that happens to exist.

Web Serial is desktop Chromium only. Everything degrades and says so; nothing pretends.

## Also here

`docs/rocket-poster-kit/` is a self-contained Python kit that renders e-ink travel posters for
upcoming rocket launches. It has its own README and its own tests, and sits outside `npm test`
because the Node CI has no Python.
