/**
 * Pin-level focus for the "Show me exactly where" detail view.
 *
 * Given a scene node + a silkscreen pin name, compute the pin's world position
 * (node transform ∘ pin local) and a camera framed tight on it. Pure + three-
 * math only (no DOM), so it's golden-testable — the visual pulse is built on
 * top in the viewer, but the geometry here is verifiable without a browser.
 *
 * SuperMini dual-header: GPIO4 and GPIO5 are distinct pads. Resolution is
 * exact → bare-number/GPIO alias ("4"↔"GPIO4") → longest prefix → null.
 * Callers fall back to node-level isolate on null.
 */

import { Vector3, Euler } from "three";
import type { SceneNode3D, LayerViewState } from "./types";
import { computeNodeWorldPosition } from "./types";
import { SAT_PIN_LOCALS } from "./sat-pins";
import type { CadFrame } from "./cad-frame";

/** Candidate silkscreen forms for one pin name (GPIO4, 4, IO4, …). */
function pinNameCandidates(pinName: string): string[] {
  const want = pinName.toLowerCase().trim();
  if (!want) return [];
  const out = new Set<string>([want]);
  const gpio = want.match(/^gpio\s*(\d+)$/i) || want.match(/^io\s*(\d+)$/i);
  if (gpio) {
    out.add(gpio[1]);
    out.add(`gpio${gpio[1]}`);
    out.add(`io${gpio[1]}`);
  }
  if (/^\d+$/.test(want)) {
    out.add(`gpio${want}`);
    out.add(`io${want}`);
  }
  return [...out];
}

/**
 * Exact (case-insensitive) → GPIO/bare alias → longest prefix match, or null.
 * Prefers non-alias pads when multiple names share a pad (GPIO4 over "4").
 */
export function resolvePinLocal(
  nodeId: string,
  pinName: string
): [number, number, number] | null {
  const pins = SAT_PIN_LOCALS[nodeId];
  if (!pins) return null;
  const candidates = pinNameCandidates(pinName);
  if (!candidates.length) return null;

  // Prefer exact on a primary (non-alias) pad, then any exact including alias.
  const exactPrimary = pins.find(
    (p) => !p.alias && candidates.includes(p.name.toLowerCase())
  );
  if (exactPrimary) return [...exactPrimary.local];
  const exactAny = pins.find((p) => candidates.includes(p.name.toLowerCase()));
  if (exactAny) return [...exactAny.local];

  // Longest prefix either way — "GPIO4" should hit "GPIO4" before short "GPIO"
  // if a generic board only has a "GPIO" pad.
  const want = pinName.toLowerCase().trim();
  const pref = [...pins]
    .filter(
      (p) =>
        want.startsWith(p.name.toLowerCase()) ||
        p.name.toLowerCase().startsWith(want)
    )
    .sort((a, b) => b.name.length - a.name.length)[0];
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
