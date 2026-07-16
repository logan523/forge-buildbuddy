/**
 * Author the SHT30 temp/humidity breakout as a GLB — a small blue PCB with a
 * DFN sensor block (vent hole), 3 gold solder pads, and silkscreen. Built
 * from the shared author-kit (chamferedBoard / textLabel / MAT / exportGlb)
 * — see scripts/lib/author-kit.mjs.
 *
 * FRAME (must match real-parts.ts sht30 so the PinStub overlay lands):
 *   X = 16mm   Y = 16mm   Z = thickness   origin = module center
 *   pads on the FRONT (+Z): VCC [0, 5, 1.5]   GND [0, -5, 1.5]   SDA [5, 0, 1.5]
 *   (real-parts.ts only lists these three pads — no SCL entry; geometry
 *   follows the authority table exactly, it is not this script's job to add one)
 *
 * Run:  node scripts/author-sht30.mjs
 * Out:  public/models/parts/sht30.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { chamferedBoard, textLabel, MAT, exportGlb } from "./lib/author-kit.mjs";

// ---- Dimensions (mm) -------------------------------------------------------
const BOARD = 16; // X and Y
const BOARD_T = 1.6;
const TOP = BOARD_T / 2; // +0.8 front face
const CORNER_R = 1.0;

const root = new THREE.Group();
root.name = "SHT30_Breakout";

/** Raw-geometry helper, matching author-esp32c3.mjs's add() convention. */
const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

// ---- 1. PCB (blue, rounded, Z-centered) ------------------------------------
root.add(chamferedBoard(BOARD, BOARD, BOARD_T, CORNER_R, MAT.pcbBlue()));

// ---- 2. SHT30 sensor block (DFN) + ventilation hole ------------------------
{
  const SENSOR_T = 0.9;
  const sensorTopZ = TOP + SENSOR_T; // block sits directly on the board surface
  add(new THREE.BoxGeometry(2.5, 2.5, SENSOR_T), MAT.chip(), 0, 0, TOP + SENSOR_T / 2);
  // Vent hole: dark disc inset 0.2mm into the block's top face (visual
  // stand-in for a blind hole — no CSG available headless).
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
  add(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 20), ventMat, 0, 0, sensorTopZ - 0.1, Math.PI / 2);
}

// ---- 3. Pads — per real-parts.ts, gold nub + tiny label at each -----------
// Nub centered exactly at the authority z (1.5), bottom flush to the board
// surface (0.8) so the pin reads as continuous, not floating.
// Label offsets all step 1.9mm from their pin toward open board space, so
// none run into the sensor block, the SHT30 title, or each other. GND sits
// beside the −Y board edge with the title text below it, so its label is
// offset inward (+Y, toward center) rather than sideways like VCC/SDA —
// sideways crowded the label into the "SHT30" title's last character.
const PADS = [
  { name: "VCC", x: 0, y: 5, labelX: 1.9, labelY: 5 },
  { name: "GND", x: 0, y: -5, labelX: 0, labelY: -3.1 },
  { name: "SDA", x: 5, y: 0, labelX: 5, labelY: 1.9 },
];
for (const p of PADS) {
  const half = 1.5 - TOP; // 0.7 — half-height so the nub bottom sits at TOP
  add(new THREE.BoxGeometry(0.62, 0.62, half * 2), MAT.gold(), p.x, p.y, 1.5);
  root.add(textLabel(p.name, { size: 0.8, depth: 0.08, x: p.labelX, y: p.labelY, z: TOP + 0.06 }));
}

// ---- 4. Silkscreen + mounting hole -----------------------------------------
root.add(textLabel("SHT30", { size: 1.6, depth: 0.14, x: 0, y: -6.6, z: TOP + 0.07 }));
{
  // One 3mm (Ø) mounting hole with a gold ring, tucked in a free corner.
  const HOLE_X = 5.5, HOLE_Y = 5.5, HOLE_R = 1.5;
  add(new THREE.CylinderGeometry(HOLE_R, HOLE_R, BOARD_T + 0.2, 20), MAT.chip(), HOLE_X, HOLE_Y, 0, Math.PI / 2);
  add(new THREE.RingGeometry(HOLE_R, HOLE_R + 0.5, 24), MAT.gold(), HOLE_X, HOLE_Y, TOP + 0.02);
}

// ---- Export + asserts -------------------------------------------------------
const { bytes, size } = await exportGlb(root, "sht30.glb");
if (size.x < 16 || size.x > 18) throw new Error(`sht30: size.x ${size.x.toFixed(2)} out of [16,18]`);
if (size.y < 16 || size.y > 18) throw new Error(`sht30: size.y ${size.y.toFixed(2)} out of [16,18]`);
if (bytes >= 300000) throw new Error(`sht30: ${bytes} bytes >= 300000 cap`);
console.log("PASS sht30 asserts (size.x/y in range, bytes under cap)");
