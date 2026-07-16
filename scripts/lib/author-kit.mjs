/**
 * Author-kit — shared vocabulary for hand-authoring part GLBs (S3 realism pass).
 *
 * Everything renders headless in Node (solid-colour materials only — no canvas,
 * no texture files). Recognition comes from GEOMETRY: chamfered boards, real
 * connector shapes, extruded silkscreen text (vendored helvetiker typeface),
 * pin headers at true pitch.
 *
 * Conventions (must match real-parts.ts + PART_MODELS):
 *   • units mm · board long edge = X · short edge = Y · thickness = Z
 *   • origin = part center · component side +Z
 *   • export via exportGlb() → public/models/parts/<id>.glb
 */
import "./gltf-node-polyfill.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------- fonts --------------------------------- */

let _font = null;
export function loadFont() {
  if (_font) return _font;
  const json = JSON.parse(
    readFileSync(resolve(__dirname, "helvetiker_regular.typeface.json"), "utf8")
  );
  _font = new FontLoader().parse(json);
  return _font;
}

/* -------------------------------- materials ------------------------------- */

export const MAT = {
  pcbBlue: () => new THREE.MeshStandardMaterial({ color: 0x15305c, roughness: 0.5 }),
  pcbNavy: () => new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.52 }),
  pcbGreen: () => new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.55 }),
  pcbRed: () => new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.55 }),
  silk: () => new THREE.MeshStandardMaterial({ color: 0xe7ebf0, roughness: 0.6 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd8b45c, metalness: 0.85, roughness: 0.28 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xb9793f, metalness: 0.6, roughness: 0.35 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 }),
  chip: () => new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.38 }),
  plastic: () => new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.55 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.1 }),
  wrapBlue: () => new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.42 }),
  cellNavy: () => new THREE.MeshStandardMaterial({ color: 0x101b3a, roughness: 0.35, metalness: 0.25 }),
  ledClear: (hex = 0xeef2f6) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.22 }),
};

/* -------------------------------- primitives ------------------------------ */

/** Chamfered board slab: rounded-rect outline + beveled extrusion, Z-centered. */
export function chamferedBoard(l, w, t, cornerR = 1.2, mat = MAT.pcbNavy()) {
  const hx = l / 2, hy = w / 2, r = Math.min(cornerR, hx * 0.45, hy * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hy);
  s.lineTo(hx - r, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + r);
  s.lineTo(hx, hy - r); s.quadraticCurveTo(hx, hy, hx - r, hy);
  s.lineTo(-hx + r, hy); s.quadraticCurveTo(-hx, hy, -hx, hy - r);
  s.lineTo(-hx, -hy + r); s.quadraticCurveTo(-hx, -hy, -hx + r, -hy);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: t, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -t / 2);
  return new THREE.Mesh(geo, mat);
}

/** Extruded silkscreen text, centered at (x, y) on the +Z face at height z. */
export function textLabel(text, { size = 1.6, depth = 0.12, x = 0, y = 0, z = 0, color, rotZ = 0 } = {}) {
  const geo = new TextGeometry(text, {
    font: loadFont(), size, depth, curveSegments: 3, bevelEnabled: false,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
  const mesh = new THREE.Mesh(
    geo,
    color ? new THREE.MeshStandardMaterial({ color, roughness: 0.6 }) : MAT.silk()
  );
  mesh.position.set(x, y, z);
  if (rotZ) mesh.rotation.z = rotZ;
  return mesh;
}

/** USB-C receptacle (rounded metal shell + dark slot), mouth toward -Y. */
export function usbC({ w = 9, d = 7.2, h = 3.1 } = {}) {
  const g = new THREE.Group();
  const shellGeo = new THREE.BoxGeometry(w, d, h);
  const shell = new THREE.Mesh(shellGeo, MAT.steel());
  g.add(shell);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(w - 2.2, 1.2, h - 1.3), MAT.plastic());
  slot.position.set(0, -d / 2 + 0.55, 0);
  g.add(slot);
  return g;
}

/** Micro-USB receptacle (trapezoid-ish shell), mouth toward -Y. */
export function microUsb({ w = 7.5, d = 5.5, h = 2.6 } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, d, h), MAT.steel()));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(w - 1.8, 1.0, h - 1.1), MAT.plastic());
  slot.position.set(0, -d / 2 + 0.5, 0);
  g.add(slot);
  return g;
}

/** Row of gold pin nubs on a black header base, along Y at true pitch. */
export function pinHeader(count, { pitch = 2.54, x = 0, z = 0, nub = 1.3 } = {}) {
  const g = new THREE.Group();
  const len = (count - 1) * pitch + 2.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, len, 1.0), MAT.plastic());
  base.position.set(x, 0, z + 0.3);
  g.add(base);
  for (let i = 0; i < count; i++) {
    const y = (i - (count - 1) / 2) * pitch;
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, nub), MAT.gold());
    pin.position.set(x, y, z + 0.45);
    g.add(pin);
  }
  return g;
}

/** SMD chip with tiny leg fringe. */
export function icChip({ w = 5, d = 5, h = 1.0, legs = true } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, d, h), MAT.chip()));
  if (legs) {
    const legGeo = new THREE.BoxGeometry(0.3, 0.5, 0.18);
    const n = Math.max(3, Math.floor(d / 1.1));
    for (let i = 0; i < n; i++) {
      const y = (i - (n - 1) / 2) * (d / n);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, MAT.steel());
        leg.position.set(sx * (w / 2 + 0.2), y, -h / 2 + 0.1);
        g.add(leg);
      }
    }
  }
  return g;
}

/** 0603-ish passive. */
export function passive({ w = 1.0, d = 0.55, h = 0.45, body = 0x8a6d3b } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, d, h), new THREE.MeshStandardMaterial({ color: body, roughness: 0.5 })));
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, d, h), MAT.steel());
    cap.position.x = sx * w * 0.4;
    g.add(cap);
  }
  return g;
}

/** Rectangular status LED. */
export function led(hex, { w = 1.6, d = 0.8, h = 0.6 } = {}) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, d, h), MAT.ledClear(hex));
}

/* --------------------------------- export --------------------------------- */

/** Export + bbox report. Fails loud on invalid output. */
export function exportGlb(root, outFile) {
  const OUT = resolve(__dirname, "../../public/models/parts", outFile);
  mkdirSync(dirname(OUT), { recursive: true });
  return new Promise((resolveP, reject) => {
    new GLTFExporter().parse(
      root,
      (glb) => {
        const buf = Buffer.from(glb);
        if (buf.subarray(0, 4).toString("ascii") !== "glTF") {
          reject(new Error("bad magic")); return;
        }
        writeFileSync(OUT, buf);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const ctr = box.getCenter(new THREE.Vector3());
        console.log(`OK  ${OUT}`);
        console.log(`    ${buf.length} bytes · size mm ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} · center ${ctr.x.toFixed(1)},${ctr.y.toFixed(1)},${ctr.z.toFixed(1)}`);
        resolveP({ bytes: buf.length, size, center: ctr });
      },
      (err) => reject(err),
      { binary: true, onlyVisible: true }
    );
  });
}
