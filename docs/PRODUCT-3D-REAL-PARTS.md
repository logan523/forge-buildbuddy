# Product 3D — real parts (dimension authority)

The sat-clock (and future products) size and place electronics from **datasheet / vendor millimetres**, not cage ratios or illustration mass.

## Authority stack

```
real-parts.ts  RealPartSpec (bboxMm + pins + mesh)
      │
      ├─ build-scene.ts   life-size layout
      ├─ sat-pins.ts      pin locals = RealPartSpec.pins
      ├─ catalog.ts       defaultSize / assetReady from RealPartSpec
      └─ product-node-mesh  geom params = bbox; GLB if glbReady
```

**Rule:** In life mode, **never** set OLED / ESP / cell / solar size as `cage * factor`. Cage is **derived** from cell + boards + clearance (`deriveCageEdgeMm`).

## Locked sat-line SKUs

| Id | SKU | bbox (mm) | Notes |
|----|-----|-----------|--------|
| `esp32_c3` | ESP32-C3 SuperMini | 22.5 × 18 × 3.2 | Long edge ≤ 26; dual 2.54 mm headers |
| `oled_096` | 0.96" SSD1306 module | 27 × 27 × 4 | Module board, not active area alone |
| `tp4056` | TP4056 charge module | 25 × 19 × 3.5 | Common module class |
| `cell_16340` | 16340 / RCR123A | Ø16.5 × 34 | r = 8.25, length 34 |
| `sht30` | SHT3x breakout | 16 × 16 × 3 | Lock one breakout |
| `ttp223` | TTP223 module | 15 × 11 × 3 | |
| `solar_cell` | Craft epoxy panel | 60 × 45 × 3 | Not cage×1.35 wings |

Citations live on each `RealPartSpec.source` in `src/lib/product-3d/real-parts.ts`.

## Craft cage

- `LIFE_LAYOUT.cageClearanceMm` + cell length → typical edge **~48 mm**
- Brass rod ~**2.0 mm** radius craft stock
- Stand stem ~**90 mm**, foot Ø ~**36 mm**

Cage may look smaller than old “hero” 68 mm cube — that is correct for life size.

## Mesh path

1. **Parametric SKU** — always available; dimension-locked fallback if GLB missing/fails.
2. **GLB underlay (Phase 3)** — shipped life-mm meshes under `public/models/parts/`.

```bash
npm run generate:parts          # rebuild GLBs from RealPartSpec sizes
npm run generate:parts:ready    # rebuild + set mesh.glbReady true
```

Optional OpenSCAD craft: `assets/scad/*.scad` (cage/stand/cell life defaults).  
1 scene unit = 1 mm. Chili3D is offline authoring only (AGPL), not the app kernel.

## Tests

- `real-parts.test.ts` — footprints, cage derivation, no `cage *` electronics in `build-scene.ts`
- `product-3d.test.ts` — scene geom within **0.5 mm** of RealPartSpec; pins match
- `geom-math` `SAT_FIDELITY` — rejects hairline **and** illustration-scale blobs

## Changing a SKU

1. Edit `REAL_PARTS[id].bboxMm` + `pins` + `source`.
2. Pins flow to harness automatically via `sat-pins.ts`.
3. Re-export GLB if used; keep parametric fallback correct.
4. Run `npm run test:3d`.
