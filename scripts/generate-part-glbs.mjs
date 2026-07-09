#!/usr/bin/env node
/**
 * Offline GLB factory for sat-line parts — 1 unit = 1 mm (matches RealPartSpec).
 * No OpenSCAD required; pure Node binary glTF writer.
 *
 * Usage (repo root):
 *   node scripts/generate-part-glbs.mjs
 *
 * Writes public/models/parts/*.glb then you flip mesh.glbReady in real-parts.ts
 * (this script prints the checklist; --ready flag also rewrites real-parts glbReady).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/models/parts");

// Locked to src/lib/product-3d/real-parts.ts (keep in sync)
const PARTS = {
  esp32_c3: { l: 22.5, w: 18, h: 3.2 },
  oled_096: { l: 27, w: 27, h: 4 },
  tp4056: { l: 25, w: 19, h: 3.5 },
  cell_16340: { r: 8.25, len: 34 },
  sht30: { l: 16, w: 16, h: 3 },
  ttp223: { l: 15, w: 11, h: 3 },
  solar_cell: { l: 60, w: 45, h: 3 },
};

// --- mesh primitives (Y-up, center origin) ---

function box(w, h, d, ox = 0, oy = 0, oz = 0) {
  // axes: X=w, Y=h, Z=d (board flat in XY, thickness Z — matches sat pin locals)
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const positions = [];
  const normals = [];
  const indices = [];
  // 6 faces, 4 verts each
  const faces = [
    // +Z
    [
      [hw, -hh, hd],
      [hw, hh, hd],
      [-hw, hh, hd],
      [-hw, -hh, hd],
      [0, 0, 1],
    ],
    // -Z
    [
      [-hw, -hh, -hd],
      [-hw, hh, -hd],
      [hw, hh, -hd],
      [hw, -hh, -hd],
      [0, 0, -1],
    ],
    // +Y
    [
      [-hw, hh, -hd],
      [-hw, hh, hd],
      [hw, hh, hd],
      [hw, hh, -hd],
      [0, 1, 0],
    ],
    // -Y
    [
      [hw, -hh, -hd],
      [hw, -hh, hd],
      [-hw, -hh, hd],
      [-hw, -hh, -hd],
      [0, -1, 0],
    ],
    // +X
    [
      [hw, -hh, -hd],
      [hw, hh, -hd],
      [hw, hh, hd],
      [hw, -hh, hd],
      [1, 0, 0],
    ],
    // -X
    [
      [-hw, -hh, hd],
      [-hw, hh, hd],
      [-hw, hh, -hd],
      [-hw, -hh, -hd],
      [-1, 0, 0],
    ],
  ];
  let base = 0;
  for (const f of faces) {
    const n = f[4];
    for (let i = 0; i < 4; i++) {
      const p = f[i];
      positions.push(p[0] + ox, p[1] + oy, p[2] + oz);
      normals.push(n[0], n[1], n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return { positions, normals, indices };
}

function cylinder(radius, height, segs = 24, ox = 0, oy = 0, oz = 0) {
  // Axis along Y (cell local before scene Z-rot)
  const positions = [];
  const normals = [];
  const indices = [];
  const hh = height / 2;
  // side
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const b = positions.length / 3;
    positions.push(x0 + ox, -hh + oy, z0 + oz, x1 + ox, -hh + oy, z1 + oz, x1 + ox, hh + oy, z1 + oz, x0 + ox, hh + oy, z0 + oz);
    const nx0 = Math.cos(a0);
    const nz0 = Math.sin(a0);
    const nx1 = Math.cos(a1);
    const nz1 = Math.sin(a1);
    normals.push(nx0, 0, nz0, nx1, 0, nz1, nx1, 0, nz1, nx0, 0, nz0);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // caps
  for (const sign of [1, -1]) {
    const cy = sign * hh + oy;
    const center = positions.length / 3;
    positions.push(ox, cy, oz);
    normals.push(0, sign, 0);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      positions.push(Math.cos(a) * radius + ox, cy, Math.sin(a) * radius + oz);
      normals.push(0, sign, 0);
    }
    for (let i = 0; i < segs; i++) {
      const i0 = center;
      const i1 = center + 1 + i;
      const i2 = center + 1 + ((i + 1) % segs);
      if (sign > 0) indices.push(i0, i1, i2);
      else indices.push(i0, i2, i1);
    }
  }
  return { positions, normals, indices };
}

function mergeMeshes(parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  let base = 0;
  for (const m of parts) {
    positions.push(...m.positions);
    normals.push(...m.normals);
    for (const i of m.indices) indices.push(i + base);
    base += m.positions.length / 3;
  }
  return { positions, normals, indices };
}

// --- glTF binary writer ---

function buildGlb(mesh, color = [0.15, 0.35, 0.2, 1]) {
  const pos = new Float32Array(mesh.positions);
  const nor = new Float32Array(mesh.normals);
  const idx = new Uint16Array(mesh.indices);

  // bounds
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]);
    minY = Math.min(minY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]);
    maxX = Math.max(maxX, pos[i]);
    maxY = Math.max(maxY, pos[i + 1]);
    maxZ = Math.max(maxZ, pos[i + 2]);
  }

  const posBytes = new Uint8Array(pos.buffer);
  const norBytes = new Uint8Array(nor.buffer);
  const idxBytes = new Uint8Array(idx.buffer);

  // Align each buffer view to 4 bytes
  function pad4(n) {
    return (4 - (n % 4)) % 4;
  }
  const posPad = pad4(posBytes.length);
  const norPad = pad4(norBytes.length);
  const idxPad = pad4(idxBytes.length);

  const posOff = 0;
  const norOff = posBytes.length + posPad;
  const idxOff = norOff + norBytes.length + norPad;
  const binLen = idxOff + idxBytes.length + idxPad;

  const bin = new Uint8Array(binLen);
  bin.set(posBytes, posOff);
  bin.set(norBytes, norOff);
  bin.set(idxBytes, idxOff);

  const json = {
    asset: { version: "2.0", generator: "buildbuddy-generate-part-glbs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "part",
        pbrMetallicRoughness: {
          baseColorFactor: color,
          metallicFactor: color[0] > 0.5 ? 0.7 : 0.05,
          roughnessFactor: color[0] > 0.5 ? 0.35 : 0.55,
        },
        doubleSided: true,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: pos.length / 3,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: nor.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: idx.length,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOff, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: norOff, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: idxOff, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: binLen }],
  };

  let jsonStr = JSON.stringify(json);
  const jsonPad = pad4(jsonStr.length);
  jsonStr += " ".repeat(jsonPad);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  const totalLen = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new ArrayBuffer(totalLen);
  const view = new DataView(out);
  const u8 = new Uint8Array(out);

  // header
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLen, true);
  // JSON chunk
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  u8.set(jsonBytes, 20);
  // BIN chunk
  const binChunkStart = 20 + jsonBytes.length;
  view.setUint32(binChunkStart, binLen, true);
  view.setUint32(binChunkStart + 4, 0x004e4942, true); // BIN
  u8.set(bin, binChunkStart + 8);

  return Buffer.from(out);
}

// --- part builders (SKU silhouettes, dimension-locked) ---

function buildEsp() {
  const { l, w, h } = PARTS.esp32_c3;
  return mergeMeshes([
    box(l, w, h), // FR4
    box(l * 0.35, w * 0.28, h * 0.55, 0, w * 0.05, h * 0.55), // main chip
    box(9, 2.8, 2.2, 0, -w / 2 + 1.0, 0.3), // USB-C shell
    box(l * 0.12, w * 0.22, h * 0.2, l * 0.32, w * 0.28, h * 0.4), // antenna
  ]);
}

function buildOled() {
  const { l, w, h } = PARTS.oled_096;
  return mergeMeshes([
    box(l, w, h * 0.45, 0, 0, -h * 0.2), // PCB
    box(l * 0.96, w * 0.88, h * 0.55, 0, w * 0.02, h * 0.1), // bezel
    box(l * 0.78, w * 0.62, 0.3, 0, w * 0.04, h * 0.38), // glass
  ]);
}

function buildTp() {
  const { l, w, h } = PARTS.tp4056;
  return mergeMeshes([
    box(l, w, h),
    box(l * 0.28, w * 0.22, h * 0.5, -l * 0.1, 0, h * 0.5),
    box(7.5, 2.6, 2.0, 0, -w / 2 + 1.0, 0.3), // micro-USB
  ]);
}

function buildCell() {
  const { r, len } = PARTS.cell_16340;
  return mergeMeshes([
    cylinder(r, len * 0.88, 28),
    cylinder(r * 0.55, len * 0.08, 16, 0, len * 0.44, 0),
    cylinder(r * 0.95, len * 0.06, 16, 0, -len * 0.44, 0),
  ]);
}

function buildSht() {
  const { l, w, h } = PARTS.sht30;
  return mergeMeshes([
    box(l, w, h),
    box(l * 0.35, w * 0.35, h * 0.5, 0, 0, h * 0.45),
  ]);
}

function buildTtp() {
  const { l, w, h } = PARTS.ttp223;
  return mergeMeshes([
    box(l, w, h),
    cylinder(Math.min(l, w) * 0.28, h * 0.4, 16, 0, 0, h * 0.5),
  ]);
}

function buildSolar() {
  const { l, w, h } = PARTS.solar_cell;
  return mergeMeshes([
    box(l, w, h),
    box(l * 0.92, w * 0.88, 0.4, 0, 0, h * 0.4),
  ]);
}

const BUILDERS = {
  esp32_c3: { mesh: buildEsp, color: [0.06, 0.24, 0.14, 1] },
  oled_096: { mesh: buildOled, color: [0.05, 0.05, 0.08, 1] },
  tp4056: { mesh: buildTp, color: [0.06, 0.24, 0.14, 1] },
  cell_16340: { mesh: buildCell, color: [0.12, 0.14, 0.18, 1] },
  sht30: { mesh: buildSht, color: [0.08, 0.35, 0.18, 1] },
  ttp223: { mesh: buildTtp, color: [0.72, 0.28, 0.08, 1] },
  solar_cell: { mesh: buildSolar, color: [0.04, 0.07, 0.14, 1] },
};

mkdirSync(OUT, { recursive: true });

const written = [];
for (const [id, conf] of Object.entries(BUILDERS)) {
  const glb = buildGlb(conf.mesh(), conf.color);
  const path = join(OUT, `${id}.glb`);
  writeFileSync(path, glb);
  written.push({ id, path, bytes: glb.length });
  console.log(`wrote ${id}.glb (${glb.length} bytes)`);
}

// Optionally flip glbReady in real-parts.ts
if (process.argv.includes("--ready")) {
  const rp = join(ROOT, "src/lib/product-3d/real-parts.ts");
  let src = readFileSync(rp, "utf8");
  for (const { id } of written) {
    // Flip glbReady: false → true only inside each part's mesh block carefully
    // Global replace of glbReady: false would also hit generic; do per-id
  }
  // Safer: set all sat-line parts that we just wrote
  for (const id of Object.keys(BUILDERS)) {
    const re = new RegExp(
      `(id:\\s*"${id}"[\\s\\S]*?mesh:\\s*\\{[\\s\\S]*?glbReady:\\s*)false`,
      "m"
    );
    if (re.test(src)) {
      src = src.replace(re, "$1true");
      console.log(`set glbReady true for ${id}`);
    }
  }
  writeFileSync(rp, src);
  console.log("updated real-parts.ts glbReady flags");
}

console.log(`\nDone. ${written.length} GLBs → ${OUT}`);
console.log("Run with --ready to flip RealPartSpec.mesh.glbReady, or set manually.");
