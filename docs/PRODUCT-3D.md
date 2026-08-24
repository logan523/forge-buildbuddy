# Product 3D (parametric assembly)

> **PARTLY STALE (2026-08-24).** Documents a postfx pipeline (N8AO / Bloom / Vignette) that
> commit 332e1be deleted, and an AI beauty-mesh path that CLAUDE.md anti-pattern #4 argues
> against. Two 3D authorities are documented across this repo; the canonical one is
> `src/components/stage/` + `src/lib/stage/`. After the rebuild the 3D system renders ONE
> hero on the homepage — do not treat it as central.


## Goal

Orbitable **3D product model** built from the BOM — not a flat SVG stand-in, not an AI mesh black box.

**Assembly Story** (illustrative build graphic — phases + harnesses):

- **Phases** → `AssemblyRecipe` / `resolveAssemblyFrame` — scrub 0…N *builds* the product  
- **Joints** → mate axes for phase settle + explode (not only UI layers)  
- **Harnesses** → pin-to-pin `WireRoute3D` (`harness.ts`) from electrical nets + anchors  
- **Stage** → `ProductAssemblyApp` — Play build · phase chips · scrub · parts · inspect nets  
- **Meshes** → parametric composites (wire cage, OLED, solar, cell…) with PBR  
- **Authority** remains parametric scene graph — beauty underlay optional only  

## Stack

- `three` + `@react-three/fiber` + `@react-three/drei`  
- Authority: `src/lib/product-3d/` (`assembly-recipe`, `sat-clock-recipe`, `harness`, scene builders)  
- Viewer: `src/components/product-viewer-3d.tsx` + `product-assembly-app.tsx`  
- Materials: `materials.ts` · Quality: `quality.ts`  

## Harness connectivity (wiring)

`buildHarnesses` maps electrical nets → multi-point routes:

- Part anchors (VIN, GND, SDA…) on recipe parts  
- Path droop between pin endpoints (not star-only lines)  
- Phase filter: only nets whose both ends are present  
- Selecting a part lists incident nets in the inspector  
- Legacy `attachConnectionSpars` remains as fallback edge list  

## Sun control

- Azimuth / elevation sliders drive key light + sun disc  
- **Aim solar** re-tilts panels via `solarRotationTowardSun`  
- Default: front-right ~55° elevation  

## Electronics catalog

| Id | Role |
|----|------|
| `esp32_c3` | MCU |
| `oled_096` | Display |
| `tp4056` | Charger |
| `cell_16340` | Battery |
| `sht30` / `ttp223` / `solar_cell` | … |

Optional GLB: `public/models/parts/*.glb` — see README there. Parametric catalog mesh is always the fallback.

## Spatial reasoning brain

After template build, `applySpatialReasoning` applies design-intent rules:

| Rule | Behavior |
|------|----------|
| Solar faces sky | Elevate above display; pitch ~55° so active face collects light |
| Display faces user | OLED toward +Z |
| Power sits low | Battery/charger near base |
| Controller mid | MCU mid-height for service |
| Controls on top | Touch at highest surface |
| Sensor exposed | Proud of chassis for airflow |

Notes surface as **Brain** chips in the 3D viewer (click peels related layer).

## Visual quality (Palantir-grade parametric)

| Layer | Technique |
|-------|-----------|
| Materials | `MeshPhysicalMaterial` presets: bamboo, brass, copper, oled glass, PCB, solar |
| Lighting | Local studio HDRI (`public/hdri/`, CC0) + key/fill/rim + Lightformer; Lightformer-rig fallback if the HDRI can't load |
| Post | `@react-three/postprocessing`: N8AO (high tier) · Bloom (emissive OLED/sun) · Vignette · ACES ToneMapping last — composer off entirely on low tier |
| Screens | Live SSD1306 clock face as CanvasTexture `emissiveMap` (`procedural-maps.ts oled_screen`); PCB silkscreen labels (`silkscreen`) |
| Geometry | Composite kinds: `bamboo_base`, `oled_module`, `solar_module`, `pcb_module`, `brass_frame` |
| Shadows | Soft ContactShadows + matte floor (PCSS SoftShadows / MeshReflectorMaterial stay banned — GPU blackout history, enforced by test) |
| Selection | cyan Outlines + label chip |
| Motion | Idle auto-orbit + intro dolly (respect `prefers-reduced-motion`) |
| Performance | Adaptive dpr/segments/effects; demote tier on FPS decline strips the composer |

