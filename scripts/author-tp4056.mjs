/**
 * Author the TP4056 micro-USB Li-ion charger module as a GLB — the classic
 * red PCB with micro-USB input, dual status LEDs, SOP-8 charge IC + DW01
 * protection IC, and six solder pads. Built from the shared author-kit
 * (chamferedBoard / textLabel / microUsb / icChip / passive / led / MAT /
 * exportGlb) — see scripts/lib/author-kit.mjs.
 *
 * FRAME (must match real-parts.ts tp4056 so the PinStub overlay lands):
 *   X = 25mm long edge   Y = 19mm short edge   Z = thickness
 *   origin = module center   micro-USB centered on the −Y long edge, mouth
 *   overhanging slightly past the board edge (component side +Z)
 *   pads (real-parts.ts, z=1.2): B+ [10,7] B- [-10,7] OUT+ [10,-7]
 *     OUT- [-10,-7] IN+ [0,7.5] IN- [0,-7.5] (IN+/IN- rounded to ±8 here,
 *     matching the authoring brief)
 *   status LEDs (part-detail.ts): red [6,5,1.9] green [9,5,1.9]
 *
 * Run:  node scripts/author-tp4056.mjs   (or: npm run models:tp4056)
 * Out:  public/models/parts/tp4056.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { chamferedBoard, textLabel, microUsb, icChip, passive, led, MAT, exportGlb } from "./lib/author-kit.mjs";
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, weld } from "@gltf-transform/functions";
import { statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Dimensions (mm) -------------------------------------------------------
const BOARD_L = 25; // X
const BOARD_W = 19; // Y
const BOARD_T = 1.6;
const TOP = BOARD_T / 2; // +0.8 front face
const CORNER_R = 1.3;

const root = new THREE.Group();
root.name = "TP4056_Charger";

/** Raw-geometry helper, matching author-esp32c3.mjs's add() convention. */
const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

/** Place a kit group (microUsb/icChip/led/passive all return a THREE.Group). */
const place = (group, x = 0, y = 0, z = 0) => {
  group.position.set(x, y, z);
  root.add(group);
  return group;
};

// ---- 1. PCB (classic red, rounded, Z-centered) -----------------------------
root.add(chamferedBoard(BOARD_L, BOARD_W, BOARD_T, CORNER_R, MAT.pcbRed()));

// ---- 2. Micro-USB input, centered on the −Y long edge, mouth overhanging --
// Depth 5.5mm on a 19mm-deep board: mouth overhangs the edge by ~1.05mm, the
// rest of the shell rides on the board surface (same convention as the
// ESP32-C3 USB-C placement — most of the shell on-board, a slight overhang).
place(microUsb(), 0, -7.8, TOP + 2.6 / 2 - 0.1);

// ---- 3. TP4056 SOP-8 charge IC (center) + DW01 protection IC (beside it) --
place(icChip({ w: 4.9, d: 3.9, h: 1 }), 0, 0, TOP + 0.5);
place(icChip({ w: 2, d: 2 }), -4.2, -2.2, TOP + 0.5);

// ---- 4. Passives (charge-current-set resistor + 2 caps) -------------------
for (const [x, y] of [
  [3.5, -2.0],
  [3.5, 2.0],
  [-1.5, -3.3],
]) {
  place(passive(), x, y, TOP + 0.225);
}

// ---- 5. Status LEDs — per part-detail.ts (red charging / green done) ------
place(led(0xef4444), 6, 5, 1.9);
place(led(0x22c55e), 9, 5, 1.9);

// ---- 6. Solder pads (gold cylinders) + tiny labels -------------------------
// Pad centers sit exactly at the real-parts.ts pin coords (z=1.2) so the
// wire-stub overlay lands flush on the visible pad, not floating beside it.
const PADS = [
  { name: "B+", x: 10, y: 7, labelX: 11.5, labelY: 8.0 },
  { name: "B-", x: -10, y: 7, labelX: -11.5, labelY: 8.0 },
  { name: "OUT+", x: 10, y: -7, labelX: 11.5, labelY: -8.0 },
  { name: "OUT-", x: -10, y: -7, labelX: -11.5, labelY: -8.0 },
  { name: "IN+", x: 0, y: 8, labelX: 0, labelY: 9.0 },
  { name: "IN-", x: 0, y: -8, labelX: 4.3, labelY: -7.8 },
];
for (const p of PADS) {
  add(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 20), MAT.gold(), p.x, p.y, 1.2, Math.PI / 2);
  root.add(textLabel(p.name, { size: 0.8, depth: 0.08, x: p.labelX, y: p.labelY, z: TOP + 0.06 }));
}

// ---- 7. Silkscreen ----------------------------------------------------------
root.add(textLabel("TP4056", { size: 1.7, depth: 0.14, x: 0, y: 3.6, z: TOP + 0.07 }));

// ---- Export, then optimize IN PLACE (weld+quantize+dedup+prune) -----------
// Extruded silkscreen text is vertex-heavy; the raw export lands well over
// the byte cap. Same pipeline as `npm run models:optimize`, scoped to just
// this file so no sibling part GLB is touched.
const { size } = await exportGlb(root, "tp4056.glb");
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/parts/tp4056.glb");
{
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.read(OUT);
  await doc.transform(weld(), quantize(), dedup(), prune());
  await io.write(OUT, doc);
}
const bytes = statSync(OUT).size;

if (size.x < 24 || size.x > 27) throw new Error(`tp4056: size.x ${size.x.toFixed(2)} out of [24,27]`);
if (size.y < 18 || size.y > 22) throw new Error(`tp4056: size.y ${size.y.toFixed(2)} out of [18,22]`);
if (size.z > 4.5) throw new Error(`tp4056: size.z ${size.z.toFixed(2)} exceeds 4.5 cap`);
if (bytes >= 300000) throw new Error(`tp4056: ${bytes} bytes >= 300000 cap`);
console.log(`PASS tp4056 asserts (size.x/y/z in range, ${bytes} bytes under cap)`);
