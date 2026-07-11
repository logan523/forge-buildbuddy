/**
 * Pin-to-pin harness routes — readable electrical story for the sat build.
 * Pure geometry: anchor resolve → multi-point path → metadata.
 * Viewer only consumes path/gauge/color (no second routing brain).
 */
import { Euler, Vector3 } from "three";
import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel } from "@/lib/electrical/types";
import type { ProductScene3D, SceneNode3D } from "./types";
import type { AssemblyRecipe, PartDef } from "./assembly-recipe";
import { mapRefToNodeId } from "./connection-spars";
import { pickHub } from "@/lib/electrical/hub";
import { netColorFor } from "@/lib/wire-colors";

export type WireInsulation = "pvc" | "enamel" | "silicone";

export interface WireRoute3D {
  id: string;
  netName: string;
  netClass: string;
  color: string;
  fromNodeId: string;
  toNodeId: string;
  fromAnchor: string;
  toAnchor: string;
  /** World mm polyline (multi-point; first/last = pin landings) */
  path: [number, number, number][];
  /** Radius mm */
  gauge: number;
  insulation: WireInsulation;
  /** Short label e.g. SDA, VCC */
  label: string;
  /** Approximate AWG for display */
  awg: number;
}

// Wire colors resolve through THE authority (src/lib/wire-colors.ts) —
// class color wins on classed nets; SDA/SCL stay distinguishable (eng V5).

function metaForClass(netClass: string): {
  gauge: number;
  insulation: WireInsulation;
  awg: number;
} {
  if (netClass === "power" || netClass === "gnd")
    return { gauge: 1.15, insulation: "pvc", awg: 24 };
  if (netClass === "i2c" || netClass === "digital" || netClass === "signal")
    return { gauge: 0.7, insulation: "pvc", awg: 28 };
  if (netClass === "analog") return { gauge: 0.85, insulation: "silicone", awg: 26 };
  return { gauge: 0.75, insulation: "pvc", awg: 26 };
}

function labelFromPin(pin: string, netName: string, role?: string): string {
  const p = pin.toUpperCase();
  const r = (role || "").toLowerCase();
  if (/sda|i2c_sda/.test(r) || /SDA/.test(p)) return "SDA";
  if (/scl|i2c_scl/.test(r) || /SCL/.test(p)) return "SCL";
  if (/GND|VSS|BAT-|OUT-|IN-/.test(p) || r === "gnd" || /GND/.test(netName.toUpperCase()))
    return "GND";
  if (/B\+|BAT\+/.test(p)) return "B+";
  if (/B-/.test(p)) return "B−";
  if (/OUT\+/.test(p)) return "OUT+";
  if (/IN\+/.test(p)) return "IN+";
  if (/3V3|VCC|VDD|VIN|VBAT|\+/.test(p) || r === "power") return "VCC";
  if (/SIG|TOUCH|GPIO/.test(p) || /digital|signal/.test(r)) return "SIG";
  return netName.split(/[_-]/)[0]?.slice(0, 6) || "NET";
}

/** Rotate local mm offset by node Euler XYZ (same convention as R3F meshes). */
export function rotateLocalOffset(
  local: [number, number, number],
  rotation: [number, number, number]
): [number, number, number] {
  const v = new Vector3(local[0], local[1], local[2]);
  v.applyEuler(new Euler(rotation[0], rotation[1], rotation[2], "XYZ"));
  return [v.x, v.y, v.z];
}

/**
 * World-mm position of a named pin anchor on a scene node.
 * Local offset is rotated by the node's orientation so tubes land on mesh pins.
 */
export function anchorWorldPosition(
  node: SceneNode3D,
  part: PartDef | undefined,
  anchorName: string
): [number, number, number] {
  const a = part?.anchors?.find(
    (x) => x.name.toLowerCase() === anchorName.toLowerCase()
  );
  const local: [number, number, number] = a?.local
    ? [a.local[0], a.local[1], a.local[2]]
    : [0, 0, 0];
  const rot = node.rotation as [number, number, number];
  const [lx, ly, lz] = rotateLocalOffset(local, rot);
  return [node.position[0] + lx, node.position[1] + ly, node.position[2] + lz];
}

/** @deprecated use anchorWorldPosition — kept for call-site clarity in buildHarnesses */
function worldAnchor(
  node: SceneNode3D,
  part: PartDef | undefined,
  anchorName: string
): [number, number, number] {
  return anchorWorldPosition(node, part, anchorName);
}

