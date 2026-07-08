import type { BuildPlan, BuildStep, Part } from "@/lib/types";
import { matchPart } from "@/lib/catalog";
import type {
  AssemblyMode,
  AssemblyStage,
  ModuleRole,
  ProductNode,
  ProductScene,
  ProductWire,
} from "./types";

const MECH_IDS = new Set([
  "bamboo-coaster",
  "brass-wire-1mm",
  "copper-tube-3mm",
  "jumper-wires",
  "breadboard",
]);

export function classifyRole(part: Part): ModuleRole {
  const id = part.catalogId || matchPart(part).module?.id || "";
  const t = `${part.name} ${part.specification} ${id}`.toLowerCase();
  if (MECH_IDS.has(id) || /bamboo|coaster|brass|copper tube|frame|enclosure|case|wire frame/.test(t))
    return "mech";
  if (/esp32|arduino|pico|microcontroller|mcu|nrf52/.test(t)) return "mcu";
  if (/oled|ssd1306|display|lcd|screen/.test(t)) return "display";
  if (/sht31|bme280|dht|sensor|temp|humid/.test(t)) return "sensor";
  if (/solar panel|solar-panel/.test(t)) return "solar";
  if (/tp4056|charger|bms|charging|solar charg|charge controller/.test(t)) return "power";
  if (
    /16340|18650|li-?ion|lipo|battery/.test(t) &&
    !/level|indicator|led bar/.test(t)
  )
    return "battery";
  if (/level|indicator/.test(t) && /battery|led/.test(t)) return "power";
  if (/touch|button|switch/.test(t)) return "input";
  return "other";
}

export function partGlyph(role: ModuleRole, part: Part): string {
  switch (role) {
    case "mcu":
      return "MCU";
    case "display":
      return "OLED";
    case "sensor":
      return "SENS";
    case "power":
      return "PWR";
    case "battery":
      return "BAT";
    case "input":
      return "BTN";
    case "solar":
      return "SOL";
    case "mech":
      if (/bamboo|wood|coaster/i.test(part.name)) return "BASE";
      if (/copper|tube/i.test(part.name)) return "TUBE";
      if (/brass/i.test(part.name)) return "BRASS";
      return "MECH";
    default:
      return "PART";
  }
}

function shortLabel(part: Part, role: ModuleRole): string {
  const n = part.name.replace(/\s+/g, " ").trim();
  if (n.length <= 18) return n;
  if (role === "mcu") return "Microcontroller";
  if (role === "display") return "Display";
  if (role === "sensor") return "Sensor";
  if (role === "battery") return "Battery";
  if (role === "solar") return "Solar panel";
  if (role === "power") {
    if (/tp4056/i.test(n)) return "TP4056";
    if (/solar/i.test(n)) return "Solar charger";
    if (/level|indicator/i.test(n)) return "Batt. level";
    return "Power";
  }
  if (role === "input") return "Touch switch";
  if (role === "mech") return n.split(" ")[0] || "Frame";
  return n.slice(0, 16);
}

const ROLE_SLOTS: Record<ModuleRole, { x: number; y: number; w: number; h: number }[]> = {
  mech: [
    { x: 40, y: 200, w: 400, h: 90 },
    { x: 80, y: 40, w: 50, h: 140 },
    { x: 360, y: 40, w: 50, h: 140 },
  ],
  mcu: [{ x: 180, y: 120, w: 100, h: 56 }],
  display: [{ x: 175, y: 55, w: 110, h: 50 }],
  sensor: [{ x: 300, y: 115, w: 90, h: 48 }],
  input: [{ x: 90, y: 125, w: 80, h: 44 }],
  battery: [{ x: 100, y: 220, w: 90, h: 48 }],
  power: [
    { x: 210, y: 220, w: 90, h: 48 },
    { x: 310, y: 220, w: 90, h: 48 },
  ],
  solar: [{ x: 150, y: 8, w: 160, h: 36 }],
  other: [
    { x: 50, y: 170, w: 80, h: 40 },
    { x: 350, y: 170, w: 80, h: 40 },
  ],
};

function placeNodes(parts: Part[]): ProductNode[] {
  const used: Record<ModuleRole, number> = {
    mcu: 0,
    display: 0,
    sensor: 0,
    power: 0,
    battery: 0,
    input: 0,
    solar: 0,
    mech: 0,
    other: 0,
  };

  const ordered = [...parts].sort((a, b) => {
    const ra = classifyRole(a);
    const rb = classifyRole(b);
    if (ra === "mech" && rb !== "mech") return -1;
    if (rb === "mech" && ra !== "mech") return 1;
    return 0;
  });

  const nodes: ProductNode[] = [];
  for (const part of ordered) {
    const role = classifyRole(part);
    const slots = ROLE_SLOTS[role];
    const idx = used[role]++;
    const slot = slots[Math.min(idx, slots.length - 1)];
    const dx = idx >= slots.length ? (idx - slots.length + 1) * 12 : 0;
    const dy = idx >= slots.length ? (idx - slots.length + 1) * 8 : 0;
    const ref = part.ref;
    const label = shortLabel(part, role);
    nodes.push({
      partId: part.id,
      ref,
      role,
      label,
      techLabel: ref ? `${ref} · ${label}` : label,
      glyph: partGlyph(role, part),
      x: slot.x + dx,
      y: slot.y + dy,
      w: role === "mech" && idx === 0 ? slot.w : Math.min(slot.w, 110),
      h: role === "mech" && idx === 0 ? slot.h : Math.min(slot.h, 56),
      appearsAtStep: 0,
    });
  }
  return nodes;
}

