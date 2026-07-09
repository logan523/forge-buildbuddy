# Catalog part GLBs (life-size underlays)

**1 unit = 1 mm.** Matches `RealPartSpec` in `src/lib/product-3d/real-parts.ts`.

## Generate (no OpenSCAD required)

```bash
npm run generate:parts          # write .glb files only
npm run generate:parts:ready    # write + set mesh.glbReady true (opt-in only)
```

**Default:** `glbReady` is **false**. The viewer uses life-mm **parametric** meshes
(better detail). Auto-GLBs are low-poly placeholders — enable only after visual QA.

Script: `scripts/generate-part-glbs.mjs` (pure Node glTF binary writer).

## Files

| File | Part | bbox (mm) |
|------|------|-----------|
| `esp32_c3.glb` | SuperMini | 22.5 × 18 × 3.2 |
| `oled_096.glb` | 0.96" OLED | 27 × 27 × 4 |
| `tp4056.glb` | TP4056 | 25 × 19 × 3.5 |
| `cell_16340.glb` | 16340 | Ø16.5 × 34 |
| `sht30.glb` | SHT3x | 16 × 16 × 3 |
| `ttp223.glb` | TTP223 | 15 × 11 × 3 |
| `solar_cell.glb` | Solar craft | 60 × 45 × 3 |

Optional craft (OpenSCAD): `assets/scad/sat_cage.scad`, `sat_stand.scad`.

## Viewer wiring

When `RealPartSpec.mesh.glbReady` is true, catalog attaches `assetUrl` and
`CatalogGlbUnderlay` loads the GLB. Pin stubs + harness stay on `sat-pins.ts`.

Regenerate after changing `REAL_PARTS` bbox values.