/**
 * Resolve pin hint (+ optional electrical role) to a named recipe anchor.
 * Exact / role-specific names win; never map I²C to GPIO just because pin is GPIO4.
 */
export function pickAnchor(
  part: PartDef | undefined,
  pinHint: string,
  netClass: string,
  role?: string
): string {
  const anchors = part?.anchors || [];
  if (!anchors.length) return "body";
  const names = anchors.map((a) => a.name);
  const find = (re: RegExp) => names.find((n) => re.test(n));
  const exact = (want: string) =>
    names.find((n) => n.toLowerCase() === want.toLowerCase());

  const p = (pinHint || "").toUpperCase();
  const r = (role || "").toLowerCase();

  // 1) Exact anchor name
  if (pinHint) {
    const hit = exact(pinHint);
    if (hit) return hit;
  }

  // 2) Role from electrical model (highest semantic signal)
  if (/i2c_sda|sda/.test(r)) return exact("SDA") || find(/^sda$/i) || names[0]!;
  if (/i2c_scl|scl/.test(r)) return exact("SCL") || find(/^scl$/i) || names[0]!;
  if (r === "gnd") return exact("GND") || find(/^gnd$|^-$|^b-$|^out-$|^in-$/i) || names[0]!;
  if (r === "power") {
    if (/OUT\+/.test(p)) return exact("OUT+") || find(/out\+/i) || names[0]!;
    if (/IN\+/.test(p)) return exact("IN+") || find(/in\+/i) || names[0]!;
    if (/B\+|BAT\+/.test(p)) return exact("B+") || exact("+") || find(/b\+|^\+$/i) || names[0]!;
    if (/3V3|VCC|VIN/.test(p))
      return exact("3V3") || exact("VCC") || find(/3v3|vcc/i) || names[0]!;
  }

  // 3) Pin-name heuristics — SDA/SCL BEFORE GPIO (GPIO4 is SDA on ESP32-C3)
  if (/SDA/.test(p) || /I2C_SDA/.test(p)) return exact("SDA") || find(/sda/i) || names[0]!;
  if (/SCL/.test(p) || /I2C_SCL/.test(p)) return exact("SCL") || find(/scl/i) || names[0]!;
  if (/^GND$|VSS|AGND|BAT-|OUT-|IN-/.test(p) || p === "-")
    return exact("GND") || exact("-") || exact("B-") || exact("OUT-") || find(/gnd|^-$|b-|out-|in-/i) || names[0]!;
  if (/OUT\+/.test(p)) return exact("OUT+") || find(/out\+/i) || names[0]!;
  if (/IN\+/.test(p)) return exact("IN+") || find(/in\+/i) || names[0]!;
  if (/B\+|BAT\+/.test(p)) return exact("B+") || exact("+") || find(/b\+|^\+$/i) || names[0]!;
  if (/^3V3$|VCC|VDD|VIN|VBAT/.test(p))
    return exact("3V3") || exact("VCC") || find(/3v3|vcc/i) || names[0]!;
  if (p === "+") return exact("+") || exact("B+") || exact("IN+") || find(/^\+|b\+|in\+/i) || names[0]!;
  if (/SIG|TOUCH/.test(p) || (/GPIO/.test(p) && (netClass === "digital" || netClass === "signal")))
    return exact("SIG") || exact("GPIO") || find(/sig|gpio/i) || names[0]!;
  // GPIO4/5 with i2c net class → data lines, not the GPIO pad
  if (/GPIO/.test(p) && netClass === "i2c") {
    if (/4|SDA/.test(p) || /sda/.test(r)) return exact("SDA") || find(/sda/i) || names[0]!;
    if (/5|SCL/.test(p) || /scl/.test(r)) return exact("SCL") || find(/scl/i) || names[0]!;
    return find(/sda|scl/i) || names[0]!;
  }
  if (/GPIO/.test(p)) return exact("GPIO") || find(/gpio|sig/i) || names[0]!;

  // 4) Net-class fallbacks
  if (netClass === "i2c") return find(/sda|scl/i) || names[0]!;
  if (netClass === "power") return find(/3v3|vcc|out\+|b\+|^\+/i) || names[0]!;
  if (netClass === "gnd") return find(/gnd|^-$|b-|out-/i) || names[0]!;
  if (netClass === "digital" || netClass === "signal") return find(/sig|gpio/i) || names[0]!;
  if (netClass === "analog") return find(/in\+|^\+|b\+/i) || names[0]!;
  return names[0]!;
}

