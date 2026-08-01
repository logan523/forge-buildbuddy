# Job-to-be-done: bench truth (not product chrome)

## What the founder was actually asking for

Across the expansion chats, the surface request was “expand the product / improve the renderer / step-by-step.” The *real* ask, once the frustration landed:

> I am a first-time solderer. I need **exact solder pads, screws, and connection points**. Pretty 3D and agent scaffolding do not help me put the iron on the right metal.

Secondary signals:
- “2D pin diagrams more useful than 3D”
- “Still don’t fucking see anything useful” (maps buried under prep steps + prose)
- Permission to **overhaul** the walkthrough, not bolt on more features

**Not** the job: MCP, classroom packs, skills digests, MathWorks-style agent expansion, product-orbit 3D.

## The job (one sentence)

When I hold a soldering iron and two modules, show me **which pad, which pad, which wire color**, and let me check it off — in under two seconds of scanning.

## Open-source / industry patterns that already solve this

| Source | Pattern we took |
|--------|-----------------|
| [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) | BOM/list + highlight: click a row, see the place on the board |
| [Fritzing](https://github.com/fritzing/fritzing-app) | Breadboard/module face with real-looking pin headers, not abstract blobs |
| [GitBuilding](https://gitbuilding.io/) | One physical action per step; docs stay in sync with the build |
| SparkFun / Adafruit guides | Huge connection figure first; silkscreen text is authority |
| iFixit | Callout on the exact fastener/joint; prose secondary |

## What shipped in the overhaul

1. **SolderWorkbench** replaces dual-column product UI for any step with compiled `microSteps`
2. **Action strip**: `Solder {color} wire: {fromPin} → {toPin}` + mark done
3. **Pin map SVG**: module faces with pin-header rows; active pad glows **SOLDER HERE**
4. **All-wires list** (IBOM-style): 22 rows, tap to focus, checkbox per wire
5. Demo jumps to the wiring step so maps are immediate

## Success test

Open `/build/sat-line-smart-clock` hard-refreshed. Without scrolling past a wall of prose you can answer:

1. Which wire am I doing? (color + index)
2. Which silkscreen pin on board A?
3. Which silkscreen pin on board B?
4. How many left? (list 0/22 …)
