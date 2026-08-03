/**
 * Whole-circuit diagram — the ONE picture a beginner wants: every part and
 * every wire at once, color-coded, drawn from the same netlist truth as the
 * steps and the connection table (so colors/pins can never drift).
 *
 * Unlike the pad map (two abstract boards, no line between them), this DRAWS
 * the wires. It answers "which part connects to which, in what color, on which
 * pins" in a single glance, and can highlight the current step's wire so the
 * beginner always sees where they are in the whole circuit.
 *
 * Pure: string in, SVG string out. Derives content from plan.electrical; the
 * LAYOUT is a role-based left→right power flow (sources → chargers → switch →
 * MCU → peripherals) so the common weather-clock-shaped build reads cleanly.
 */

import type { BuildPlan } from "@/lib/types";
import type { ElectricalComponent } from "@/lib/electrical/types";
import { edgesFromModel } from "@/lib/steps/compile";
import { escText, escAttr } from "./svg-util";

export interface CircuitDiagramOptions {
  /** CompiledConnection ids to spotlight (the current wire). */
  highlightWireIds?: string[];
  /** CompiledConnection ids already soldered — drawn solid; pending wires dim. */
  doneWireIds?: string[];
  /** Plan part ids to keep bright (dims other boxes). */
  focusPartIds?: string[];
  /** Optional heading above the diagram. */
  title?: string;
}

interface Box {
  ref: string;
  partId: string;
  label: string;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  isCell: boolean;
}

const NEAR_BLACK = /^#?(1e293b|0f172a|000000|111827|000)$/i;