export function matchPartsInStep(step: BuildStep, parts: Part[]): Part[] {
  const text = `${step.title || ""} ${step.description || ""}`.toLowerCase();
  const title = (step.title || "").toLowerCase();

  // Whole-system steps
  if (
    /\ball electronic|wire all|everything|final assembl|assemble everything|all components\b/.test(
      text
    )
  ) {
    return parts.filter((p) => classifyRole(p) !== "mech" || /base|bamboo|coaster/i.test(p.name));
  }
  if (/\b(upload|firmware|code|flash|program)\b/.test(text)) {
    return parts.filter((p) => classifyRole(p) === "mcu");
  }
  if (/\bfinal test|calibrat\b/.test(text)) {
    return parts; // whole product
  }

  return parts.filter((p) => {
    const role = classifyRole(p);
    const name = p.name.toLowerCase();
    const words = name.split(/\s+/).filter((w) => w.length > 3);
    const id = (p.catalogId || "").toLowerCase();
    const pt = `${name} ${p.specification} ${id}`.toLowerCase();

    if (id && text.includes(id.replace(/-/g, " "))) return true;
    if (words.some((w) => text.includes(w))) return true;

    // Aliases
    if (/\boled|display\b/.test(text) && role === "display") return true;
    if (/\besp32|microcontroller|mcu\b/.test(text) && role === "mcu") return true;
    if (/\bsensor|sht|temp|humid\b/.test(text) && role === "sensor") return true;
    if (/\btouch|switch\b/.test(text) && role === "input") return true;
    if (/\bsolar\b/.test(text) && (role === "solar" || (role === "power" && /solar/i.test(pt))))
      return true;
    if (/\bbattery\b/.test(text) && !/level/.test(text) && role === "battery") return true;
    if (/\b(tp4056|charg)\b/.test(text) && role === "power") return true;
    if (/\bbrass\b/.test(text) && /brass/i.test(pt)) return true;
    if (/\bcopper|tube\b/.test(text) && /copper|tube/i.test(pt)) return true;
    if (/\bbamboo|coaster|base\b/.test(text) && /bamboo|coaster/i.test(pt)) return true;
    // "wire frame" / "brass frame" — structure metal only, not bamboo base
    if (/\bframe\b/.test(title) && role === "mech") {
      if (/bamboo|coaster|base/.test(pt)) return false;
      return /brass|copper|tube|wire/.test(pt);
    }
    if (/\bconnectors?\b/.test(text) && /brass|wire/i.test(pt)) return true;
    if (/\blevel|indicator\b/.test(text) && /level|indicator/i.test(pt)) return true;
    return false;
  });
}

export function stepMode(step: BuildStep): AssemblyMode {
  const title = (step.title || "").toLowerCase();
  const text = `${step.title || ""} ${step.description || ""}`.toLowerCase();

  // Software / final QA first only on clear signals
  if (/\b(upload|code|program|compile|flash|firmware|arduino\s*ide|platformio)\b/.test(text))
    return "verify";
  if (/\bfinal\s+test|calibrat|power.?on\b/.test(text)) return "verify";

  // Mechanical / structure (title-weighted so "Prepare the brass…" wins over body "check")
  if (
    /\b(prepare|bend|cut|drill|mount|assemble|install|strip|sand|frame)\b/.test(title) ||
    (/\b(prepare|bend|cut|drill|mount|assemble|install|frame)\b/.test(text) &&
      !/\b(connect|solder|wire up|wiring)\b/.test(title))
  )
    return "explode";

  if (
    /\b(connect|solder|pin|attach|wire\s+up|wiring|i2c|sda|scl)\b/.test(text) &&
    !/\b(brass|copper)\s+wire|wire\s+frame|frame\b/i.test(title)
  )
    return "wire";

  if (/\b(verify|test|check|measure|confirm)\b/.test(title)) return "verify";
  return "reveal";
}

