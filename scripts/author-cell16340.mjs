/**
 * Author the 16340 Li-ion cell as a GLB — recognizable cylindrical cell:
 * bare steel ends, blue shrink-wrap band, button (+) top, flat (−) bottom,
 * silk-printed wrap label. Built from scripts/lib/author-kit.mjs primitives
 * (MAT.*, textLabel, exportGlb) — no vendor CAD, no textures.
 *
 * FRAME (must match real-parts.ts cell_16340 so PinStub overlays land):
 *   cylinder axis along +Y   origin = cell center
 *   "+" pin at (0, +16.8, 0)   "−" pin at (0, −16.8, 0)
 *   radius 8.25mm (Ø16.5)   length 34mm   (real-parts: Ø16.5 × 34)
 *
 * Run:  node scripts/author-cell16340.mjs
 * Out:  public/models/parts/cell_16340.glb
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { MAT, textLabel, exportGlb } from "./lib/author-kit.mjs";

// ---- Dimensions (mm) -------------------------------------------------------
const R = 8.25; // cell body radius (Ø16.5)
const L = 34; // cell length, axis = Y
const HALF = L / 2; // 17
const WRAP_R = 8.35; // wrap band radius — slightly proud of the bare-metal body
const WRAP_LEN = 26; // wrap covers the middle 26mm; ~4mm bare metal stays at each end
const NUB_R = 3.2;
const NUB_H = 1.4;
const DISC_R = 6;
const DISC_H = 0.4;

// ---- Materials (solid colour only — headless export has no texture path) --
const mat = {
  body: MAT.cellNavy(),
  wrap: MAT.wrapBlue(),
  steel: MAT.steel(),
  insulator: MAT.silk(), // white-ish gasket ring
};

const root = new THREE.Group();
root.name = "Cell16340";
const add = (geo, m, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
};

// ---- 1. Body — bare steel can (CylinderGeometry axis defaults to Y) -------
add(new THREE.CylinderGeometry(R, R, L, 36), mat.body);

// ---- 2. Shrink-wrap band — middle 26mm; both ends stay bare metal ---------
add(new THREE.CylinderGeometry(WRAP_R, WRAP_R, WRAP_LEN, 36), mat.wrap);

// ---- 3. "+" terminal (top, +Y): insulator ring + proud steel button nub --
{
  const insulator = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.5, 10, 32), mat.insulator);
  insulator.rotation.x = Math.PI / 2; // lay the ring flat — hole axis along Y
  insulator.position.set(0, HALF, 0);
  root.add(insulator);

  add(new THREE.CylinderGeometry(NUB_R, NUB_R, NUB_H, 28), mat.steel, 0, HALF + NUB_H / 2, 0);
}

// ---- 4. "−" terminal (bottom): flat steel disc, proud of the end ---------
add(new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 32), mat.steel, 0, -HALF - DISC_H / 2, 0);

// ---- 5. Wrap label — flat silk plate tangent to the wrap, facing +Z ------
add(new THREE.BoxGeometry(8, 18, 0.2), mat.insulator, 0, 0, 8.4);
{
  // TextGeometry's reading direction is local +X by default; rotate 90° so
  // the long axis lies along Y (the cell axis), matching a real wrap label.
  const label = textLabel("16340 3.7V", { size: 1.7, depth: 0.12, x: 0, y: 0, z: 8.5, rotZ: Math.PI / 2 });
  label.updateMatrixWorld(true);
  const labelSize = new THREE.Box3().setFromObject(label).getSize(new THREE.Vector3());
  assert.ok(labelSize.y > labelSize.x, `label text should read along Y (x=${labelSize.x.toFixed(2)}, y=${labelSize.y.toFixed(2)})`);
  root.add(label);
}

// ---- 6. Embossed "+" on the button top ------------------------------------
{
  const plus = textLabel("+", { size: 2, depth: 0.15, x: 0, y: HALF + NUB_H, z: 0 });
  plus.rotation.x = -Math.PI / 2; // extrude toward +Y (the nub's top face) instead of +Z
  root.add(plus);
}

// ---- Export + fidelity assertions -----------------------------------------
const { bytes, size } = await exportGlb(root, "cell_16340.glb");
assert.ok(size.y >= 33 && size.y <= 37, `size.y ${size.y.toFixed(2)} outside 33–37`);
assert.ok(size.x >= 16 && size.x <= 18.5, `size.x ${size.x.toFixed(2)} outside 16–18.5`);
assert.ok(size.z >= 16 && size.z <= 18.5, `size.z ${size.z.toFixed(2)} outside 16–18.5`);
assert.ok(bytes < 300000, `bytes ${bytes} ≥ 300000`);
console.log("PASS  cell_16340 assertions (size + byte budget + label orientation)");
