/**
 * Bridge a guided micro-step to its physical wire in the 3D, so "Show me
 * exactly where" can light the one wire. The harness and the compiler name
 * nets AND ESP-side pins differently, but they agree on the NODE PAIR a wire
 * connects — so match on that (the caller resolves the micro-step's part ids to
 * scene node ids via the scene's partId→id map). Pure; null when no wire routes
 * that pair (e.g. a GND star-leg the harness routes through the charger, or a
 * part not present in the 3D — the caller then just skips the glow).
 */

import type { WireRoute3D } from "./harness";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export function wireRouteForNodes(
  routes: WireRoute3D[],
  nodeA: string | undefined,
  nodeB: string | undefined
): WireRoute3D | null {
  if (!nodeA || !nodeB) return null;
  const want = pairKey(nodeA, nodeB);
  return routes.find((r) => pairKey(r.fromNodeId, r.toNodeId) === want) ?? null;
}