Open-source path — no proprietary CAD. Optional AI beauty remains underlay only.  

## Templates (FormSpec → builder)

| `templateId` | Builder |
|--------------|---------|
| `sat_clock` | **Wire cube cage** on metal stand, battery in cage, dual solar wings (photo-matched) |
| `weather_stick` | Mast + sensor head |
| `robot_chassis` | Body + wheels + front sensor |
| `sensor_pod` | Rounded shell pod |
| `boxed_gadget` | Enclosure + internals |
| `breadboard` | Proto board scatter |

Route: `buildProductScene3D(plan)` via `resolveFormSpec`.

## Layer isolation

| Control | Behavior |
|---------|----------|
| Checkbox | Hide layer completely |
| Solo | Ghost all other layers |
| Explode | Offset along `explodeDir` (mm) |
| Click mesh | Select + label (ref · name) |
| Pose | Edit mode → gizmo translate/rotate |

## Pose layout

- Type: `PoseLayout3D` = `{ [nodeId]: { position?, rotation? } }` (mm / radians)
- Apply: `applyPoseLayout(scene, poses)`
- Persist: `bb:product3d:poses:{planId}` via `pose-storage.ts`
- Optional: FormSpec 2D `layout` deltas map to layer offsets

## Pose enrichment (Phase C)

| Source | Mechanism |
|--------|-----------|
| FormSpec `params.heightScale` / `wingSpan` | Deterministic stretch of Y / wing X |
| `plan.scenePoses` | LLM or share; keys = layer or node id |
| Hint shape | `{ position? }` absolute, `{ delta? }` additive mm, `{ rotation? }` rad |
| Sanitize | `sanitizePoseHints` clamps ±400 mm, drops junk |
| Pipeline | SYNTH_SYSTEM documents `scenePoses`; `posesFromLlm` soft-parses |

User gizmo edits still win via localStorage after enrichment is baked into the base scene.

## Integration

| Surface | Content |
|---------|---------|
| Prep hero | Full 3D + layer panel + pose edit (2D SVG toggle fallback) |
| Build step left | 3D focused on step layer + 2D hands-on StepMedia |

## AI beauty mesh (Phase D — optional underlay)

Meshy/Tripo-style GLB is **display only**. Never authority for layers, ERC, steps, or BOM.

| Rule | Behavior |
|------|----------|
| Source | `plan.beautyMesh.url` (HTTPS `.glb`/`.gltf`) |
| Sanitize | `sanitizeBeautyMesh` / `isAllowedBeautyUrl` |
| Viewer | **Beauty** toggle → translucent underlay behind parametric nodes |
| Auto-hide | Solo layer, explode &gt; 5%, pose edit mode |
| Clicks | Beauty meshes have empty `raycast` — layers keep pick authority |
| Generation | `POST /api/beauty-mesh` + env `MESHY_API_KEY` / `TRIPO_API_KEY` — **opt-in** |
| Poll | `GET /api/beauty-mesh?taskId=&provider=` |
| Viewer | **Gen beauty** when configured; **Beauty** toggle for underlay |
| Prompt | `buildBeautyPrompt(plan)` from FormSpec caption + materials |

Meshy: preview text-to-3D (`mode: preview`, GLB only) — good enough for underlay; refine optional later.

```ts
plan.beautyMesh = {
  url: "https://cdn.example.com/product.glb",
  provider: "manual",
  opacity: 0.38,
  status: "ready",
};
```

## Fallback

No WebGL → message; prep can show 2D FormSpec SVG.
Beauty load fail → parametric scene unchanged.
