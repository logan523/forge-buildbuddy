/**
 * Wiring sheet — the ONE picture a beginner wants: every part and every wire
 * at once, color-coded, drawn from the same netlist truth as the steps and the
 * connection table (so colors/pins can never drift).
 *
 * Technical-light sheet, ink on paper (DESIGN.md): white surface, ink outlines,
 * wire colors verbatim from the authority, direct labels on the thing (Tufte) —
 * pin names on every wire end, legend only for net classes. Native-pixel
 * output: width/height are real pixels (viewBox 1:1), so text never scales
 * below its authored size; hosts scroll horizontally at native width (the
 * proven overflow-x-auto pattern) instead of squishing the viewBox.
 *
 * `crop: true` renders only the step's focus parts + their wires, drawn large —
 * the per-step teaching surface (solder workbench, step hero, missing-device
 * panel). Wire state language matches the 3D stage exactly: pending = ghost,
 * current = saturated + width bump + arrow, done = solid.
 */

import type { BuildPlan } from "@/lib/types";
import type { ElectricalComponent } from "@/lib/electrical/types";
import { edgesFromModel } from "@/lib/steps/compile";
import { wireLegend } from "@/lib/wire-colors";
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
  /** Crop to the focus parts + their wires, drawn large (per-step sheet). */
  crop?: boolean;
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

/** Sheet palette — the DESIGN.md tokens, inlined (SVG strings can't use CSS). */
const INK = "#1a2744";
const INK_SECONDARY = "#4a5568";
const INK_MUTED = "#5c6b7a";
const PAPER = "#ffffff";
const SHEET_BORDER = "#d4cfc5";
const ACCENT = "#0e7490";

const COL_STEP = 236;
const COL_PAD = 34;
const BOX_W = 176;
const BOX_H = 58;
const TOP = 30;
const ROW_GAP = 92;

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

export function svgCircuitDiagram(plan: BuildPlan, opts: CircuitDiagramOptions = {}): string {
  const model = plan.electrical;
  const highlight = new Set(opts.highlightWireIds || []);
  const done = new Set(opts.doneWireIds || []);
  const focus = opts.focusPartIds && opts.focusPartIds.length ? new Set(opts.focusPartIds) : null;
  const hasHi = highlight.size > 0;
  const stateMode = hasHi || done.size > 0;

  if (!model || model.components.length === 0) {
    const W = 640;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 160" width="${W}" height="160" role="img" aria-label="Circuit diagram unavailable">
  <rect width="${W}" height="160" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="${W / 2}" y="86" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="${INK_MUTED}">Circuit diagram will appear once parts are wired.</text>
</svg>`;
  }

  // --- Crop: keep only the focus parts (+ highlighted wire endpoints) ---
  let comps = model.components;
  if (opts.crop) {
    const keep = new Set(focus ?? []);
    const refToPart = new Map(model.components.map((c) => [c.ref, c.partId]));
    const edges0 = edgesFromModel(plan, model);
    for (const e of edges0) {
      if (highlight.has(e.id)) {
        const fp = refToPart.get(e.fromRef);
        const tp = refToPart.get(e.toRef);
        if (fp) keep.add(fp);
        if (tp) keep.add(tp);
      }
    }
    if (keep.size > 0) {
      const cropped = comps.filter((c) => keep.has(c.partId));
      if (cropped.length > 0) comps = cropped;
    }
  }

  // --- Layout: assign each component to a column, center each column's stack ---
  const byCol: ElectricalComponent[][] = [[], [], [], [], []];
  for (const c of comps) byCol[columnFor(c)].push(c);
  // Compact unused columns so a crop never carries dead whitespace.
  const usedCols = byCol.map((_, i) => i).filter((i) => byCol[i].length > 0);
  const colX = new Map<number, number>(
    usedCols.map((col, i) => [col, COL_PAD + BOX_W / 2 + i * COL_STEP])
  );
  const colCount = Math.max(1, usedCols.length);

  const maxRows = Math.max(1, ...usedCols.map((i) => byCol[i].length));
  const stackH = maxRowsHeight(maxRows);
  // A 2-part crop is narrower than the net-class legend row — never clip it.
  const legendW = legendWidth();
  const W = Math.max(colCount * COL_STEP + COL_PAD * 2, legendW);
  const titleH = opts.title ? 38 : 0;
  const H = titleH + TOP + stackH + 24 + 74; // legend row at the bottom

  const boxByRef = new Map<string, Box>();
  const boxes: Box[] = [];
  usedCols.forEach((col) => {
    const list = byCol[col];
    const blockH = maxRowsHeight(Math.max(1, list.length));
    const startY = titleH + TOP + (stackH - blockH) / 2;
    list.forEach((c, row) => {
      const b: Box = {
        ref: c.ref,
        partId: c.partId,
        label: shortPart(c.name),
        col,
        row,
        x: (colX.get(col) ?? COL_PAD) - BOX_W / 2,
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
  const edges = edgesFromModel(plan, model).filter(
    (e) => boxByRef.has(e.fromRef) && boxByRef.has(e.toRef)
  );
  const pairKey = (a: string, b: string) => [a, b].sort().join("~");
  const groups = new Map<string, typeof edges>();
  for (const e of edges) {
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
      const spread = (i - (n - 1) / 2) * 14;
      const [sx, sy, tx, ty, dir] = anchors(from, to, spread);
      const color = e.colorHex || INK_SECONDARY;
      const isCurrent = highlight.has(e.id);
      const isDone = done.has(e.id);
      const dimByFocus = !!focus && !(focus.has(from.partId) && focus.has(to.partId));
      // state mode (wiring step): current spotlit, done solid, pending ghost.
      // overview: full, or focus-dimmed. Same language as the 3D wire layer.
      const op = stateMode ? (isCurrent ? 1 : isDone ? 0.92 : 0.16) : dimByFocus ? 0.32 : 1;
      const sw = isCurrent ? 4 : 2.6;
      const cx = Math.max(44, Math.abs(tx - sx) * 0.45);
      const c1x = dir === "h" ? sx + (tx > sx ? cx : -cx) : sx;
      const c2x = dir === "h" ? tx + (tx > sx ? -cx : cx) : tx;
      const c1y = dir === "h" ? sy : sy + (ty > sy ? cx : -cx);
      const c2y = dir === "h" ? ty : ty + (ty > sy ? -cx : cx);
      const path = `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
      if (isCurrent) {
        wireSvg.push(
          `<path d="${path}" fill="none" stroke="${ACCENT}" stroke-width="10" stroke-linecap="round" opacity="0.22"/>`
        );
      }
      wireSvg.push(
        `<path d="${path}" fill="none" stroke="${escAttr(color)}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`
      );
      // Arrowhead: the current wire shows flow direction at its target pad.
      if (isCurrent) {
        const ang = Math.atan2(ty - c2y, tx - c2x);
        wireSvg.push(arrowHead(tx, ty, ang, color));
      }
      // endpoint pads
      wireSvg.push(
        `<circle cx="${sx}" cy="${sy}" r="3.5" fill="${escAttr(color)}" stroke="${INK}" stroke-width="1" opacity="${op}"/><circle cx="${tx}" cy="${ty}" r="3.5" fill="${escAttr(color)}" stroke="${INK}" stroke-width="1" opacity="${op}"/>`
      );
      // Direct pin labels on every wire end (the sheet is native-pixel, so
      // 11px mono stays legible; the old squished viewBox made these 4px).
      // Parallel vertical wires run close together in the gap between boxes,
      // so fan their tags apart: left wire's tags grow left, right wire's right.
      const vAnchor = spread < 0 ? "end" : spread > 0 ? "start" : undefined;
      labelSvg.push(pinTag(sx, sy, dir === "h" ? (tx > sx ? "w" : "e") : "n", e.fromPin, color, op, dir === "v" ? vAnchor : undefined));
      labelSvg.push(pinTag(tx, ty, dir === "h" ? (tx > sx ? "e" : "w") : "s", e.toPin, color, op, dir === "v" ? vAnchor : undefined));
    });
  }

  // --- Boxes on top of wires ---
  const boxSvg = boxes
    .map((b) => {
      const dim = focus && !focus.has(b.partId);
      const op = dim ? 0.4 : 1;
      const fill = PAPER;
      const stroke = b.isCell ? "#b45309" : INK;
      return `<g opacity="${op}">
  <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
  <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 4.5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="${INK}">${escText(b.label)}</text>
</g>`;
    })
    .join("\n");

  const legend = drawLegend(H - 40);
  const heading = opts.title
    ? `<text x="${COL_PAD + 4}" y="26" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${INK}">${escText(opts.title)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Whole circuit diagram: every part and every wire">
  <rect width="${W}" height="${H}" rx="14" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  ${heading}
  ${wireSvg.join("\n")}
  ${boxSvg}
  ${labelSvg.join("\n")}
  ${legend}
</svg>`;
}

