/**
 * Auto-spars from electrical connectivity — visual signal/power edges between parts.
 * Maps ElectricalModel nets → scene node pairs; never invents nets.
 */
import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel, NetClass } from "@/lib/electrical/types";
import type { ProductScene3D, SceneNode3D } from "./types";
import type { SpatialReasonNote } from "./spatial-reason";

export interface SceneEdge3D {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  netName: string;
  netClass: NetClass | string;
  /** Hex wire color */
  color: string;
  label?: string;
}

const NET_COLORS: Record<string, string> = {
  gnd: "#64748b",
  power: "#ef4444",
  i2c: "#3b82f6",
  spi: "#a855f7",
  uart: "#22c55e",
  analog: "#f59e0b",
  digital: "#06b6d4",
  other: "#94a3b8",
};

function colorForNet(netClass: string, wireColor?: string): string {
  if (wireColor && /^#?[0-9a-fA-F]{3,8}$/.test(wireColor.replace(/^#/, ""))) {
    return wireColor.startsWith("#") ? wireColor : `#${wireColor}`;
  }
  const map: Record<string, string> = {
    red: "#ef4444",
    black: "#1e293b",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    white: "#e2e8f0",
    brown: "#92400e",
    purple: "#a855f7",
    grey: "#94a3b8",
    gray: "#94a3b8",
  };
  if (wireColor) {
    const k = wireColor.toLowerCase().trim();
    if (map[k]) return map[k];
  }
  return NET_COLORS[netClass] || NET_COLORS.other;
}

/**
 * Map electrical ref / part id → scene node id.
 * Prefer exact ref match, then partId, then role heuristics.
 */
export function mapRefToNodeId(ref: string, nodes: SceneNode3D[], plan: BuildPlan): string | null {
  const r = ref.trim().toUpperCase();
  if (!r) return null;

  const byRef = nodes.find((n) => n.ref && n.ref.toUpperCase() === r);
  if (byRef) return byRef.id;

  const part = (plan.parts || []).find(
    (p) => p.ref?.toUpperCase() === r || p.id === ref
  );
  if (part) {
    const byPart = nodes.find((n) => n.partId === part.id);
    if (byPart) return byPart.id;
  }

  // Heuristic role from common designators
  if (/^U1$/i.test(r) || /ESP|MCU|C3/i.test(r)) {
    return nodes.find((n) => n.id === "brain" || n.layer === "brain")?.id || null;
  }
  if (/OLED|SSD|DISP|U2/i.test(r)) {
    return nodes.find((n) => n.id === "face" || n.layer === "face")?.id || null;
  }
  if (/TTP|TOUCH|BTN/i.test(r)) {
    return nodes.find((n) => n.id === "touch" || n.layer === "touch")?.id || null;
  }
  if (/SHT|BME|DHT|SENS/i.test(r)) {
    return nodes.find((n) => n.id === "sensor" || n.layer === "sensor")?.id || null;
  }
  if (/BT|BATT|16340|LIPO/i.test(r)) {
    return nodes.find((n) => n.id === "battery" || n.layer === "power")?.id || null;
  }
  if (/TP4056|CHARG/i.test(r)) {
    return nodes.find((n) => n.id === "charger")?.id ||
      nodes.find((n) => n.layer === "power" && n.id !== "battery")?.id ||
      null;
  }
  if (/SOLAR|PV/i.test(r)) {
    return nodes.find((n) => n.id === "solar-l" || n.layer === "wings")?.id || null;
  }

  return null;
}

