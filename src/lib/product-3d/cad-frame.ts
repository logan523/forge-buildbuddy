/**
 * CAD-style framing helpers (pure) — camera from scene AABB, no WebGL Bounds.fit races.
 * Inspired by three-cad-viewer style framing: compute bounds → place camera on diagonal.
 */
import type { SceneNode3D } from "./types";

export interface CadFrame {
  position: [number, number, number];
  target: [number, number, number];
  /** Suggested FOV degrees */
  fov: number;
}

/** Rough radius of a node for bounds (mm). */
function nodeRadiusMm(n: SceneNode3D): number {
  const p = n.geom.params;
  if (n.geom.kind === "wire_cube_cage") return (p.size || 60) * 0.7;
  if (n.geom.kind === "metal_stand") return Math.max(p.footR || 14, (p.height || 90) * 0.15);
  if (n.geom.kind === "solar_module" || n.geom.kind === "solar_panel")
    return Math.hypot(p.width || 50, p.height || 30) * 0.55;
  if (n.geom.kind === "oled_module" || n.geom.kind === "oled_panel")
    return Math.hypot(p.width || 30, p.height || 20) * 0.6;
  if (n.geom.kind === "cell_16340") return Math.max(p.radius || 10, (p.height || 40) * 0.35);
  return Math.max(p.radius || 0, p.width || 0, p.height || 0, 12) * 0.5;
}

/**
 * World-space AABB from node positions (mm → world via rootScale) + radii.
 */
export function sceneWorldBounds(
  nodes: SceneNode3D[],
  rootScale: number
): { min: [number, number, number]; max: [number, number, number]; center: [number, number, number]; radius: number } {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const n of nodes) {
    const r = nodeRadiusMm(n) * rootScale;
    const x = n.position[0] * rootScale;
    const y = n.position[1] * rootScale;
    const z = n.position[2] * rootScale;
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r * 0.2);
    minZ = Math.min(minZ, z - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
    maxZ = Math.max(maxZ, z + r);
  }
  if (!Number.isFinite(minX)) {
    return {
      min: [-1, 0, -1],
      max: [1, 1.5, 1],
      center: [0, 0.75, 0],
      radius: 1.2,
    };
  }
  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const radius =
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 || 1;
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    radius,
  };
}

/**
 * Place camera on a ¾ diagonal so the full product is in frame with margin.
 * @param margin multiplies distance (1.0 = tight, 1.8 = comfortable CAD padding)
 */
export function cadCameraForNodes(
  nodes: SceneNode3D[],
  rootScale: number,
  margin = 1.35,
  // Distance floor. 1.6 keeps the WHOLE product (with stand/wings) from
  // clipping; a tight subset (step focus) passes a much smaller floor so the
  // camera can get close instead of parking far back and showing empty stand.
  minDist = 1.6
): CadFrame {
  const b = sceneWorldBounds(nodes, rootScale);
  const dist = Math.max(minDist, b.radius * 2.1 * margin);
  // Hero 3/4 — a low ~22° elevation so the satellite LOOMS and its brass
  // silhouette reads against the void, instead of a top-down CAD plan view.
  // (Azimuth preserved ~40°; the tall stand still centers via the bbox.)
  const dir: [number, number, number] = [0.78, 0.49, 0.92];
  const len = Math.hypot(...dir) || 1;
  const ux = dir[0] / len;
  const uy = dir[1] / len;
  const uz = dir[2] / len;
  return {
    position: [
      b.center[0] + ux * dist,
      b.center[1] + uy * dist,
      b.center[2] + uz * dist,
    ],
    target: b.center,
    fov: 42,
  };
}

/**
 * Frame a subset of nodes (JARVIS isolate inspect) — tighter margin for part detail.
 * Pure; no Bounds.fit / WebGL.
 */
export function frameForNodeIds(
  nodes: SceneNode3D[],
  nodeIds: string[],
  rootScale: number,
  margin = 1.15
): CadFrame {
  const idSet = new Set(nodeIds);
  const subset = nodes.filter((n) => idSet.has(n.id));
  const use = subset.length > 0 ? subset : nodes;
  // Subset framing gets close: a small focus bbox should NOT be floored to the
  // whole-scene 1.6 (that parks the camera far back and fills the frame with
  // the empty stand/ground below the parts).
  const frame = cadCameraForNodes(use, rootScale, margin, 0.5);
  // Slightly tighter FOV when inspecting a single part
  if (subset.length === 1) {
    return { ...frame, fov: 36 };
  }
  return frame;
}

/** CAD presentation palette (distinct solid parts — Creo/Onshape readability). */
export const CAD_LAYER_COLORS: Record<string, string> = {
  base: "#a8b0b8",
  frame: "#c9a227",
  face: "#0f766e",
  wings: "#1e3a5f",
  power: "#334155",
  brain: "#166534",
  sensor: "#86efac",
  touch: "#ea580c",
};