function truncate(s: string, n: number): string {
  const t = (s || "").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

/**
 * Role → column, left→right by how power flows. Deliberately simple; tuned so a
 * charger/MCU/I2C-peripheral build (the weather clock and its cousins) reads as
 * a left-to-right flow with mostly-local wire runs.
 *   0 sources · 1 chargers · 2 switch/meters · 3 MCU · 4 I2C peripherals
 */
function columnFor(comp: ElectricalComponent): number {
  const id = comp.catalogId || "";
  const isMcu = /esp32|pico|nano|rp2040|devkit/i.test(id) || comp.pins.some((p) => /^GPIO/i.test(p.name));
  if (isMcu) return 3;
  if (comp.isLithiumCell || /solar-panel/i.test(id)) return 0;
  if (/tp4056|solar-charger|charger|charge/i.test(id)) return 1;
  if (comp.pins.some((p) => p.role === "i2c_sda" || p.role === "i2c_scl")) return 4;
  if (/switch/i.test(id)) return 2;
  // battery-level indicator, misc 2-pin loads sit by the switch/rail.
  return 2;
}

const COL_X = [95, 315, 535, 755, 975];
const BOX_W = 168;
const BOX_H = 52;
const TOP = 92;
const ROW_GAP = 74;

export function svgCircuitDiagram(plan: BuildPlan, opts: CircuitDiagramOptions = {}): string {
  const model = plan.electrical;
  const W = 1070;
  const highlight = new Set(opts.highlightWireIds || []);
  const done = new Set(opts.doneWireIds || []);
  const focus = opts.focusPartIds && opts.focusPartIds.length ? new Set(opts.focusPartIds) : null;
  const hasHi = highlight.size > 0;
  const stateMode = hasHi || done.size > 0;

  if (!model || model.components.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 200" role="img" aria-label="Circuit diagram unavailable">
  <rect width="${W}" height="200" rx="12" fill="#0b0e13"/>
  <text x="${W / 2}" y="104" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#94a3b8">Circuit diagram will appear once parts are wired.</text>
</svg>`;
  }

  // --- Layout: assign each component to a column, center each column's stack ---
  const comps = model.components;
  const byCol: ElectricalComponent[][] = [[], [], [], [], []];
  for (const c of comps) byCol[columnFor(c)].push(c);

  const maxRows = Math.max(1, ...byCol.map((l) => l.length));
  const stackH = maxRowsHeight(maxRows);
  const H = TOP + stackH + 88; // room for legend

  const boxByRef = new Map<string, Box>();
  const boxes: Box[] = [];
  byCol.forEach((list, col) => {
    const blockH = maxRowsHeight(Math.max(1, list.length));
    const startY = TOP + (stackH - blockH) / 2;
    list.forEach((c, row) => {
      const b: Box = {
        ref: c.ref,
        partId: c.partId,
        label: shortPart(c.name),
        col,
        row,
        x: COL_X[col] - BOX_W / 2,
        y: startY + row * ROW_GAP,
        w: BOX_W,
        h: BOX_H,
        isCell: !!c.isLithiumCell,
      };
      boxes.push(b);
      boxByRef.set(c.ref, b);
    });
  });

  // --- Wires: fan parallel edges between the same pair of boxes ---
  const edges = edgesFromModel(plan, model);
  const pairKey = (a: string, b: string) => [a, b].sort().join("~");
  const groups = new Map<string, typeof edges>();
  for (const e of edges) {
    if (!boxByRef.has(e.fromRef) || !boxByRef.has(e.toRef)) continue;
    const k = pairKey(e.fromRef, e.toRef);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  const wireSvg: string[] = [];
  const labelSvg: string[] = [];
  for (const [, list] of groups) {
    const n = list.length;
    list.forEach((e, i) => {
      const from = boxByRef.get(e.fromRef)!;
      const to = boxByRef.get(e.toRef)!;
      // spread parallels across the facing edges
      const spread = (i - (n - 1) / 2) * 12;
      const [sx, sy, tx, ty, dir] = anchors(from, to, spread);
      const color = NEAR_BLACK.test((e.colorHex || "").replace(/\s/g, "")) ? "#64748b" : e.colorHex || "#64748b";
      const isCurrent = highlight.has(e.id);
      const isDone = done.has(e.id);
      const dimByFocus = !!focus && !(focus.has(from.partId) && focus.has(to.partId));
      // state mode (wiring step): current spotlit, done solid, pending faint.
      // overview: full, or focus-dimmed.
      const op = stateMode ? (isCurrent ? 1 : isDone ? 0.92 : 0.16) : dimByFocus ? 0.32 : 1;
      const wsw = isCurrent ? 4 : 2.4;
      const cx = Math.max(40, Math.abs(tx - sx) * 0.45);
      const c1x = dir === "h" ? sx + (tx > sx ? cx : -cx) : sx;
      const c2x = dir === "h" ? tx + (tx > sx ? -cx : cx) : tx;
      const c1y = dir === "h" ? sy : sy + (ty > sy ? cx : -cx);
      const c2y = dir === "h" ? ty : ty + (ty > sy ? -cx : cx);
      if (isCurrent) {
        wireSvg.push(
          `<path d="M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}" fill="none" stroke="${escAttr(color)}" stroke-width="9" stroke-linecap="round" opacity="0.28"/>`
        );
      }
      wireSvg.push(
        `<path d="M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}" fill="none" stroke="${escAttr(color)}" stroke-width="${wsw}" stroke-linecap="round" opacity="${op}"/>`
      );
      // endpoint pads
      wireSvg.push(
        `<circle cx="${sx}" cy="${sy}" r="3" fill="${escAttr(color)}" opacity="${op}"/><circle cx="${tx}" cy="${ty}" r="3" fill="${escAttr(color)}" opacity="${op}"/>`
      );
      // Pin labels only on the spotlighted (current) wire — in the overview the
      // colored lines + boxes carry the picture; exact pins show when you're on it.
      if (isCurrent) {
        labelSvg.push(pinTag(sx, sy, dir === "h" ? (tx > sx ? "e" : "w") : "s", e.fromPin, color));
        labelSvg.push(pinTag(tx, ty, dir === "h" ? (tx > sx ? "w" : "e") : "n", e.toPin, color));
      }
    });
  }

  // --- Boxes on top of wires ---
  const boxSvg = boxes
    .map((b) => {
      const dim = focus && !focus.has(b.partId);
      const op = dim ? 0.4 : 1;
      const fill = b.isCell ? "#3b2a12" : "#171c26";
      const stroke = b.isCell ? "#b45309" : "#334155";
      return `<g opacity="${op}">
  <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 4}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12.5" font-weight="600" fill="#e6e9ef">${escText(b.label)}</text>
</g>`;
    })
    .join("\n");

  const legend = drawLegend(H, W);
  const heading = opts.title
    ? `<text x="24" y="34" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#e6e9ef">${escText(opts.title)}</text>
  <text x="24" y="54" font-family="system-ui,sans-serif" font-size="11.5" fill="#94a3b8">Every part, every wire — the colors match the steps exactly.</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Whole circuit diagram: every part and every wire">
  <rect width="${W}" height="${H}" rx="14" fill="#0b0e13"/>
  ${heading}
  ${wireSvg.join("\n")}
  ${labelSvg.join("\n")}
  ${boxSvg}
  ${legend}
</svg>`;
}

function maxRowsHeight(rows: number): number {
  return Math.max(1, rows) * ROW_GAP - (ROW_GAP - BOX_H);
}

/** Compute wire attach points on the facing edges of two boxes. */
function anchors(
  from: Box,
  to: Box,
  spread: number
): [number, number, number, number, "h" | "v"] {
  if (from.col === to.col) {
    // vertical neighbor: exit bottom/top
    const sx = from.x + from.w / 2 + spread;
    const tx = to.x + to.w / 2 + spread;
    if (to.y > from.y) return [sx, from.y + from.h, tx, to.y, "v"];
    return [sx, from.y, tx, to.y + to.h, "v"];
  }
  const leftBox = from.col < to.col ? from : to;
  const rightBox = from.col < to.col ? to : from;
  const lx = leftBox.x + leftBox.w;
  const rx = rightBox.x;
  const ly = leftBox.y + leftBox.h / 2 + spread;
  const ry = rightBox.y + rightBox.h / 2 + spread;
  // return in from→to order
  if (from.col < to.col) return [lx, ly, rx, ry, "h"];
  return [rx, ry, lx, ly, "h"];
}

/** Small pin-name tag anchored just off an endpoint. */
function pinTag(x: number, y: number, side: "e" | "w" | "n" | "s", pin: string, color: string): string {
  const label = truncate(pin, 6);
  const dx = side === "e" ? 7 : side === "w" ? -7 : 0;
  const dy = side === "s" ? 12 : side === "n" ? -8 : 3;
  const anchor = side === "e" ? "start" : side === "w" ? "end" : "middle";
  return `<text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" font-family="ui-monospace,monospace" font-size="9" font-weight="600" fill="${escAttr(color)}">${escText(label)}</text>`;
}

function drawLegend(H: number, W: number): string {
  const items: [string, string][] = [
    ["#dc2626", "Power (red)"],
    ["#64748b", "Ground (black)"],
    ["#2563eb", "SDA (blue)"],
    ["#eab308", "SCL (yellow)"],
  ];
  const y = H - 34;
  let x = 24;
  const parts: string[] = [];
  for (const [c, label] of items) {
    parts.push(
      `<circle cx="${x + 6}" cy="${y}" r="6" fill="${c}"/><text x="${x + 18}" y="${y + 4}" font-family="system-ui,sans-serif" font-size="11.5" fill="#94a3b8">${escText(label)}</text>`
    );
    x += 26 + label.length * 7.2;
  }
  void W;
  return parts.join("\n");
}

/** Compact, human part label so boxes stay readable (common modules get a clean short form). */
function shortPart(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const l = cleaned.toLowerCase();
  if (/esp32-?c3/.test(l)) return "ESP32-C3";
  if (/tp4056|hw-?373/.test(l)) return "TP4056 Charger";
  if (/oled|ssd1306/.test(l)) return '0.96" OLED';
  if (/sht3|sht31|bme280|aht2/.test(l)) return "Temp/Humidity";
  if (/solar charg|charge controller|cn3791/.test(l)) return "Solar Charger";
  if (/solar panel|solar cell/.test(l)) return "Solar Panel";
  if (/slide switch|spdt|ss12f44/.test(l)) return "Slide Switch";
  if (/battery level|capacity|indicator/.test(l)) return "Battery Meter";
  if (/lipo|li-?po|lithium|18650|16340|cell/.test(l)) return "Battery";
  return truncate(cleaned, 18);
}
