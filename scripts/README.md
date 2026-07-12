# Part-model authoring pipeline (three.js → GLB, headless)

Forge renders recognizable real parts from GLB models. When a clean licensed
model can't be sourced, we **author** one at real mm in three.js and export it
headlessly — no external CAD, no login-gated download, no runtime dependency.

## Author a model

`scripts/author-esp32c3.mjs` is the worked example (ESP32-C3 SuperMini):

```bash
npm run models:esp32c3     # → public/models/parts/esp32_c3.glb
```

It builds the board from three.js primitives at **real mm** in Forge's
part-local frame (X = long edge, Y = short edge, Z = thickness, +Z component
side, origin = part center — see `public/models/parts/README.md`), then exports
a binary GLB. Copy it to author a new part: change the dimensions/features,
point `OUT` at `<catalog-id>.glb`, register the id in `PART_MODELS`.

## Headless GLB export

`three/examples/jsm/exporters/GLTFExporter` targets the browser: with
`{ binary: true }` it converts its internal Blob to an ArrayBuffer via
`FileReader`, which Node lacks as a global. `scripts/lib/gltf-node-polyfill.mjs`
supplies a ~10-line `FileReader` (Node 18+ already has `Blob`). Import it first:

```js
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
```

Use **solid-colour `MeshStandardMaterial`** (no texture maps) — texture export
would pull in `canvas`/`Image`, which headless Node also lacks. Shape + colour
carry recognizability; silkscreen text is a later nicety.

## Inspect a model

`/dev/glb?part=<id>` renders any GLB in `public/models/parts/` cleanly (drag to
orbit, 1 mm grid) — vet geometry/orientation/scale before flipping `glbReady`.
Dev-only route, not linked from the app.

## Alternative: source + convert

Sourced STEP/CAD (KiCad packages3D, CC0 exports, vendor STEP) can be converted
to GLB offline (e.g. `occt-import-js` + `@gltf-transform`) and dropped in the
same way. Whatever the origin, register it in `PART_MODELS` with the right
`unit` / `rotationDeg` / `centerToBbox` and record the source + license.
