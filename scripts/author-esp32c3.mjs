/**
 * Author the ESP32-C3 SuperMini board as a GLB — no vendor CAD, no external
 * dependency. Built with three.js primitives at REAL mm and exported headless
 * via GLTFExporter, so it flows through the SAME loader (CatalogGlbUnderlay) as
 * any sourced GLB would.
 *
 * COORDINATE FRAME (must match real-parts.ts esp32_c3, so overlaid PinStubs land):
 *   X = 22.5mm long edge   Y = 18mm short edge   Z = thickness (component side +Z)
 *   origin = board center   USB-C at -Y   PCB antenna at +Y
 *   header pins inset at x = ±10.25, stepping in Y at 2.54mm pitch (includes 0, ±5.08)
 *
 * Run:  node scripts/author-esp32c3.mjs
 * Out:  public/models/parts/esp32_c3.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/models/parts/esp32_c3.glb");

// ---- Dimensions (mm) ----------------------------------------------------
const BOARD_L = 22.5; // X
const BOARD_W = 18.0; // Y
const PCB_T = 1.2; // bare PCB thickness (Z)
const PCB_TOP = PCB_T / 2; // +0.6
const CORNER_R = 1.4;
const HDR_X = 10.25; // header inset from center (matches real-parts pins)
const PITCH = 2.54;
const PIN_Y = [-3, -2, -1, 0, 1, 2, 3].map((n) => n * PITCH); // 7 per side, incl 0/±5.08

// ---- Materials ----------------------------------------------------------
const mat = {
  pcb: new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.0, roughness: 0.52 }),
  pcbEdge: new THREE.MeshStandardMaterial({ color: 0x0d0e12, metalness: 0.0, roughness: 0.6 }),
  usbShell: new THREE.MeshStandardMaterial({ color: 0xcbd0d7, metalness: 0.9, roughness: 0.26 }),
  usbInner: new THREE.MeshStandardMaterial({ color: 0x090a0c, metalness: 0.3, roughness: 0.7 }),
  chip: new THREE.MeshStandardMaterial({ color: 0x0b0c0f, metalness: 0.1, roughness: 0.38 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb9793f, metalness: 0.55, roughness: 0.36 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8b45c, metalness: 0.82, roughness: 0.3 }),
  hdrPlastic: new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.0, roughness: 0.55 }),
  led: new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 0.0, roughness: 0.25 }),
  btn: new THREE.MeshStandardMaterial({ color: 0xaeb4bd, metalness: 0.85, roughness: 0.32 }),
  silk: new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.0, roughness: 0.6 }),
};

const root = new THREE.Group();
root.name = "ESP32C3_SuperMini";
const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

// ---- 1. PCB (rounded-rect extrusion, centered on Z) ---------------------
function roundedRectShape(l, w, r) {
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
{
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(BOARD_L, BOARD_W, CORNER_R), {
    depth: PCB_T,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -PCB_T / 2); // center thickness on Z=0
  add(geo, mat.pcb);
}

// ---- 2. USB-C receptacle at -Y edge -------------------------------------
{
  const shellL = 9.0; // X
  const shellDepth = 7.2; // Y (into board + slightly past edge)
  const shellH = 3.1; // Z
  const yCenter = -BOARD_W / 2 + shellDepth / 2 - 1.6; // sits over the edge, mouth overhangs
  const z = PCB_TOP + shellH / 2 - 0.1;
  add(new THREE.BoxGeometry(shellL, shellDepth, shellH), mat.usbShell, 0, yCenter, z);
  // dark receptacle slot on the outward (-Y) face
  add(
    new THREE.BoxGeometry(shellL - 2.4, 1.4, shellH - 1.4),
    mat.usbInner,
    0,
    yCenter - shellDepth / 2 + 0.6,
    z
  );
}

// ---- 3. ESP32-C3 QFN chip (black square, component side) -----------------
add(new THREE.BoxGeometry(5, 5, 1.05), mat.chip, 0.5, 1.5, PCB_TOP + 0.5);

// ---- 4. PCB antenna at +Y end (copper meander zone) ----------------------
{
  const ay = BOARD_W / 2 - 3.0;
  // base keepout patch
  add(new THREE.BoxGeometry(11, 4.6, 0.08), mat.copper, 0, ay, PCB_TOP + 0.04);
  // 3 raised meander traces
  for (let i = -1; i <= 1; i++) {
    add(new THREE.BoxGeometry(9.5, 0.7, 0.18), mat.copper, 0, ay + i * 1.4, PCB_TOP + 0.14);
  }
}

// ---- 5. WS2812 RGB LED + a couple of passives ----------------------------
add(new THREE.BoxGeometry(1.8, 1.8, 0.7), mat.led, -4.5, 3.4, PCB_TOP + 0.35);
add(new THREE.BoxGeometry(1.0, 0.6, 0.45), mat.silk, 4.6, 3.6, PCB_TOP + 0.22); // 0603 passive
add(new THREE.BoxGeometry(1.0, 0.6, 0.45), mat.silk, 4.6, 5.0, PCB_TOP + 0.22);

// ---- 6. BOOT + RST tactile buttons (near USB end) ------------------------
for (const bx of [-6.5, 6.5]) {
  add(new THREE.BoxGeometry(2.6, 2.6, 1.0), mat.btn, bx, -4.6, PCB_TOP + 0.5);
  add(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 12), mat.btn, bx, -4.6, PCB_TOP + 1.1, Math.PI / 2);
}

// ---- 7. Header strips along ±X edges (black base + short gold nubs) -------
for (const sx of [-HDR_X, HDR_X]) {
  const stripY0 = PIN_Y[0];
  const stripY1 = PIN_Y[PIN_Y.length - 1];
  const stripLen = stripY1 - stripY0 + 2.4;
  add(new THREE.BoxGeometry(2.4, stripLen, 1.1), mat.hdrPlastic, sx, 0, PCB_TOP + 0.35);
  for (const py of PIN_Y) {
    // short square gold nub — the overlay PinStub (taller, ringed) marks the wirable ones
    add(new THREE.BoxGeometry(0.66, 0.66, 1.4), mat.gold, sx, py, PCB_TOP + 0.5);
  }
}

// ---- Export --------------------------------------------------------------
mkdirSync(dirname(OUT), { recursive: true });
new GLTFExporter().parse(
  root,
  (glb) => {
    const buf = Buffer.from(glb);
    writeFileSync(OUT, buf);
    // bbox report so we can eyeball units/centering
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
