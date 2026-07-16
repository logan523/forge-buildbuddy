/**
 * Author the 0.96" SSD1306 I2C OLED module as a GLB — module BODY only (blue
 * PCB, dark glass panel, 4-pin header). The live SSD1306 clock is a runtime
 * overlay the renderer draws on top of the glass (see part-fallback/basic.tsx
 * OledScreen + product-node-mesh.tsx CatalogGlbUnderlay overlay), so this
 * script must NEVER draw screen pixels — the glass stays a blank dark slab.
 *
 * Built from the shared author-kit (chamferedBoard / textLabel / MAT /
 * exportGlb) — see scripts/lib/author-kit.mjs.
 *
 * FRAME (must match real-parts.ts oled_096 so the PinStub overlay + the live
 * screen land):
 *   X = 27mm   Y = 27mm   Z = thickness   origin = module center
 *   4-pin header on the BACK (−Z), along the −Y edge: VCC/GND/SCL/SDA at
 *     x = −3.81, −1.27, +1.27, +3.81 (2.54mm pitch)   y = −12.3   z = −1.5
 *   glass on the FRONT (+Z), upper-centre: center y ≈ +3, front face z ≈ +2.0
 *   live overlay plane rides at [0, 3, 2.1] mm, size 21.7×11mm — see
 *     product-node-mesh.tsx ("OLED live screen rides on top of the GLB body")
 *
 * Run:  node scripts/author-oled096.mjs   (or: npm run models:oled096)
 * Out:  public/models/parts/oled_096.glb
 */
import "./lib/gltf-node-polyfill.mjs";
import * as THREE from "three";
import { chamferedBoard, textLabel, MAT, exportGlb } from "./lib/author-kit.mjs";

// ---- Dimensions (mm) -------------------------------------------------------
const BOARD = 27; // X and Y
const BOARD_T = 1.6;
const TOP = BOARD_T / 2; // +0.8 front face
const BOT = -BOARD_T / 2; // -0.8 back face
const CORNER_R = 1.6;

const root = new THREE.Group();
root.name = "SSD1306_OLED_096";

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

// ---- 2. Glass display panel — FRONT, upper-centre — stays BLANK -----------
// Contract: no pixel/segment content here. The live clock is composited by
// the renderer at [0, 3, 2.1] (see header note); this is the physical glass
// the overlay rides just in front of.
const GLASS_W = 26, GLASS_H = 15, GLASS_T = 1.0;
const GLASS_Y = 3;
const GLASS_BOTTOM_Z = TOP + 0.2; // small standoff above the carrier board
const GLASS_CENTER_Z = GLASS_BOTTOM_Z + GLASS_T / 2; // front face lands at +2.0
{
  // Thin dark bezel frame under the glass — a mounted-panel look, not screen
  // content (no pixels, just a plain frame slightly wider than the glass).
  add(new THREE.BoxGeometry(GLASS_W + 0.8, GLASS_H + 0.8, 0.3), MAT.plastic(), 0, GLASS_Y, TOP + 0.05);
  add(new THREE.BoxGeometry(GLASS_W, GLASS_H, GLASS_T), MAT.glass(), 0, GLASS_Y, GLASS_CENTER_Z);
}

// ---- 3. 4-pin header on the BACK (−Z), along the −Y edge -------------------
const PIN_X = [-3.81, -1.27, 1.27, 3.81]; // VCC GND SCL SDA — matches real-parts.ts
const HDR_Y = -12.3;
{
  const spanX = PIN_X[PIN_X.length - 1] - PIN_X[0];
  // Black header base, flush against the board's back face.
  add(new THREE.BoxGeometry(spanX + 2.2, 2.3, 0.8), MAT.plastic(), 0, HDR_Y, BOT - 0.4);
  for (const x of PIN_X) {
    // Gold nub centered exactly at the real-parts pin z (−1.5), bottom flush
    // to the header base so the pin reads as continuous, not floating.
    add(new THREE.BoxGeometry(0.62, 0.62, 1.0), MAT.gold(), x, HDR_Y, -1.5);
  }
}

// ---- 4. Silkscreen ----------------------------------------------------------
// Front: model name, lower margin (below the glass, clear of the header footprint).
root.add(textLabel("0.96 OLED", { size: 1.4, depth: 0.14, x: 0, y: -9.3, z: TOP + 0.07 }));
// Back: one letter per pin (V/G/C/D for VCC/GND/SCL/SDA), placed directly
// above each pin. Font-extruded text is the priciest geometry this kit can
// produce (curved glyph outlines, no vertex dedup) — the full "VCC GND SCL
// SDA" string alone runs ~165KB, which blows the 300KB export budget once
// added to "0.96 OLED" + the board/glass/header. Single letters keep the
// per-pin callout (real tiny modules abbreviate the same way when space is
// this tight) while costing ~55KB total. See final report for this deviation.
// Text authored facing +Z reads mirrored from behind, so each is rotated
// 180° about Y — flips left/right while keeping "up" up, which is exactly
// what reading the BACK of a flipped board requires.
{
  const PIN_LETTER = ["V", "G", "C", "D"];
  PIN_X.forEach((x, i) => {
    const lbl = textLabel(PIN_LETTER[i], { size: 0.9, depth: 0.1, x, y: HDR_Y + 1.7, z: BOT - 0.06 });
    lbl.rotation.y = Math.PI;
    root.add(lbl);
  });
}

// ---- 5. Corner mounting holes + front gold rings ---------------------------
const HOLE_X = 11.2, HOLE_Y = 12.0, HOLE_R = 0.9;
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    // Dark bore through the board.
    add(new THREE.CylinderGeometry(HOLE_R, HOLE_R, BOARD_T + 0.2, 16), MAT.chip(), sx * HOLE_X, sy * HOLE_Y, 0, Math.PI / 2);
    // Thin gold annular pad on the front face (flat ring, faces +Z by default).
    add(new THREE.RingGeometry(HOLE_R, HOLE_R + 0.6, 24), MAT.gold(), sx * HOLE_X, sy * HOLE_Y, TOP + 0.02);
  }
}

// ---- Export + asserts -------------------------------------------------------
const { bytes, size } = await exportGlb(root, "oled_096.glb");
if (size.x < 26 || size.x > 29) throw new Error(`oled_096: size.x ${size.x.toFixed(2)} out of [26,29]`);
if (size.y < 26 || size.y > 30) throw new Error(`oled_096: size.y ${size.y.toFixed(2)} out of [26,30]`);
if (bytes >= 300000) throw new Error(`oled_096: ${bytes} bytes >= 300000 cap`);
console.log("PASS oled_096 asserts (size.x/y in range, bytes under cap)");
