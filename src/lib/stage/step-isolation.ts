/**
 * Step isolation — default workbench framing for wiring steps.
 *
 * A beginner at the kitchen table needs TWO pins and ONE wire, not the
 * finished product orbiting. Given compiled focusPartIds (or a guided
 * micro-step wire), resolve which scene nodes + harness tubes belong on
 * stage. Pure data — no WebGL.
 */

import type { MicroStep } from "@/lib/types";
import type { SceneNode3D } from "@/lib/product-3d";
import type { PlannedWire } from "./wire-plan";

/** Plan part ids to isolate, priority: guided wire endpoints → compiled focus. */
export function isolatePartIds(
  focusPartIds: string[] | undefined,
  focusWire: MicroStep | null | undefined
): string[] | null {
  if (focusWire) {
    const ids = [focusWire.fromPartId, focusWire.toPartId].filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );
    if (ids.length) return [...new Set(ids)];
  }
  if (focusPartIds?.length) return [...new Set(focusPartIds)];
  return null;
}

/** Scene node ids matching isolate part ids (partId or node id). */
export function isolateNodeIds(
  nodes: SceneNode3D[],
  partIds: string[]
): string[] {
  const want = new Set(partIds);
  const ids: string[] = [];
  for (const n of nodes) {
    if (want.has(n.id) || (n.partId && want.has(n.partId))) ids.push(n.id);
  }
  return ids;
}

/** Keep only nodes in the isolation set. Empty match → no filter (never blank the stage). */
export function filterNodesForIsolation<T extends { id: string }>(
  nodes: T[],
  nodeIds: string[]
): T[] {
  if (!nodeIds.length) return nodes;
  const set = new Set(nodeIds);
  const filtered = nodes.filter((n) => set.has(n.id));
  return filtered.length ? filtered : nodes;
}

/**
 * Keep wires that touch at least one isolated node. Prefer both ends present;
 * if that empties the list (hub outside isolation), fall back to either-end.
 */
export function filterWiresForIsolation(
  wires: PlannedWire[],
  nodeIds: string[]
): PlannedWire[] {
  if (!nodeIds.length) return wires;
  const set = new Set(nodeIds);
  const both = wires.filter(
    (w) => set.has(w.route.fromNodeId) && set.has(w.route.toNodeId)
  );
  if (both.length) return both;
  const either = wires.filter(
    (w) => set.has(w.route.fromNodeId) || set.has(w.route.toNodeId)
  );
  return either.length ? either : wires;
}
