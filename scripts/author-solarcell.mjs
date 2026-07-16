/**
 * Author the 60×45 craft solar panel as a GLB — dark-silver aluminum frame,
 * glossy near-black epoxy field, a geometric 4×3 raised cell grid (recognition
 * without textures: tiles + gutters + busbars), gold solder pads at the +X
 * wiring-root edge. Built from scripts/lib/author-kit.mjs primitives.
 *
 * FRAME (must match real-parts.ts solar_cell so PinStub overlays land):
 *   panel in the XY plane, thickness along Z   origin = panel center
 *   component side +Z   the +X edge is the wiring-root edge
 *   "+" pin at (28, 0, 0.8)   "−" pin at (28, −8, 0.8)
 *   bbox 60 × 45 × 3mm
 *
 * Run:  node scripts/author-solarcell.mjs
 * Out:  public/models/parts/solar_cell.glb
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { MAT, chamferedBoard, textLabel, exportGlb } from "./lib/author-kit.mjs";

// ---- Dimensions (mm) -------------------------------------------------------
const OUTER_L = 60, OUTER_W = 45, FRAME_T = 3;
const LIP = 1.5; // frame lip width
const INNER_L = OUTER_L - 2 * LIP; // 57 — epoxy field width
const INNER_W = OUTER_W - 2 * LIP; // 42 — epoxy field height
const EPOXY_T = 2.4;
const FRAME_BOTTOM = -FRAME_T / 2; // -1.5
// Epoxy sits flush with the frame's back and recessed below the front lip —
// the aluminum edge protects the laminate, like a real panel.
const EPOXY_TOP = FRAME_BOTTOM + EPOXY_T; // 0.9
const EPOXY_CENTER_Z = FRAME_BOTTOM + EPOXY_T / 2; // -0.3

const COLS_X = [-1.5, -0.5, 0.5, 1.5]; // 4 columns
const ROWS_Y = [-1, 0, 1]; // 3 rows
const TILE_W = 13, TILE_H = 12.5, TILE_T = 0.3;
const GUTTER = 1.2;
const COL_PITCH = TILE_W + GUTTER; // 14.2
const ROW_PITCH = TILE_H + GUTTER; // 13.7
const colXs = COLS_X.map((n) => n * COL_PITCH);
const rowYs = ROWS_Y.map((n) => n * ROW_PITCH);
const GRID_H = ROWS_Y.length * TILE_H + (ROWS_Y.length - 1) * GUTTER; // 39.9 — full column run

const TILE_TOP = EPOXY_TOP + TILE_T; // 1.2
const BUSBAR_W = 0.6, BUSBAR_H = 0.25;
const BUSBAR_TOP = TILE_TOP + BUSBAR_H; // 1.45

const PIN_PLUS = { x: 28, y: 0, z: 0.8 };
const PIN_MINUS = { x: 28, y: -8, z: 0.8 };

// ---- Materials (solid colour only — headless export has no texture path) --
const frameMat = MAT.steel();
frameMat.roughness = 0.45; // duller than raw steel — reads as anodized aluminum
const epoxyMat = new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: 0.25 }); // glossy epoxy
const tileMat = MAT.cellNavy();
tileMat.color.setHex(0x11224d); // cellNavy-ish, distinct from the epoxy field
const busMat = MAT.steel(); // bright silver — contrasts the duller frame
const goldMat = MAT.gold();

const root = new THREE.Group();
root.name = "SolarCell60x45";
const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  root.add(mesh);
  return mesh;
};

// ---- 1. Slim frame — 4 bars forming a 60×45×3 ring, 1.5mm lip ------------
{
  const halfL = OUTER_L / 2, halfW = OUTER_W / 2;
  add(new THREE.BoxGeometry(LIP, OUTER_W, FRAME_T), frameMat, -(halfL - LIP / 2), 0, 0); // left
  add(new THREE.BoxGeometry(LIP, OUTER_W, FRAME_T), frameMat, halfL - LIP / 2, 0, 0); // right
  add(new THREE.BoxGeometry(INNER_L, LIP, FRAME_T), frameMat, 0, halfW - LIP / 2, 0); // top
  add(new THREE.BoxGeometry(INNER_L, LIP, FRAME_T), frameMat, 0, -(halfW - LIP / 2), 0); // bottom
}

// ---- 2. Inset epoxy field — glossy near-black, recessed under the lip ----
{
  const epoxy = chamferedBoard(INNER_L, INNER_W, EPOXY_T, 1.5, epoxyMat);
  epoxy.position.z = EPOXY_CENTER_Z;
  root.add(epoxy);
}

// ---- 3. Geometric cell grid — 4 × 3 raised tiles, gutters read as seams --
for (const cx of colXs) {
  for (const cy of rowYs) {
    add(new THREE.BoxGeometry(TILE_W, TILE_H, TILE_T), tileMat, cx, cy, EPOXY_TOP + TILE_T / 2);
  }
}

// ---- 4. Busbars — vertical per column + one horizontal collector ---------
for (const cx of colXs) {
  add(new THREE.BoxGeometry(BUSBAR_W, GRID_H, BUSBAR_H), busMat, cx, 0, TILE_TOP + BUSBAR_H / 2);
}
{
  // Horizontal collector crosses all 4 column busbars and terminates near
  // the +X wiring-root edge, just short of the solder pads.
  const startX = colXs[0];
  const endX = PIN_PLUS.x - 1;
  const len = endX - startX;
  add(new THREE.BoxGeometry(len, BUSBAR_W, BUSBAR_H), busMat, (startX + endX) / 2, -4, BUSBAR_TOP + BUSBAR_H / 2);
}

// ---- 5. Solder pads at the real-parts pin coords, +/− marks beside them --
const padGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.4, 20);
for (const pin of [PIN_PLUS, PIN_MINUS]) {
  add(padGeo, goldMat, pin.x, pin.y, pin.z, Math.PI / 2, 0, 0); // flat face to +Z
}
// Marks sit proud on the tile top (not the epoxy floor) so they stay visible
// even where they land over the rightmost tile column, next to each pad.
root.add(textLabel("+", { size: 1.2, depth: 0.15, x: PIN_PLUS.x - 3.5, y: PIN_PLUS.y, z: TILE_TOP }));
root.add(textLabel("-", { size: 1.2, depth: 0.15, x: PIN_MINUS.x - 3.5, y: PIN_MINUS.y, z: TILE_TOP }));

// ---- Export + fidelity assertions -----------------------------------------
const { bytes, size } = await exportGlb(root, "solar_cell.glb");
assert.ok(size.x >= 59 && size.x <= 62, `size.x ${size.x.toFixed(2)} outside 59–62`);
assert.ok(size.y >= 44 && size.y <= 47, `size.y ${size.y.toFixed(2)} outside 44–47`);
assert.ok(bytes < 300000, `bytes ${bytes} ≥ 300000`);
console.log("PASS  solar_cell assertions (size + byte budget)");
