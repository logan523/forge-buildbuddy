# Product 3D (parametric assembly)

## Goal

Orbitable **3D product model** built from the BOM — not a flat SVG stand-in, not an AI mesh black box.

- **Think through** → `ProductScene3D` scene graph (layers, poses, materials)  
- **Create** → parametric primitives (disk, board, OLED panel, solar, cell…)  
- **Look through layers** → show / hide / solo / explode  
- **Pose** → TransformControls drag; persist per plan in `localStorage`

## Stack

- `three` + `@react-three/fiber` + `@react-three/drei`  
- Authority: `src/lib/product-3d/`  
- Viewer: `src/components/product-viewer-3d.tsx`  
- Materials: `materials.ts` (MeshPhysical PBR presets)  
- Quality: `quality.ts` (high/medium/low + PerformanceMonitor)  

## Visual quality (Palantir-grade parametric)

| Layer | Technique |
|-------|-----------|
| Materials | `MeshPhysicalMaterial` presets: bamboo, brass, copper, oled glass, PCB, solar |
| Lighting | Studio HDRI + key/fill/rim + Lightformer |
| Geometry | Composite kinds: `bamboo_base`, `oled_module`, `solar_module`, `pcb_module`, `brass_frame` |
| Shadows | Soft ContactShadows + optional ground disk |
| Selection | cyan Outlines + label chip |
| Performance | Adaptive dpr/segments; demote tier on FPS decline |

Open-source path — no proprietary CAD. Optional AI beauty remains underlay only.  

## Templates (FormSpec → builder)

| `templateId` | Builder |
|--------------|---------|
| `sat_clock` | Bamboo base, brass frame, OLED, solar wings |
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