function sub(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function len(a: [number, number, number]): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: [number, number, number]): [number, number, number] {
  const L = len(a) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}

/**
 * Push a world point outward if it sits deep inside the brass cage volume
 * so jumpers drape along structure (craft build) rather than through solids.
 */
export function hugCageEdge(
  p: [number, number, number],
  cageCenter: [number, number, number],
  cageHalf: number,
  margin = 4
): [number, number, number] {
  const local = sub(p, cageCenter);
  const limit = Math.max(6, cageHalf - margin);
  const ax = Math.abs(local[0]);
  const ay = Math.abs(local[1]);
  const az = Math.abs(local[2]);
  // Already near/outside shell — keep
  if (ax >= limit || ay >= limit || az >= limit) return p;
  // Push toward nearest face of the cage
  const faces: [number, [number, number, number]][] = [
    [limit - ax, [Math.sign(local[0] || 1) * (limit - ax), 0, 0]],
    [limit - ay, [0, Math.sign(local[1] || 1) * (limit - ay), 0]],
    [limit - az, [0, 0, Math.sign(local[2] || 1) * (limit - az)]],
  ];
  faces.sort((a, b) => a[0] - b[0]);
  const push = faces[0]![1];
  return add(p, push);
}

/**
 * High-fidelity jumper path: pin exit stubs + cubic Bezier sample so wires
 * are multi-point curves that hug the cage (not chords through solids).
 */
export function routePath(
  from: [number, number, number],
  to: [number, number, number],
  droop = 8,
  sideBias: [number, number, number] = [0, 0, 0],
  opts?: {
    /** World direction leaving the from pin (unit-ish) */
    exitFrom?: [number, number, number];
    exitTo?: [number, number, number];
    /** Samples along the curve (excluding endpoints) */
    samples?: number;
    stubMm?: number;
    /** Cage center + half-edge (mm) to drape wires along structure */
    cageCenter?: [number, number, number];
    cageHalf?: number;
  }
): [number, number, number][] {
  const samples = opts?.samples ?? 7;
  const stubMm = opts?.stubMm ?? 3.2;
  const chord = sub(to, from);
  const chordN = norm(chord);
  const exitF = opts?.exitFrom ? norm(opts.exitFrom) : chordN;
  const exitT = opts?.exitTo ? norm(opts.exitTo) : scale(chordN, -1);

  // Leave the pin pad along exit, then cubic to the other pin
  const p0 = from;
  const p1 = add(from, scale(exitF, stubMm));
  const p2 = add(to, scale(exitT, stubMm));
  const p3 = to;

  // Control points pull mid-run down/out so the curve clears boards
  let c1 = add(add(p1, scale(chordN, len(chord) * 0.22)), [
    sideBias[0],
    -droop * 0.55 + sideBias[1],
    sideBias[2],
  ]);
  let c2 = add(add(p2, scale(chordN, -len(chord) * 0.22)), [
    sideBias[0] * 0.6,
    -droop + sideBias[1],
    sideBias[2] * 0.6,
  ]);
  if (opts?.cageCenter && opts.cageHalf) {
    c1 = hugCageEdge(c1, opts.cageCenter, opts.cageHalf, 5);
    c2 = hugCageEdge(c2, opts.cageCenter, opts.cageHalf, 5);
  }

  // Cubic Bezier from p1→p2 with controls c1,c2; bookend with pin stubs
  const curve: [number, number, number][] = [p0, p1];
  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1);
    const u = 1 - t;
    let b: [number, number, number] = [
      u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
      u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      u * u * u * p1[2] + 3 * u * u * t * c1[2] + 3 * u * t * t * c2[2] + t * t * t * p2[2],
    ];
    // slight outward push so parallel runs separate
    b = add(b, scale(sideBias, 0.15 * Math.sin(Math.PI * t)));
    if (opts?.cageCenter && opts.cageHalf) {
      b = hugCageEdge(b, opts.cageCenter, opts.cageHalf, 6);
    }
    curve.push(b);
  }
  curve.push(p2, p3);
  return curve;
}

/** Path polyline length (mm). */
export function pathLength(path: [number, number, number][]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return L;
}

