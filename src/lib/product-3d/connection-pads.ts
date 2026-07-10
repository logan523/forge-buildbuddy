/**
 * Connection pads for wiring-map mode: one labeled, net-colored marker at every
 * pin a wire lands on. Derived from the harness routes themselves — a pad IS a
 * wire's path endpoint, so it can never float off the wire it belongs to. Pure;
 * dedupes by (nodeId, pin) so a shared pin (e.g. a GND star point) shows one pad.
 */

import type { WireRoute3D } from "./harness";

export interface ConnectionPad {
  nodeId: string;
  /** Silkscreen pin/anchor name — the label shown at the pad. */
  pin: string;
  /** Pad position in scene mm (the wire's endpoint). */
  posMm: [number, number, number];
  /** Net color (matches the wire). */
  color: string;
}

export function connectionPads(routes: WireRoute3D[]): ConnectionPad[] {
  const pads: ConnectionPad[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    if (!r.path || r.path.length < 2) continue;
    const ends: [string, string, [number, number, number]][] = [
      [r.fromNodeId, r.fromAnchor, r.path[0]!],
      [r.toNodeId, r.toAnchor, r.path[r.path.length - 1]!],
    ];
    for (const [nodeId, pin, pos] of ends) {
      const key = `${nodeId}:${pin}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pads.push({ nodeId, pin, posMm: [pos[0], pos[1], pos[2]], color: r.color });
    }
  }
  return pads;
}
