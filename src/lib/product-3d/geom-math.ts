/**
 * Pure geometry helpers for high-fidelity parametric parts.
 * Cylinder orientation uses Three.js setFromUnitVectors so Y-up rods
 * actually align to edge directions (Euler hand-roll is wrong for ±X/±Z).
 */
import { Euler, Quaternion, Vector3 } from "three";

const _fromY = new Vector3(0, 1, 0);
const _to = new Vector3();
const _q = new Quaternion();
const _e = new Euler();

/**
 * Align a Y-up cylinder (length along +Y) to world direction vector.
 * Returns Euler XYZ radians safe for THREE.Object3D.rotation / mesh.rotation.
 */
export function cylinderEulerFromDirection(
  dx: number,
  dy: number,
  dz: number
): [number, number, number] {
  _to.set(dx, dy, dz);
  if (_to.lengthSq() < 1e-14) return [0, 0, 0];
  _to.normalize();
  // Identity when already +Y (setFromUnitVectors is stable)
  _q.setFromUnitVectors(_fromY, _to);
  _e.setFromQuaternion(_q, "XYZ");
  return [_e.x, _e.y, _e.z];
}

/**
 * Apply Euler XYZ to +Y and return unit direction — for tests & fidelity checks.
 * Uses Three.js (same runtime as R3F meshes).
 */
export function applyEulerToUp(
  euler: [number, number, number]
): [number, number, number] {
  const v = new Vector3(0, 1, 0).applyEuler(new Euler(euler[0], euler[1], euler[2], "XYZ"));
  return [v.x, v.y, v.z];
}

/** Max angular error (chord length between unit vectors) for a direction check. */
export function directionError(
  got: [number, number, number],
  want: [number, number, number]
): number {
  const g = new Vector3(...got).normalize();
  const w = new Vector3(...want).normalize();
  return g.distanceTo(w);
}

/** 8 corners of an axis-aligned cube centered at origin, edge length `size`. */
export function cubeCorners(size: number): [number, number, number][] {
  const h = size / 2;
  return [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
  ];
}

/** 12 edges of a cube as corner index pairs. */
export const CUBE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export interface RodSegment {
  mid: [number, number, number];
  length: number;
  euler: [number, number, number];
  /** Unit direction from a → b */
  dir: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
}

/** Build 12 rod segments for a wire cube of edge `size` (mm or world — consistent). */
export function wireCubeRods(size: number): RodSegment[] {
  const corners = cubeCorners(size);
  return CUBE_EDGES.map(([ia, ib]) => {
    const a = corners[ia]!;
    const b = corners[ib]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    const inv = 1 / (length || 1);
    const dir: [number, number, number] = [dx * inv, dy * inv, dz * inv];
    return {
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      length,
      euler: cylinderEulerFromDirection(dx, dy, dz),
      dir,
      a: [...a] as [number, number, number],
      b: [...b] as [number, number, number],
    };
  });
}

/**
 * Endpoint of a Y-up rod of `length` after euler, centered at mid.
 * Half-extent along +Y and -Y should land near edge endpoints (±length/2 along dir).
 */
export function rodEndpointError(rod: RodSegment): number {
  const up = applyEulerToUp(rod.euler);
  // After rotation, cylinder +Y end relative to center is (up * length/2)
  const half = rod.length / 2;
  const endPlus: [number, number, number] = [
    rod.mid[0] + up[0] * half,
    rod.mid[1] + up[1] * half,
    rod.mid[2] + up[2] * half,
  ];
  const endMinus: [number, number, number] = [
    rod.mid[0] - up[0] * half,
    rod.mid[1] - up[1] * half,
    rod.mid[2] - up[2] * half,
  ];
  // Match to a/b (order may flip)
  const d1 =
    Math.hypot(endPlus[0] - rod.a[0], endPlus[1] - rod.a[1], endPlus[2] - rod.a[2]) +
    Math.hypot(endMinus[0] - rod.b[0], endMinus[1] - rod.b[1], endMinus[2] - rod.b[2]);
  const d2 =
    Math.hypot(endPlus[0] - rod.b[0], endPlus[1] - rod.b[1], endPlus[2] - rod.b[2]) +
    Math.hypot(endMinus[0] - rod.a[0], endMinus[1] - rod.a[1], endMinus[2] - rod.a[2]);
  return Math.min(d1, d2);
}

/**
 * Life-size fidelity gates for sat_clock (real-parts mm).
 * Rejects hairline toys AND oversized illustration blobs.
 */
export const SAT_FIDELITY = {
  minRodRadiusMm: 1.5,
  minCageSizeMm: 42,
  /** Craft cage should not balloon past life-size band */
  maxCageSizeMm: 58,
  minSolarDepthMm: 2.0,
  minRootScale: 0.011,
  /** Real 16340 r ≈ 8.25 mm */
  minBatteryRadiusMm: 7.5,
  maxBatteryRadiusMm: 9.0,
  minBatteryHeightMm: 32,
  maxBatteryHeightMm: 36,
  /** SuperMini long edge */
  maxEspLongEdgeMm: 26,
  /** Far framing so full stand + wings fit in view */
  maxCameraDistance: 5.5,
  /** Max total endpoint error (mm or world units) for a cage rod */
  maxRodEndpointError: 0.05,
} as const;

export function assertSatFidelityParams(params: {
  rodR: number;
  cageSize: number;
  solarDepth: number;
  rootScale: number;
  batteryRadius: number;
  cameraDistance: number;
  batteryHeight?: number;
  espLongEdge?: number;
}): { ok: boolean; failures: string[] } {
  const f = SAT_FIDELITY;
  const failures: string[] = [];
  if (params.rodR < f.minRodRadiusMm) failures.push(`rodR ${params.rodR} < ${f.minRodRadiusMm}`);
  if (params.cageSize < f.minCageSizeMm)
    failures.push(`cageSize ${params.cageSize} < ${f.minCageSizeMm}`);
  if (params.cageSize > f.maxCageSizeMm)
    failures.push(`cageSize ${params.cageSize} > ${f.maxCageSizeMm} (illustration scale)`);
  if (params.solarDepth < f.minSolarDepthMm)
    failures.push(`solarDepth ${params.solarDepth} < ${f.minSolarDepthMm}`);
  if (params.rootScale < f.minRootScale)
    failures.push(`rootScale ${params.rootScale} < ${f.minRootScale}`);
  if (params.batteryRadius < f.minBatteryRadiusMm)
    failures.push(`batteryRadius ${params.batteryRadius} < ${f.minBatteryRadiusMm}`);
  if (params.batteryRadius > f.maxBatteryRadiusMm)
    failures.push(`batteryRadius ${params.batteryRadius} > ${f.maxBatteryRadiusMm} (not 16340)`);
  if (params.batteryHeight != null) {
    if (params.batteryHeight < f.minBatteryHeightMm)
      failures.push(`batteryHeight ${params.batteryHeight} < ${f.minBatteryHeightMm}`);
    if (params.batteryHeight > f.maxBatteryHeightMm)
      failures.push(`batteryHeight ${params.batteryHeight} > ${f.maxBatteryHeightMm}`);
  }
  if (params.espLongEdge != null && params.espLongEdge > f.maxEspLongEdgeMm)
    failures.push(`espLongEdge ${params.espLongEdge} > ${f.maxEspLongEdgeMm}`);
  if (params.cameraDistance > f.maxCameraDistance)
    failures.push(`cameraDistance ${params.cameraDistance} > ${f.maxCameraDistance}`);
  return { ok: failures.length === 0, failures };
}

/** Lerp two positions (for animated phase/explode). */
export function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}
