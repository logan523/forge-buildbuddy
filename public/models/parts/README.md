# Catalog part GLBs (life-size 3D models)

**1 unit = 1 mm.** Matches `RealPartSpec` in `src/lib/product-3d/real-parts.ts`.

There are two tiers of model here, resolved in this order at render time:

1. **Authored / sourced real models** — registered in the open **`PART_MODELS`**
   registry (`src/lib/product-3d/part-models.ts`). These are the recognizable
   parts a beginner can match to what's in their hand. When a part has a ready
   entry here, `applyCatalogHints` stamps its `assetUrl` and `CatalogGlbUnderlay`
   loads + normalizes it. **This registry is the authority and works for any
   catalog id — not just the 8 sat-clock footprints.**
2. **Parametric fallback** — every part with no ready model renders from the
   life-mm parametric mesh in `product-node-mesh.tsx`. This is what makes "any
   project" degrade gracefully instead of showing a hole.

(The crude `generate:parts` placeholders below predate the authored path; they
stay `glbReady:false` and are ignored unless explicitly opted in.)

## Live models

All eight sat_clock buyable modules are now authored (three.js, CC0):

| File | Part | bbox (mm) | Authoring script |
|------|------|-----------|------------------|
| `esp32_c3.glb` | ESP32-C3 SuperMini | 22.5 × 18 × 3.2 | `npm run models:esp32c3` |
| `oled_096.glb` | 0.96" SSD1306 OLED | 27 × 27 × 4 | `npm run models:oled096` |
| `tp4056.glb` | TP4056 charger | 25 × 19 × 3.5 | `npm run models:sat-parts` |
| `cell_16340.glb` | 16340 Li-ion cell | Ø16.5 × 34 | `npm run models:sat-parts` |
| `sht30.glb` | SHT30 sensor | 16 × 16 × 3 | `npm run models:sat-parts` |
| `ttp223.glb` | TTP223 touch | 15 × 11 × 3 | `npm run models:sat-parts` |
| `solar_cell.glb` | 60×45 solar panel | 60 × 45 × 3 | `npm run models:sat-parts` |

(`generic_pcb` has no model → parametric fallback, which is the intended catch-all
for any unrecognized board in any project.)

**Live overlays.** A GLB is a static body; dynamic detail is overlaid at render
time so it survives the switch to a real model. The OLED GLB is the module body
only (blue PCB, black glass, header) — the animated SSD1306 clock is drawn by
`product-node-mesh` on a plane at the glass front (see `scripts/author-oled096`).
Pin pads are likewise overlaid from the netlist, never baked into the GLB.

## Add a model for ANY part (the scalable path)

1. Get a GLB into this folder as `<catalog-id>.glb` — either **author** one
   (copy `scripts/author-esp32c3.mjs`, build the geometry at real mm in three.js,
   export via the headless `GLTFExporter` — see `scripts/README.md`) or **drop a
   sourced GLB** (KiCad packages3D, a CC0 export, a vendor STEP converted to GLB).
2. Register it in `PART_MODELS` (`src/lib/product-3d/part-models.ts`), keyed by the
   normalized catalog id, and set `glbReady: true`:
   ```ts
   relay_5v: {
     url: "/models/parts/relay_5v.glb",
     glbReady: true,
     unit: "mm",              // "m"/"cm" if the source isn't mm
     rotationDeg: [-90, 0, 0], // if the source is Z-up CAD, not board-in-XY / +Z up
     centerToBbox: true,       // if the source origin is a corner, not the part center
     credit: "…source + license…",
   },
   ```
3. That's it. No union edit, no switch, no renderer change. The loader normalizes
   unit → mm, applies the rotation, and (optionally) recenters to the bbox so the
   datasheet-mm pin overlays land. A part left `glbReady:false` stays parametric.

## Authored-in-Forge coordinate frame

Models authored for Forge use the `real-parts.ts` part-local frame so the
parametric `PinStub` overlays land on the physical headers without recentering:

- **X** = long edge, **Y** = short edge, **Z** = thickness (component side +Z)
- origin = part center; board-class parts lie in the XY plane
- `centerToBbox:false` for these (recentering would slide the pin overlays off)

## Legacy placeholder generator

```bash
npm run generate:parts          # write crude .glb placeholders only
```

Script: `scripts/generate-part-glbs.mjs`. Kept for parity; superseded by the
authored/sourced path above for anything meant to look real.
