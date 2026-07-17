/**
 * Stage shots — the deterministic camera vocabulary.
 *
 * Every camera position in the Stage is a named, solved-from-data shot: same
 * scene in → same framing out, every load, every device. This replaces the old
 * viewer's two racing init paths (Canvas prop IIFE vs scene-effect dolly) that
 * made the first frame differ per reload.
 *
 * Pure module (no React/WebGL) — solving reuses cad-frame's AABB math.
 */
import type { SceneNode3D } from "@/lib/product-3d";
import { cadCameraForNodes, frameForNodeIds } from "@/lib/product-3d";

/** Stable shot ids. `part:<nodeId>` frames one part; `phase:<n>` is an
 *  assembly-phase camera (solved from the recipe's cameraHint, not here);
 *  `wire:<netId>` lands in S2. */
export type ShotId =
  | "hero"
  | "table"
  | "overhead"
  | "map"
  | `part:${string}`
  | `phase:${string}`;

export interface StageShot {
  id: ShotId;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** Camera directions per named framing (right, up, front — normalized in solver). */
const SHOT_DIRS: Record<string, [number, number, number]> = {
  // ¾ low hero — the product LOOMS (matches the tuned legacy hero angle).
  hero: [0.78, 0.49, 0.92],
  // Straighter product-photo angle, slightly higher eye line.
  table: [0.62, 0.58, 0.95],
  // High diagram angle for wiring-map reading.
  overhead: [0.3, 1.25, 0.55],
  map: [0.3, 1.25, 0.55],
};

/** Solve a named shot against the current node set. Deterministic. */
export function solveShot(
  id: ShotId,
  nodes: SceneNode3D[],
  rootScale: number
): StageShot {
  if (id.startsWith("part:")) {
    const nodeId = id.slice("part:".length);
    const frame = frameForNodeIds(nodes, [nodeId], rootScale, 1.15);
    return { id, position: frame.position, target: frame.target, fov: frame.fov };
  }
  const dir = SHOT_DIRS[id] ?? SHOT_DIRS.hero;
  // Map mode frames wider (spread layout); hero/table hug the product.
  const margin = id === "map" || id === "overhead" ? 1.35 : 1.2;
  const frame = cadCameraForNodes(nodes, rootScale, margin, 1.6, dir);
  const fov = id === "hero" ? 34 : 38;
  return { id, position: frame.position, target: frame.target, fov };
}

/** Parse a ?cam= debug param into a ShotId (invalid → null). */
export function parseShotId(raw: string | null | undefined): ShotId | null {
  if (!raw) return null;
  if (raw === "hero" || raw === "table" || raw === "overhead" || raw === "map") {
    return raw;
  }
  if (raw.startsWith("part:") && raw.length > "part:".length) {
    return raw as ShotId;
  }
  return null;
}
