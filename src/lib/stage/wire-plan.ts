/**
 * WirePlan — the Stage's exact-wiring truth packet.
 *
 * Wraps the netlist-only harness (harness.ts — teaching pairs deleted) with
 * the SPECIFICS a builder needs per wire: buyable color name, endpoint labels
 * (ref + pin), and the cut length derived from the actual routed curve. One
 * derivation feeds tubes, callout cards, pads, and the conformance audit —
 * text and 3D can never disagree because they are the same object.
 */
import type { BuildPlan } from "@/lib/types";
import type { AssemblyRecipe, ProductScene3D, WireRoute3D } from "@/lib/product-3d";
import { buildHarnesses, connectionPads, pathLength, type ConnectionPad } from "@/lib/product-3d";
import { wireColorName } from "@/lib/wire-colors";

export interface PlannedWire {
  route: WireRoute3D;
  /** Buyable color name from THE authority (e.g. "red", "blue"). */
  colorName: string;
  /** e.g. "ESP32-C3 SDA → OLED SDA" (node labels + pin anchors). */
  endpoints: string;
  /** Cut length along the routed curve, rounded mm. */
  lengthMm: number;
  /** One-line callout: "BLUE · I2C_SDA: ESP32-C3 SDA → OLED SDA · ~74mm". */
  callout: string;
}

export interface WirePlan {
  wires: PlannedWire[];
  pads: ConnectionPad[];
}

/** Build the full wiring truth packet for a scene (any template). */
export function buildWirePlan(
  scene: ProductScene3D,
  plan: BuildPlan,
  recipe: AssemblyRecipe
): WirePlan {
  const routes = buildHarnesses(scene, plan, recipe);
  const labelOf = new Map(scene.nodes.map((n) => [n.id, n.label]));
  const wires: PlannedWire[] = routes.map((route) => {
    // Name derives from the SAME hex the tube renders — never a second lookup.
    const colorName = wireColorName(route.color).toUpperCase();
    const from = `${labelOf.get(route.fromNodeId) ?? route.fromNodeId} ${route.fromAnchor}`;
    const to = `${labelOf.get(route.toNodeId) ?? route.toNodeId} ${route.toAnchor}`;
    const lengthMm = Math.round(pathLength(route.path));
    const endpoints = `${from} → ${to}`;
    return {
      route,
      colorName,
      endpoints,
      lengthMm,
      callout: `${colorName} · ${route.netName}: ${endpoints} · ~${lengthMm}mm`,
    };
  });
  return { wires, pads: connectionPads(routes) };
}
