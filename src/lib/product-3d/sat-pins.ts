/**
 * Single source of truth for sat-clock pin locals (mm).
 * Derived from RealPartSpec so harness tubes land on real pad positions.
 * Harness routes, recipe anchors, and mesh PinStubs MUST all read from here.
 */
import { REAL_PARTS, type RealPin } from "./real-parts";

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