function buildWires(plan: BuildPlan, nodes: ProductNode[]): ProductWire[] {
  const byName = (hint: string): string | null => {
    const h = hint.toLowerCase();
    let best: ProductNode | null = null;
    let score = 0;
    for (const n of nodes) {
      const part = plan.parts.find((p) => p.id === n.partId);
      if (!part) continue;
      const t = `${part.name} ${part.specification} ${n.label}`.toLowerCase();
      let s = 0;
      if (h.includes("esp") && t.includes("esp")) s += 10;
      if ((h.includes("oled") || h.includes("display")) && (t.includes("oled") || t.includes("display")))
        s += 10;
      if (h.includes("sht") && t.includes("sht")) s += 10;
      if (h.includes("touch") && t.includes("touch")) s += 10;
      if (h.includes("battery") && !h.includes("level") && n.role === "battery") s += 12;
      if (h.includes("tp4056") && t.includes("tp4056")) s += 12;
      if (h.includes("solar") && n.role === "solar") s += 10;
      if (h.includes("charg") && n.role === "power") s += 8;
      if (s > score) {
        score = s;
        best = n;
      }
    }
    return score >= 8 && best ? best.partId : null;
  };

  const wires: ProductWire[] = [];
  const seen = new Set<string>();
  for (const c of plan.wiringConnections || []) {
    const a = byName(c.from);
    const b = byName(c.to);
    if (!a || !b || a === b) continue;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    wires.push({
      id: key,
      fromPartId: a,
      toPartId: b,
      color: colorMap(c.wireColor || ""),
    });
  }
  return wires.slice(0, 24);
}

function colorMap(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("red")) return "#dc2626";
  if (n.includes("black")) return "#1e293b";
  if (n.includes("blue")) return "#2563eb";
  if (n.includes("yellow")) return "#ca8a04";
  if (n.includes("green")) return "#16a34a";
  if (n.includes("orange")) return "#ea580c";
  if (n.includes("white")) return "#94a3b8";
  return "#64748b";
}

function assignAppearsAt(nodes: ProductNode[], steps: BuildStep[], parts: Part[]): ProductNode[] {
  const first = new Map<string, number>();
  steps.forEach((step, i) => {
    for (const p of matchPartsInStep(step, parts)) {
      if (!first.has(p.id)) first.set(p.id, i + 1);
    }
  });
  return nodes.map((n) => ({
    ...n,
    appearsAtStep: first.get(n.partId) ?? (n.role === "mech" ? 1 : Math.max(1, steps.length)),
  }));
}

function buildStages(nodes: ProductNode[], steps: BuildStep[], parts: Part[]): AssemblyStage[] {
  const allIds = nodes.map((n) => n.partId);
  const modulesTotal = allIds.length;

  const stages: AssemblyStage[] = [
    {
      stepNumber: 0,
      visiblePartIds: allIds,
      placedPartIds: allIds,
      highlightPartIds: [],
      mode: "full",
      caption: "Final assembly — this is what you’re building.",
      modulesInPlace: modulesTotal,
      modulesTotal,
    },
  ];

  const placed = new Set<string>();

  steps.forEach((step, i) => {
    const matched = matchPartsInStep(step, parts);
    for (const p of matched) placed.add(p.id);
    // Also place by appearsAtStep
    for (const n of nodes) {
      if (n.appearsAtStep > 0 && n.appearsAtStep <= i + 1) placed.add(n.partId);
    }

    const mode = stepMode(step);
    let hi = matched.map((p) => p.id);
    if (mode === "verify") {
      // Full product placed; highlight MCU if software, else whole
      for (const id of allIds) placed.add(id);
      const mcu = nodes.find((n) => n.role === "mcu");
      if (/\b(upload|code|flash|firmware)\b/.test(`${step.title} ${step.description}`.toLowerCase()) && mcu) {
        hi = [mcu.partId];
      } else {
        hi = allIds.slice(0, 3);
      }
    }

    const labels = matched.map((p) => shortLabel(p, classifyRole(p)));
    const nPlaced = placed.size;
    const caption =
      mode === "wire"
        ? labels.length
          ? `Wiring now: ${labels.slice(0, 3).join(", ")}. Ghost parts = still to come.`
          : "Make the connections for this step. Solid = already installed."
        : mode === "explode"
          ? labels.length
            ? `Building: ${labels.slice(0, 3).join(", ")}.`
            : "Shape and assemble the structure."
          : mode === "verify"
            ? /\b(upload|code|flash)\b/.test(`${step.title}`.toLowerCase())
              ? "Firmware step — full product shown; focus on the microcontroller."
              : "Check the finished assembly against this diagram."
            : labels.length
              ? `Adding ${labels.slice(0, 3).join(", ")}.`
              : step.title || `Step ${i + 1}`;

    stages.push({
      stepNumber: i + 1,
      visiblePartIds: allIds, // always full silhouette
      placedPartIds: [...placed],
      highlightPartIds: hi,
      mode,
      caption,
      modulesInPlace: nPlaced,
      modulesTotal,
    });
  });

  return stages;
}

export function buildProductScene(plan: BuildPlan): ProductScene {
  const parts = (plan.parts || []).filter((p) => p.id);
  let nodes = placeNodes(parts);
  nodes = assignAppearsAt(nodes, plan.steps || [], parts);
  const wires = buildWires(plan, nodes);
  const stages = buildStages(nodes, plan.steps || [], parts);

  return {
    id: plan.id,
    title: plan.title,
    bounds: { w: 480, h: 320 },
    nodes,
    wires,
    stages,
    estimatedTime: plan.estimatedTime,
  };
}
