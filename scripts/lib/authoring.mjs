/**
 * Shared helpers for authoring Forge part GLBs at real mm in the real-parts
 * frame (X = long edge, Y = short edge, Z = thickness / component side +Z,
 * origin = part center). Headless three.js → binary GLB. Solid-colour materials
 * only (no textures — headless Node has no canvas/Image path).
 */
import "./gltf-node-polyfill.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export { THREE };

/** MeshStandardMaterial with sane defaults. */
export const std = (color, o = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    metalness: o.metalness ?? 0.1,
    roughness: o.roughness ?? 0.5,
    ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.emissiveIntensity ?? 1 } : {}),
  });

export function roundedRectShape(l, w, r) {
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

/** Rounded PCB slab, thickness centered on Z=0. */
export function pcbSlab(l, w, t, mat, r = 1.4) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(l, w, r), {
    depth: t,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -t / 2);
  return new THREE.Mesh(geo, mat);
}

/** A named group + an `add(geo, mat, x,y,z, rx,ry,rz)` helper. */
export function group(name) {
  const root = new THREE.Group();
  root.name = name;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    root.add(m);
    return m;
  };
  return { root, add };
}

/** Small gold pad at a real-parts pin position (so overlays land on metal). */
export function goldPad(add, gold, [x, y, z]) {
  add(new THREE.CylinderGeometry(1.0, 1.05, 0.18, 12), gold, x, y, z, Math.PI / 2);
}

export function exportGlb(root, outPath, label) {
  mkdirSync(dirname(outPath), { recursive: true });
  return new Promise((res, rej) => {
    new GLTFExporter().parse(
      root,
      (glb) => {
        const buf = Buffer.from(glb);
        writeFileSync(outPath, buf);
        const s = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        console.log(`OK  ${label}  ${buf.length}b  ${s.x.toFixed(1)}x${s.y.toFixed(1)}x${s.z.toFixed(1)}mm`);
        res();
      },
      rej,
      { binary: true, onlyVisible: true }
    );
  });
}
