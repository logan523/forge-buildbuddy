/**
 * Pin-level focus for the "Show me exactly where" detail view.
 *
 * Given a scene node + a silkscreen pin name, compute the pin's world position
 * (node transform ∘ pin local) and a camera framed tight on it. Pure + three-
 * math only (no DOM), so it's golden-testable — the visual pulse is built on
 * top in the viewer, but the geometry here is verifiable without a browser.
 *
 * Pin-name reality: compiled connections say "GPIO4"/"GPIO5", but the ESP model
 * has a single "GPIO" pad; commodity modules also vary VCC/3V3. So resolution is
 * exact → prefix → null, and callers fall back to node-level isolate on null.
 */

import { Vector3, Euler } from "three";
import type { SceneNode3D, LayerViewState } from "./types";
import { computeNodeWorldPosition } from "./types";
import { SAT_PIN_LOCALS } from "./sat-pins";
import type { CadFrame } from "./cad-frame";

/** Exact (case-insensitive) → prefix ("GPIO4"→"GPIO") pin local, or null. */
export function resolvePinLocal(
  nodeId: string,
  pinName: string
): [number, number, number] | null {
  const pins = SAT_PIN_LOCALS[nodeId];
  if (!pins) return null;
  const want = pinName.toLowerCase().trim();
  const exact = pins.find((p) => p.name.toLowerCase() === want);
  if (exact) return [...exact.local];
  // prefix either way: pad "GPIO" matches "GPIO4"; pad "SDA" matches "SDA1".
  const pref = pins.find(
    (p) => want.startsWith(p.name.toLowerCase()) || p.name.toLowerCase().startsWith(want)
  );
  return pref ? [...pref.local] : null;
}

/** Pin position in SCENE mm (node world position + pin local rotated by node rotation). */
export function pinWorldPositionMm(
  node: SceneNode3D,
  pinName: string,
  view: LayerViewState
): [number, number, number] | null {
  const local = resolvePinLocal(node.id, pinName);
  if (!local) return null;
  const [nx, ny, nz] = computeNodeWorldPosition(node, view);
  const r = node.rotation || [0, 0, 0];
  const rotated = new Vector3(local[0], local[1], local[2]).applyEuler(
    new Euler(r[0], r[1], r[2])
  );
  return [nx + rotated.x, ny + rotated.y, nz + rotated.z];
}

// Same CAD diagonal (right, up, front) the whole-scene framing uses, so the
// pin view matches the overall camera language.
const DIR: [number, number, number] = [0.66, 1.12, 0.78];
const DIR_LEN = Math.hypot(...DIR);

/**
 * Camera framed tight on one pin: target = the pin, camera a fixed short
 * distance along the CAD diagonal. distWorld controls how much surrounding
 * board shows (0.6 ≈ the pin plus its neighbours, for "find it in context").
 * Returns null when the pin can't be resolved (caller falls back to node isolate).
 */
export function frameForPin(
  node: SceneNode3D,
  pinName: string,
  view: LayerViewState,
  rootScale: number,
  distWorld = 0.6
): CadFrame | null {
  const posMm = pinWorldPositionMm(node, pinName, view);
  if (!posMm) return null;
  const target: [number, number, number] = [
    posMm[0] * rootScale,
    posMm[1] * rootScale,
    posMm[2] * rootScale,
  ];
  const position: [number, number, number] = [
    target[0] + (DIR[0] / DIR_LEN) * distWorld,
    target[1] + (DIR[1] / DIR_LEN) * distWorld,
    target[2] + (DIR[2] / DIR_LEN) * distWorld,
  ];
  return { position, target, fov: 34 };
}
