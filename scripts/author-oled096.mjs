/**
 * Author the 0.96" SSD1306 I2C OLED module as a GLB — the module BODY only
 * (blue PCB, black glass, 4-pin header). The live clock screen is overlaid at
 * render time (product-node-mesh OLED screen plane), so the beloved animated
 * SSD1306 is preserved on top of this recognizable body.
 *
 * FRAME (must match real-parts.ts oled_096 so PinStub overlays + the live screen land):
 *   X = 27mm   Y = 27mm   Z = thickness   origin = module center
 *   4-pin header on the −Y edge, BACK side (z ≈ −1.5): VCC/GND/SCL/SDA at 2.54 pitch
 *   glass display on the FRONT (+Z), upper-centre (+Y)
 *   ACTIVE screen area (overlaid live): center [0, 3, 1.9], size 21.7 × 11 mm
 *
 * Run:  node scripts/author-oled096.mjs   (or: npm run models:oled096)
 * Out:  public/models/parts/oled_096.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/models/parts/oled_096.glb");

// ---- Dimensions (mm) ----------------------------------------------------
const BOARD = 27; // X and Y (square-ish module)
const PCB_T = 1.2;
const PCB_TOP = PCB_T / 2;
const CORNER_R = 1.6;
const HDR_Y = -BOARD / 2 + 1.2; // −12.3, matches real-parts pins
const PIN_X = [-1.5, -0.5, 0.5, 1.5].map((n) => n * 2.54); // VCC GND SCL SDA

// ---- Materials (solid colours only — headless export has no texture path) --
const mat = {
  pcb: new THREE.MeshStandardMaterial({ color: 0x16305e, metalness: 0.1, roughness: 0.5 }), // classic OLED-module blue
  glass: new THREE.MeshStandardMaterial({ color: 0x0a0b0f, metalness: 0.2, roughness: 0.12 }),
  glassEdge: new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.1, roughness: 0.5 }),
  hdrPlastic: new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.0, roughness: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8b45c, metalness: 0.82, roughness: 0.3 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x0a1428, metalness: 0.3, roughness: 0.6 }),
  pad: new THREE.MeshStandardMaterial({ color: 0xc7cfd8, metalness: 0.7, roughness: 0.35 }),
};

const root = new THREE.Group();
root.name = "SSD1306_OLED_096";
const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

function roundedRect(l, w, r) {
  const hx = l / 2;
  const hy = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hy);
  s.lineTo(hx - r, -hy);
  s.quadraticCurveTo(hx, -hy, hx, -hy + r);
  s.lineTo(hx, hy - r);
  s.quadraticCurveTo(hx, hy, hx - r, hy);
  s.lineTo(-hx + r, hy);
  s.quadraticCurveTo(-hx, hy, -hx, hy - r);
  s.lineTo(-hx, -hy + r);
  s.quadraticCurveTo(-hx, -hy, -hx + r, -hy);
  return s;
}

// ---- 1. PCB (blue, rounded, centered on Z) ------------------------------
{
  const geo = new THREE.ExtrudeGeometry(roundedRect(BOARD, BOARD, CORNER_R), {
    depth: PCB_T,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -PCB_T / 2);
  add(geo, mat.pcb);
}

// ---- 2. Corner mounting holes (dark rings) ------------------------------
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    add(new THREE.CylinderGeometry(1.1, 1.1, PCB_T + 0.1, 16), mat.hole, sx * (BOARD / 2 - 2), sy * (BOARD / 2 - 2), 0, Math.PI / 2);
  }
}

// ---- 3. Black glass display module (front, upper-centre) -----------------
// Glass panel body; the live pixels are overlaid by the renderer at z≈1.9.
add(new THREE.BoxGeometry(25, 15, 1.6), mat.glass, 0, 3, PCB_TOP + 0.6);
// thin black surround lip so the glass reads as a mounted panel
add(new THREE.BoxGeometry(25.6, 15.6, 0.5), mat.glassEdge, 0, 3, PCB_TOP + 0.2);
// FPC ribbon strip along the bottom of the glass (classic SSD1306 look)
add(new THREE.BoxGeometry(18, 2.2, 0.4), mat.glassEdge, 0, 3 - 15 / 2 - 0.6, PCB_TOP + 0.3);

// ---- 4. 4-pin header on the −Y edge, BACK side --------------------------
{
  const stripLen = (PIN_X[PIN_X.length - 1] - PIN_X[0]) + 2.6;
  add(new THREE.BoxGeometry(stripLen, 2.5, 2.4), mat.hdrPlastic, 0, HDR_Y, -PCB_TOP - 1.0);
  for (const px of PIN_X) {
    // gold pin reaching back to z≈−1.6 so the labelled PinStub overlay (z=−1.5) lands
    add(new THREE.BoxGeometry(0.66, 0.66, 2.2), mat.gold, px, HDR_Y, -PCB_TOP - 1.0);
    add(new THREE.CylinderGeometry(1.0, 1.05, 0.15, 12), mat.pad, px, HDR_Y, PCB_TOP + 0.02, Math.PI / 2); // front annular pad
  }
}

// ---- Export --------------------------------------------------------------
mkdirSync(dirname(OUT), { recursive: true });
new GLTFExporter().parse(
  root,
  (glb) => {
    const buf = Buffer.from(glb);
    writeFileSync(OUT, buf);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    console.log(`OK  ${OUT}`);
    console.log(`    ${buf.length} bytes`);
    console.log(`    size mm: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    console.log(`    center mm: ${ctr.x.toFixed(2)}, ${ctr.y.toFixed(2)}, ${ctr.z.toFixed(2)}`);
  },
  (err) => {
    console.error("EXPORT FAILED:", err);
    process.exit(1);
  },
  { binary: true, onlyVisible: true }
);