/** Unique undirected edges from nets (pairwise members). Cap to avoid spaghetti. */
export function buildConnectionEdges(
  scene: ProductScene3D,
  plan: BuildPlan,
  electrical?: ElectricalModel | null,
  opts?: { maxEdges?: number }
): { edges: SceneEdge3D[]; notes: SpatialReasonNote[] } {
  const maxEdges = opts?.maxEdges ?? 24;
  const edges: SceneEdge3D[] = [];
  const notes: SpatialReasonNote[] = [];
  const seen = new Set<string>();

  const model = electrical || plan.electrical;
  if (!model?.nets?.length) {
    // Fallback: structural pairs for sat_clock-like scenes
    return structuralFallback(scene);
  }

  for (const net of model.nets) {
    const nodeIds: string[] = [];
    for (const m of net.members) {
      const id = mapRefToNodeId(m.ref, scene.nodes, plan);
      if (id && !nodeIds.includes(id)) nodeIds.push(id);
    }
    if (nodeIds.length < 2) continue;

    // Star from first member (MCU-ish) to reduce O(n²) clutter
    const hub = nodeIds[0];
    for (let i = 1; i < nodeIds.length; i++) {
      const a = hub;
      const b = nodeIds[i];
      const key = [a, b].sort().join("|") + "|" + net.name;
      if (seen.has(key)) continue;
      seen.add(key);
      const wireColor = (net as { wireColor?: string }).wireColor;
      edges.push({
        id: `edge-${edges.length}-${net.name}`,
        fromNodeId: a,
        toNodeId: b,
        netName: net.name,
        netClass: net.netClass,
        color: colorForNet(net.netClass, wireColor),
        label: net.name,
      });
      if (edges.length >= maxEdges) break;
    }
    if (edges.length >= maxEdges) break;
  }

  if (edges.length > 0) {
    notes.push({
      id: "conn_spars",
      rule: "Wiring graph",
      nodeIds: [...new Set(edges.flatMap((e) => [e.fromNodeId, e.toNodeId]))],
      detail: `${edges.length} signal/power spars from electrical nets (visual only).`,
    });
  }

  return { edges, notes };
}

function structuralFallback(scene: ProductScene3D): {
  edges: SceneEdge3D[];
  notes: SpatialReasonNote[];
} {
  const edges: SceneEdge3D[] = [];
  const pairs: [string, string, string, string][] = [
    ["brain", "face", "i2c", "#3b82f6"],
    ["brain", "sensor", "i2c", "#3b82f6"],
    ["brain", "touch", "digital", "#06b6d4"],
    ["brain", "charger", "power", "#ef4444"],
    ["battery", "charger", "power", "#ef4444"],
    ["solar-l", "charger", "power", "#f59e0b"],
    ["solar-r", "charger", "power", "#f59e0b"],
  ];
  const ids = new Set(scene.nodes.map((n) => n.id));
  for (const [a, b, cls, color] of pairs) {
    if (ids.has(a) && ids.has(b)) {
      edges.push({
        id: `struct-${a}-${b}`,
        fromNodeId: a,
        toNodeId: b,
        netName: `${a}-${b}`,
        netClass: cls,
        color,
      });
    }
  }
  return {
    edges,
    notes: edges.length
      ? [
          {
            id: "conn_spars",
            rule: "Wiring graph",
            nodeIds: [...new Set(edges.flatMap((e) => [e.fromNodeId, e.toNodeId]))],
            detail: `${edges.length} structural spars (no electrical model — heuristic pairs).`,
          },
        ]
      : [],
  };
}

/** Attach edges + notes onto scene (immutable). */
export function attachConnectionSpars(
  scene: ProductScene3D,
  plan: BuildPlan
): ProductScene3D {
  const { edges, notes } = buildConnectionEdges(scene, plan, plan.electrical);
  if (!edges.length) return scene;
  return {
    ...scene,
    edges,
    reasoningNotes: [...(scene.reasoningNotes || []), ...notes],
  };
}

/** Midpoint + length + orientation for rendering a tube between two mm positions. */
export function edgeTransform(
  from: [number, number, number],
  to: [number, number, number]
): {
  position: [number, number, number];
  rotation: [number, number, number];
  length: number;
} {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz) || 0.001;
  const position: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  // Cylinder default axis is Y; align to direction vector
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  // rotate X then Y: approx
  const rotation: [number, number, number] = [pitch - Math.PI / 2, yaw, 0];
  return { position, rotation, length };
}