/** Small filled arrowhead pointing along `ang` at (x, y). */
function arrowHead(x: number, y: number, ang: number, color: string): string {
  const L = 9;
  const Wd = 4.5;
  const bx = x - Math.cos(ang) * L;
  const by = y - Math.sin(ang) * L;
  const px = -Math.sin(ang) * Wd;
  const py = Math.cos(ang) * Wd;
  return `<path d="M${x},${y} L${bx + px},${by + py} L${bx - px},${by - py} Z" fill="${escAttr(color)}"/>`;
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

/**
 * Mono pin tag just off an endpoint, on the OUTSIDE of the box edge.
 * Sized 11px (the DESIGN.md floor for expert-adjacent readouts; part labels
 * and legend run 12–13px).
 */
function pinTag(
  x: number,
  y: number,
  side: "e" | "w" | "n" | "s",
  pin: string,
  color: string,
  op: number,
  anchor?: "start" | "end"
): string {
  const label = truncate(pin, 7);
  const dx = anchor === "start" ? 4 : anchor === "end" ? -4 : side === "e" ? 8 : side === "w" ? -8 : 0;
  const dy = side === "s" ? 16 : side === "n" ? -10 : 4;
  const a = anchor ?? (side === "e" ? "start" : side === "w" ? "end" : "middle");
  return `<text x="${x + dx}" y="${y + dy}" text-anchor="${a}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="600" fill="${escAttr(color)}" opacity="${Math.max(op, 0.35)}">${escText(label)}</text>`;
}

/** Net-class legend from the color authority — the ONLY legend on the sheet. */
function legendWidth(): number {
  let w = COL_PAD + 8;
  for (const row of wireLegend()) w += 26 + row.meaning.length * 6.6;
  return Math.ceil(w);
}

function drawLegend(y: number): string {
  const items = wireLegend();
  let x = COL_PAD + 4;
  const parts: string[] = [];
  for (const row of items) {
    const label = row.meaning;
    parts.push(
      `<circle cx="${x + 6}" cy="${y}" r="5.5" fill="${escAttr(row.color)}" stroke="${INK}" stroke-width="1"/><text x="${x + 18}" y="${y + 4}" font-family="system-ui,sans-serif" font-size="12" fill="${INK_SECONDARY}">${escText(label)}</text>`
    );
    x += 26 + label.length * 6.6;
  }
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
