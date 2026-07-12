/**
 * Single source of truth for sat-clock pin locals (mm).
 * Derived from RealPartSpec so harness tubes land on real pad positions.
 * Harness routes, recipe anchors, and mesh PinStubs MUST all read from here.
 */
import { REAL_PARTS, type RealPin, type CatalogPartId } from "./real-parts";
import type { SceneNode3D } from "./types";

export type PinLocal = {
  name: string;
  local: [number, number, number];
  /** Insulation ring color on mesh stub */
  netColor?: string;
};

function fromReal(pins: RealPin[]): PinLocal[] {
  return pins.map((p) => ({
    name: p.name,
    local: [...p.local] as [number, number, number],
    netColor: p.netColor,
  }));
}

/** Mirror solar-l root-edge pins for solar-r (root on −X toward cage). */
function mirrorSolarPins(pins: RealPin[]): PinLocal[] {
  return pins.map((p) => ({
    name: p.name,
    local: [-p.local[0], p.local[1], p.local[2]] as [number, number, number],
    netColor: p.netColor,
  }));
}

/** nodeId → pin pads in part-local mm (before node.rotation). */
export const SAT_PIN_LOCALS: Record<string, PinLocal[]> = {
  brain: fromReal(REAL_PARTS.esp32_c3.pins),
  face: fromReal(REAL_PARTS.oled_096.pins),
  charger: fromReal(REAL_PARTS.tp4056.pins),
  // Y-up cell; scene rotates Z=π/2. Terminals at cell ends (match mesh lead nubs).
  battery: fromReal(REAL_PARTS.cell_16340.pins),
  sensor: fromReal(REAL_PARTS.sht30.pins),
  touch: fromReal(REAL_PARTS.ttp223.pins),
  "solar-l": fromReal(REAL_PARTS.solar_cell.pins),
  "solar-r": mirrorSolarPins(REAL_PARTS.solar_cell.pins),
};

/** Recipe-shaped anchors (name + local only). */
export function pinAnchorsForNode(
  nodeId: string
): { name: string; local: [number, number, number] }[] {
  return (SAT_PIN_LOCALS[nodeId] || []).map((p) => ({
    name: p.name,
    local: [...p.local] as [number, number, number],
  }));
}

/** Mesh stubs: electrical pads only (skip structural body/root). */
export function meshPinStubsForNode(
  nodeId: string
): { name: string; local: [number, number, number]; netColor?: string }[] {
  return (SAT_PIN_LOCALS[nodeId] || []).filter(
    (p) => p.name !== "body" && p.name !== "root"
  );
}

/** Geom kinds that carry electrical pads. Structural kinds (mast, stand, cage,
 *  cell caps, bamboo, panels) never get a derived header — a mast has no pins. */
const ELECTRONIC_KINDS = new Set([
  "board",
  "pcb_module",
  "box",
  "oled_module",
  "oled_panel",
  "solar_module",
  "solar_panel",
  "touch_pad",
]);

/**
 * Pin pads for ANY node — the scalable superset of meshPinStubsForNode.
 * Lets every project (not just sat_clock) show where its wires land:
 *   1. sat roles (brain/face/charger/…) → exact SAT_PIN_LOCALS
 *      (keeps the demo + Conformance Ledger byte-identical)
 *   2. any catalog-matched part → its RealPartSpec pins (labeled + net-colored);
 *      applyCatalogHints already maps most electronics to one of the archetypes
 *   3. an unrecognized electronic board → a derived header row on its real bbox
 *   4. structural parts → none
 */
export function pinStubsForNode(node: SceneNode3D): PinLocal[] {
  if (SAT_PIN_LOCALS[node.id]) return meshPinStubsForNode(node.id);

  const cid = node.catalogId;
  const spec = cid && cid in REAL_PARTS ? REAL_PARTS[cid as CatalogPartId] : null;
  if (spec) {
    const named = spec.pins.filter((p) => p.name !== "body" && p.name !== "root");
    if (named.length) {
      return named.map((p) => ({
        name: p.name,
        local: [...p.local] as [number, number, number],
        netColor: p.netColor,
      }));
    }
  }

  return deriveGenericHeader(node);
}

/** Unknown board: a centered header row of ≤4 pads along the −Y edge, top face. */
function deriveGenericHeader(node: SceneNode3D): PinLocal[] {
  if (!ELECTRONIC_KINDS.has(node.geom.kind)) return [];
  const p = node.geom.params;
  const w = p.width || (p.radius ? p.radius * 2 : 20);
  const h = p.height || 15;
  const zTop = (p.depth || 3) / 2 + 0.2;
  const n = 4;
  const step = Math.min(2.54, (w * 0.7) / Math.max(1, n - 1));
  const y = -h / 2 + 1.6;
  return Array.from({ length: n }, (_, i) => ({
    name: String(i + 1),
    local: [(i - (n - 1) / 2) * step, y, zTop] as [number, number, number],
  }));
}

/** Exact local for a named pin, or null. */
export function pinLocal(
  nodeId: string,
  name: string
): [number, number, number] | null {
  const hit = (SAT_PIN_LOCALS[nodeId] || []).find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  return hit ? ([...hit.local] as [number, number, number]) : null;
}

/** Node ids that ship electrical pin stubs on the sat product. */
export const SAT_PIN_NODE_IDS = [
  "brain",
  "face",
  "charger",
  "battery",
  "sensor",
  "touch",
  "solar-l",
  "solar-r",
] as const;
