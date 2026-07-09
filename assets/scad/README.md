# OpenSCAD / FreeCAD / Chili3D → BuildBuddy GLB pipeline

These tools **do not replace** the in-app R3F assembly modeler (harness, phases, isolate).  
They **generate higher-fidelity solid meshes** for optional underlays.

**Primary path today:** `npm run generate:parts` (Node GLB factory, life-mm, no OpenSCAD).  
OpenSCAD scripts here remain for offline craft refinement.

## Dimension authority

All sizes come from `src/lib/product-3d/real-parts.ts` (datasheet mm).  
Do **not** regenerate with old illustration constants (`size=68`, `radius=10.5`).

| Part | Life mm |
|------|---------|
| Cage edge | ~48 (derived) |
| Rod radius | 2.0 |
| 16340 | Ø16.5 × 34 |
| SuperMini PCB | 22.5 × 18 × 3.2 |
| OLED module | 27 × 27 × 4 |

## Tool roles

| Tool | Role | License note |
|------|------|----------------|
| **Node `generate-part-glbs.mjs`** | Default factory → `public/models/parts/*.glb` | In-repo |
| [OpenSCAD](https://openscad.org/) | Script parametric solids (cage, stand, cells) | GPL tool |
| [FreeCAD](https://www.freecad.org/) | B-rep fillets → STEP/STL/GLB | LGPL tool |
| [Chili3D](https://github.com/xiangechen/chili3d) | Browser CAD | **AGPL — do not embed** |

## OpenSCAD flow (optional)

```bash
openscad -o /tmp/cage.stl -D 'size=48' -D 'rod_r=2.0' -D 'fn=48' assets/scad/sat_cage.scad
openscad -o /tmp/cell.stl -D 'radius=8.25' -D 'height=34' assets/scad/sat_cell.scad
# Convert STL → GLB (Blender / gltf-transform), drop into public/models/parts/
```

Then set `mesh.glbReady: true` for that part (or re-run `npm run generate:parts:ready`).

## Files

| Script | Intent |
|--------|--------|
| `sat_cage.scad` | Brass wire cube (~48 mm) |
| `sat_stand.scad` | Stem 90 + foot Ø36 |
| `sat_cell.scad` | True 16340 |
| `sat_pcb.scad` | SuperMini FR4 blank |
| `sat_oled.scad` | 0.96" module |

Pins/wires always from `sat-pins.ts` + harness — GLB is visual only.
