/**
 * Author the TTP223 capacitive touch module as a GLB — a small blue PCB
 * dominated by a round gold touch-pad relief (with a darker silkscreen ring
 * around it), the TTP223 sensor IC tucked below, 2 passives, and 3 solder
 * pads. Built from the shared author-kit (chamferedBoard / textLabel /
 * icChip / passive / MAT / exportGlb) — see scripts/lib/author-kit.mjs.
 *
 * FRAME (must match real-parts.ts ttp223 so the PinStub overlay lands):
 *   X = 15mm long edge   Y = 11mm short edge   Z = thickness
 *   origin = module center   touch pad on the FRONT (+Z), upper area
 *   pads (real-parts.ts, z=0.8): SIG [0,-3.5] VCC [4,-3.5] GND [-4,-3.5]
 *
 * Layout note: at this footprint the Ø6.4mm touch pad and the 3×3mm sensor
 * IC can't both clear the fixed SIG/VCC/GND row without any contact — the
 * chip sits tangent to the pad's lower edge (zero overlap) directly above
 * the solder row, matching how tightly these modules are actually packed.
 *
 * Run:  node scripts/author-ttp223.mjs   (or: npm run models:ttp223)
 * Out:  public/models/parts/ttp223.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { chamferedBoard, textLabel, icChip, passive, MAT, exportGlb } from "./lib/author-kit.mjs";
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, weld } from "@gltf-transform/functions";
import { statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Dimensions (mm) -------------------------------------------------------
const BOARD_L = 15; // X
const BOARD_W = 11; // Y
const BOARD_T = 1.6;
const TOP = BOARD_T / 2; // +0.8 front face
const CORNER_R = 1.0;

const root = new THREE.Group();
root.name = "TTP223_Touch";

/** Raw-geometry helper, matching author-esp32c3.mjs's add() convention. */
const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

/** Place a kit group (icChip/passive both return a THREE.Group). */
const place = (group, x = 0, y = 0, z = 0) => {
  group.position.set(x, y, z);
  root.add(group);
  return group;
};

// ---- 1. PCB (blue, rounded, Z-centered) ------------------------------------
root.add(chamferedBoard(BOARD_L, BOARD_W, BOARD_T, CORNER_R, MAT.pcbBlue()));

// ---- 2. Touch pad relief — the hero feature, upper-center of the FRONT ----
const PAD_Y = 1.0;
const PAD_R = 3.2;
add(new THREE.CylinderGeometry(PAD_R, PAD_R, 0.25, 32), MAT.gold(), 0, PAD_Y, TOP + 0.125, Math.PI / 2);
{
  // Thin darker silkscreen ring standing off the gold pad — flat annulus,
  // already lies in the XY plane (faces +Z) by default, no rotation needed.
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.75 });
  add(new THREE.RingGeometry(PAD_R + 0.15, PAD_R + 0.6, 32), ringMat, 0, PAD_Y, TOP + 0.01);
}

// ---- 3. TTP223 sensor IC — tangent to the pad's lower edge -----------------
place(icChip({ w: 3, d: 3 }), 0, PAD_Y - PAD_R - 1.5, TOP + 0.5);

// ---- 4. Passives — flanking the pad where the board is otherwise empty ----
place(passive(), -5.8, PAD_Y, TOP + 0.225);
place(passive(), 5.8, PAD_Y, TOP + 0.225);

// ---- 5. Solder pads (gold cylinders) + tiny labels -------------------------
// Pad centers sit exactly at the real-parts.ts pin coords (z=0.8) so the
// wire-stub overlay lands flush on the visible pad, not floating beside it.
const PADS = [
  { name: "SIG", x: 0, y: -3.5, labelX: 2.3, labelY: -3.5 },
  { name: "VCC", x: 4, y: -3.5, labelX: 5.7, labelY: -3.5 },
  { name: "GND", x: -4, y: -3.5, labelX: -6.0, labelY: -3.5 },
];
for (const p of PADS) {
  add(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 20), MAT.gold(), p.x, p.y, 0.8, Math.PI / 2);
  root.add(textLabel(p.name, { size: 0.6, depth: 0.06, x: p.labelX, y: p.labelY, z: TOP + 0.05 }));
}

// ---- 6. Silkscreen — bottom-left, clear of the IC + solder row ------------
root.add(textLabel("TTP223", { size: 1.2, depth: 0.1, x: -4.8, y: -4.8, z: TOP + 0.06 }));

// ---- Export, then optimize IN PLACE (weld+quantize+dedup+prune) -----------
// Extruded silkscreen text is vertex-heavy; the raw export lands well over
// the byte cap. Same pipeline as `npm run models:optimize`, scoped to just
// this file so no sibling part GLB is touched.
const { size } = await exportGlb(root, "ttp223.glb");
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/parts/ttp223.glb");
{
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.read(OUT);
  await doc.transform(weld(), quantize(), dedup(), prune());
  await io.write(OUT, doc);
}
const bytes = statSync(OUT).size;

if (size.x < 14 || size.x > 17) throw new Error(`ttp223: size.x ${size.x.toFixed(2)} out of [14,17]`);
if (size.y < 10 || size.y > 13) throw new Error(`ttp223: size.y ${size.y.toFixed(2)} out of [10,13]`);
if (bytes >= 300000) throw new Error(`ttp223: ${bytes} bytes >= 300000 cap`);
console.log(`PASS ttp223 asserts (size.x/y in range, ${bytes} bytes under cap)`);