/** Chord length between path endpoints. */
export function chordLength(path: [number, number, number][]): number {
  if (path.length < 2) return 0;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function wireDisplayLabel(w: WireRoute3D): string {
  return `${w.fromNodeId} · ${w.fromAnchor} → ${w.toNodeId} · ${w.toAnchor} · ${w.label} (${w.netClass})`;
}

/** Preferred exit direction for a pin: outward along local +Z of the board, rotated. */
function pinExitDir(
  node: SceneNode3D,
  part: PartDef | undefined,
  anchorName: string
): [number, number, number] {
  // Boards: pins stick out local +Z; battery ends along local +Y; solar pads +Z-ish
  let local: [number, number, number] = [0, 0, 1];
  if (node.id === "battery" || node.geom.kind === "cell_16340") {
    const a = part?.anchors?.find((x) => x.name === anchorName);
    if (a && a.local[1] !== 0) local = [0, Math.sign(a.local[1]) || 1, 0];
    else if (a && a.local[0] !== 0) local = [Math.sign(a.local[0]) || 1, 0, 0];
    else local = [1, 0, 0];
  }
  return rotateLocalOffset(local, node.rotation as [number, number, number]);
}

type PairDef = {
  from: string;
  to: string;
  netName: string;
  netClass: string;
  color: string;
  fromPin?: string;
  toPin?: string;
  fromRole?: string;
  toRole?: string;
  /** Prefer teaching pair over electrical star when true */
  teaching?: boolean;
};

/**
 * Build pin-to-pin harnesses from electrical model (2-member nets only) +
 * sat teaching defaults. Multi-member star nets are skipped — they produce
 * wrong topology (brain GND to solar) and clunky spaghetti.
 */
export function buildHarnesses(
  scene: ProductScene3D,
  plan: BuildPlan,
  recipe: AssemblyRecipe,
  opts?: {
    activeNetHints?: string[];
    presentNodeIds?: string[];
    maxWires?: number;
  }
): WireRoute3D[] {
  const maxWires = opts?.maxWires ?? 40;
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const partByNode = new Map(recipe.parts.map((p) => [p.nodeId, p]));
  const wires: WireRoute3D[] = [];
  const seen = new Set<string>();

  const present = opts?.presentNodeIds ? new Set(opts.presentNodeIds) : null;
  const hints = opts?.activeNetHints?.map((h) => h.toLowerCase()) || null;

  const pairs: PairDef[] = [];

  const model: ElectricalModel | null | undefined = plan.electrical;
  // Every scene node the netlist references — used to keep the netlist as the
  // authority on wiring and fall the teaching defaults back only to nodes it
  // can't see (e.g. solar-r, which the model folds into solar-l).
  const electricalNodes = new Set<string>();
  if (model?.nets?.length) {
    for (const net of model.nets) {
      const members = net.members || [];
      type NodePin = { nodeId: string; pin: string; role?: string };
      const nodePins: NodePin[] = [];
      for (const m of members) {
        const id = mapRefToNodeId(m.ref, scene.nodes, plan);
        if (!id) continue;
        electricalNodes.add(id);
        const pin = (m as { pin?: string }).pin || m.ref;
        const role = (m as { role?: string }).role;
        // Keep first pin per node (electrical may list BATT and OUT on same ref)
        if (!nodePins.some((u) => u.nodeId === id)) {
          nodePins.push({ nodeId: id, pin, role });
        }
      }
      if (nodePins.length < 2) continue;
      const color = netColorFor(net.netClass, (net as { wireColor?: string }).wireColor, net.name);
      const leg = (from: NodePin, to: NodePin) =>
        pairs.push({
          from: from.nodeId,
          to: to.nodeId,
          netName: net.name,
          netClass: net.netClass,
          color,
          fromPin: from.pin,
          toPin: to.pin,
          fromRole: from.role,
          toRole: to.role,
        });
      if (nodePins.length === 2) {
        leg(nodePins[0]!, nodePins[1]!);
      } else {
        // A multi-member net is a hyperedge. Fan it hub→spoke, picking the SAME
        // hub the instruction compiler does (shared pickHub), so the rendered
        // tubes equal the compiled step edges and "Show me" stays aligned.
        const hubNodeId = mapRefToNodeId(pickHub(members).ref, scene.nodes, plan);
        const hub = nodePins.find((np) => np.nodeId === hubNodeId) ?? nodePins[0]!;
        for (const np of nodePins) {
          if (np.nodeId !== hub.nodeId) leg(hub, np);
        }
      }
    }
  }

  // Teaching defaults — full power + I²C + solar story with correct pin names
  const defaults: [
    string,
    string,
    string,
    string,
    string,
    string,
    string?,
    string?,
  ][] = [
    ["brain", "face", "I2C_SDA", "i2c", "SDA", "SDA", "i2c_sda", "i2c_sda"],
    ["brain", "face", "I2C_SCL", "i2c", "SCL", "SCL", "i2c_scl", "i2c_scl"],
    ["brain", "face", "OLED_VCC", "power", "3V3", "VCC", "power", "power"],
    ["brain", "face", "OLED_GND", "gnd", "GND", "GND", "gnd", "gnd"],
    ["battery", "charger", "B+", "power", "+", "B+", "power", "power"],
    ["battery", "charger", "B-", "gnd", "-", "B-", "gnd", "gnd"],
    ["charger", "brain", "SYS_3V3", "power", "OUT+", "3V3", "power", "power"],
    ["charger", "brain", "SYS_GND", "gnd", "OUT-", "GND", "gnd", "gnd"],
    ["brain", "sensor", "SENS_SDA", "i2c", "SDA", "SDA", "i2c_sda", "i2c_sda"],
    ["brain", "sensor", "SENS_VCC", "power", "3V3", "VCC", "power", "power"],
    ["brain", "sensor", "SENS_GND", "gnd", "GND", "GND", "gnd", "gnd"],
    ["brain", "touch", "TOUCH_SIG", "digital", "GPIO", "SIG", "digital_io", "digital_out"],
    ["brain", "touch", "TOUCH_VCC", "power", "3V3", "VCC", "power", "power"],
    ["brain", "touch", "TOUCH_GND", "gnd", "GND", "GND", "gnd", "gnd"],
    ["solar-l", "charger", "PV_L", "analog", "+", "IN+", "power", "power"],
    ["solar-r", "charger", "PV_R", "analog", "+", "IN+", "power", "power"],
    ["solar-l", "charger", "PV_L_GND", "gnd", "-", "IN-", "gnd", "gnd"],
    ["solar-r", "charger", "PV_R_GND", "gnd", "-", "IN-", "gnd", "gnd"],
  ];
  const electricalPresent = !!model?.nets?.length;
  for (const [a, b, name, cls, pa, pb, ra, rb] of defaults) {
    if (!byId.has(a) || !byId.has(b)) continue;
    // With a netlist present, IT owns the wiring — the generated stars above
    // already cover every net-referenced node. Keep a teaching default only for
    // a node the netlist can't see (solar-r). Absent a netlist, the full
    // teaching table is the fallback (non-sat templates, tests with no model).
    if (electricalPresent && electricalNodes.has(a) && electricalNodes.has(b)) continue;
    // Skip if we already have same ends + class (electrical 2-member already covered)
    const already = pairs.some(
      (p) =>
        p.netClass === cls &&
        ((p.from === a && p.to === b) || (p.from === b && p.to === a)) &&
        // allow parallel SDA+SCL (same class, different pins)
        (cls !== "i2c" ||
          (p.fromPin || "").toUpperCase().includes((pa || "").slice(0, 3)) ||
          (p.toPin || "").toUpperCase().includes((pa || "").slice(0, 3)) ||
          p.netName === name)
    );
    // Prefer teaching pair: replace electrical if same net name, else add if unique key
    const nameKey = [a, b, name].sort().join("|");
    if (pairs.some((p) => [p.from, p.to, p.netName].sort().join("|") === nameKey)) continue;
    // For i2c SDA/SCL both needed — don't skip second on class match alone
    if (cls !== "i2c" && already && !name.startsWith("PV_")) {
      // still add if anchors would differ (e.g. B+ vs SYS_3V3 both power battery/charger vs charger/brain)
      const sameEnds = pairs.some(
        (p) =>
          ((p.from === a && p.to === b) || (p.from === b && p.to === a)) &&
          p.netClass === cls &&
          (p.fromPin === pa || p.toPin === pa)
      );
      if (sameEnds) continue;
    }
    pairs.push({
      from: a,
      to: b,
      netName: name,
      netClass: cls,
      color: netColorFor(cls, undefined, name),
      fromPin: pa,
      toPin: pb,
      fromRole: ra,
      toRole: rb,
      teaching: true,
    });
  }

  const frame = byId.get("frame");
  const cageHalf = frame?.geom.params.size
    ? frame.geom.params.size / 2
    : 34;
  const cageCenter: [number, number, number] | undefined = frame
    ? [frame.position[0], frame.position[1], frame.position[2]]
    : undefined;

  // Deterministic lane routing (Cage-Rail Raceways): instead of a random per-wire
  // side jitter that sends jumpers on drunk paths through the middle, each net
  // class gets its OWN raceway direction and its wires fan into ordered parallel
  // lanes — so power / ground / I²C read as grouped, color-sorted ribbons.
  const CLASS_LANE: Record<string, [number, number, number]> = {
    power: [1, 0.35, 0.15], // reds ride the right rail, lifted
    gnd: [-1, -0.25, 0.15], // grounds hug the left rail, low
    i2c: [0.15, 0.7, 0.9], // data climbs up-and-back
    signal: [0.15, 0.7, 0.9],
    digital: [0.15, 0.7, 0.9],
    analog: [0.85, 0.1, -0.85], // solar/analog to the far corner
  };
  const DEFAULT_LANE: [number, number, number] = [0.3, 0.45, 0.35];
  const laneCount: Record<string, number> = {};
  const LANE_PITCH = 2.0;
  for (const p of pairs) {
    if (present && (!present.has(p.from) || !present.has(p.to))) continue;
    if (hints && hints.length > 0) {
      const blob = `${p.netName} ${p.netClass} ${p.fromPin} ${p.toPin}`.toLowerCase();
      const ok = hints.some(
        (h) =>
          blob.includes(h) ||
          p.netName.toLowerCase().includes(h) ||
          h === "*" ||
          p.netClass.toLowerCase().includes(h)
      );
      if (!ok) continue;
    }

    const na = byId.get(p.from);
    const nb = byId.get(p.to);
    if (!na || !nb) continue;
    const partA = partByNode.get(p.from);
    const partB = partByNode.get(p.to);
    const fromA = pickAnchor(partA, p.fromPin || "", p.netClass, p.fromRole);
    const toA = pickAnchor(partB, p.toPin || "", p.netClass, p.toRole);

    // Dedupe by pin landings (physical wire once — drop electrical/teaching twin)
    const landKey = [p.from, fromA, p.to, toA].sort().join("|");
    if (seen.has(landKey)) continue;
    seen.add(landKey);

    const wa = worldAnchor(na, partA, fromA);
    const wb = worldAnchor(nb, partB, toA);
    const meta = metaForClass(p.netClass);
    const droop = p.netClass === "power" || p.netClass === "gnd" ? 4.5 : 8.5;
    // This wire's raceway: its class direction, offset into an ordered lane so
    // co-routed wires run parallel instead of crossing. Deterministic — same
    // plan always routes the same way.
    const laneDir = CLASS_LANE[p.netClass] ?? DEFAULT_LANE;
    const lane = laneCount[p.netClass] = (laneCount[p.netClass] ?? 0) + 1;
    const laneOffset = ((lane - 1) % 4) * LANE_PITCH - 1.5 * LANE_PITCH; // fan lanes ±
    const side: [number, number, number] = [
      laneDir[0] * 3.0 + laneOffset * 0.55,
      laneDir[1] * 2.4,
      laneDir[2] * 3.0 + laneOffset * 0.35,
    ];
    const exitFrom = pinExitDir(na, partA, fromA);
    const exitTo = pinExitDir(nb, partB, toA);
    const path = routePath(wa, wb, droop, side, {
      exitFrom,
      exitTo,
      samples: 7,
      stubMm: p.netClass === "power" || p.netClass === "gnd" ? 2.6 : 3.4,
      cageCenter,
      cageHalf,
    });

    wires.push({
      id: `wire-${wires.length}-${p.netName}`,
      netName: p.netName,
      netClass: p.netClass,
      color: p.color,
      fromNodeId: p.from,
      toNodeId: p.to,
      fromAnchor: fromA,
      toAnchor: toA,
      path,
      gauge: meta.gauge,
      insulation: meta.insulation,
      label: labelFromPin(p.fromPin || p.toPin || "", p.netName, p.fromRole || p.toRole),
      awg: meta.awg,
    });
    if (wires.length >= maxWires) break;
  }

  return wires;
}

export function harnessToEdgePoints(
  wire: WireRoute3D,
  rootScale: number
): [number, number, number][] {
  return wire.path.map(
    ([x, y, z]) =>
      [x * rootScale, y * rootScale, z * rootScale] as [number, number, number]
  );
}

export function wiresForPart(wires: WireRoute3D[], nodeId: string): WireRoute3D[] {
  return wires.filter((w) => w.fromNodeId === nodeId || w.toNodeId === nodeId);
}

/** Legend rows for UI — re-exported from the single color authority. */
export { wireLegend } from "@/lib/wire-colors";
