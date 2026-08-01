/**
 * Board silkscreen pin layouts for the pad-connection map.
 *
 * Usability goal: the beginner sees the SAME pin names and rough layout as
 * the module in their hand — Fritzing breadboard view + InteractiveHtmlBom
 * "highlight one pad among neighbors" — not a generic four-blob diagram.
 *
 * Authority for names:
 *  1. Catalog RealPartSpec pins when we can resolve the part
 *  2. Public SuperMini / module pinouts (expanded neighbors for orientation)
 *  3. Heuristic fallbacks by board label
 *
 * Electrical truth for nets/harness stays in product-3d + compiler.
 * This file is visual orientation only; the active pin is always forced in.
 */

import { REAL_PARTS, type CatalogPartId } from "@/lib/product-3d/real-parts";
import { normalizeModelId } from "@/lib/product-3d/part-models";

export type PinoutKind = "dual_header" | "single_row" | "edge_pads";

export interface BoardPinout {
  kind: PinoutKind;
  /** Short title on the board face (e.g. SuperMini) */
  shortName: string;
  /**
   * dual_header: left column top→bottom, right column top→bottom
   * single_row: left→right along one edge
   * edge_pads: free labels (drawn as a row; order is orientation only)
   */
  left?: string[];
  right?: string[];
  row?: string[];
  /** Citation for the layout (docs / RealPartSpec source) */
  credit: string;
}

/** ESP32-C3 SuperMini dual header — silkscreen neighbors for kitchen-table find. */
const ESP32_C3_SUPERMINI: BoardPinout = {
  kind: "dual_header",
  shortName: "ESP32-C3 SuperMini",
  // Public SuperMini class pinout (Mischianti / vendor silkscreen class).
  // Active GPIO names (GPIO4…) map onto bare numbers when needed.
  left: ["5V", "GND", "3V3", "4", "3", "2", "1", "0"],
  right: ["5", "6", "7", "8", "9", "10", "20", "21"],
  credit:
    "ESP32-C3 SuperMini dual-header silkscreen class (Mischianti pinout / common clone)",
};

const OLED_096: BoardPinout = {
  kind: "single_row",
  shortName: '0.96" OLED',
  // Match RealPartSpec.oled_096 pin order (module bottom header, common I2C)
  row: REAL_PARTS.oled_096.pins.map((p) => p.name),
  credit: REAL_PARTS.oled_096.source,
};

const TP4056: BoardPinout = {
  kind: "edge_pads",
  shortName: "TP4056",
  row: REAL_PARTS.tp4056.pins.map((p) => p.name),
  credit: REAL_PARTS.tp4056.source,
};

const SHT30: BoardPinout = {
  kind: "single_row",
  shortName: "SHT30",
  row: REAL_PARTS.sht30.pins.map((p) => p.name),
  credit: REAL_PARTS.sht30.source,
};

const TTP223: BoardPinout = {
  kind: "single_row",
  shortName: "TTP223",
  row: REAL_PARTS.ttp223.pins.map((p) => p.name),
  credit: REAL_PARTS.ttp223.source,
};

const CELL_16340: BoardPinout = {
  kind: "edge_pads",
  shortName: "16340 cell",
  row: ["+", "−"],
  credit: REAL_PARTS.cell_16340.source,
};

const SOLAR: BoardPinout = {
  kind: "edge_pads",
  shortName: "Solar panel",
  row: ["+", "−"],
  credit: REAL_PARTS.solar_cell.source,
};

const BY_CATALOG: Partial<Record<CatalogPartId, BoardPinout>> = {
  esp32_c3: ESP32_C3_SUPERMINI,
  oled_096: OLED_096,
  tp4056: TP4056,
  sht30: SHT30,
  ttp223: TTP223,
  cell_16340: CELL_16340,
  solar_cell: SOLAR,
};

/** Collapse plan part ids / labels toward a catalog key. */
export function resolveCatalogHint(
  partId?: string | null,
  label?: string | null
): CatalogPartId | null {
  const raw = `${partId || ""} ${label || ""}`.toLowerCase();
  const norm = normalizeModelId(partId || label || "");

  if (norm in BY_CATALOG) return norm as CatalogPartId;
  if (partId && normalizeModelId(partId) in BY_CATALOG) {
    return normalizeModelId(partId) as CatalogPartId;
  }

  if (/esp32|c3.?super|supermini|mcu|microcontroller|pico|arduino|nano|s3/.test(raw))
    return "esp32_c3";
  if (/oled|ssd1306|display|0\.96/.test(raw)) return "oled_096";
  if (/tp4056|charger|charge.?mod/.test(raw)) return "tp4056";
  if (/sht3|humidity|temp.?sensor|bme|aht/.test(raw)) return "sht30";
  if (/ttp223|touch|capacitive/.test(raw)) return "ttp223";
  if (/16340|rcr123|li.?ion.?cell|battery.?cell/.test(raw)) return "cell_16340";
  if (/solar/.test(raw)) return "solar_cell";
  return null;
}

/**
 * Normalize silkscreen names so "GPIO4" finds pad "4", "GND" finds "GND", etc.
 */
export function pinAliases(pin: string): string[] {
  const p = (pin || "").trim();
  if (!p) return [];
  const u = p.toUpperCase();
  const out = new Set<string>([p, u, p.toLowerCase()]);
  const gpio = u.match(/^GPIO\s*(\d+)$/i) || u.match(/^IO\s*(\d+)$/i);
  if (gpio) {
    out.add(gpio[1]);
    out.add(`GPIO${gpio[1]}`);
    out.add(`IO${gpio[1]}`);
  }
  if (/^\d+$/.test(u)) {
    out.add(`GPIO${u}`);
    out.add(`IO${u}`);
  }
  if (u === "GND" || u === "GROUND" || u === "-" || u === "VSS") {
    out.add("GND");
    out.add("−");
    out.add("-");
    out.add("BAT-");
    out.add("B-");
    out.add("OUT-");
    out.add("IN-");
  }
  if (/^(VCC|3V3|3\.3V|VIN|\+|VDD|BAT\+|B\+|OUT\+|IN\+)$/i.test(u)) {
    out.add("VCC");
    out.add("3V3");
    out.add("+");
    out.add("B+");
    out.add("OUT+");
    out.add("IN+");
    out.add("5V");
  }
  if (u === "SDA" || u === "SCL") out.add(u);
  if (u === "SIG" || u === "OUT" || u === "IO") out.add("SIG");
  return [...out];
}

export function pinMatches(pad: string, activePin: string): boolean {
  const a = pinAliases(activePin).map((x) => x.toUpperCase());
  const p = pad.toUpperCase();
  if (a.includes(p)) return true;
  // pad "4" matches active "GPIO4"
  for (const al of a) {
    if (al === p) return true;
    if (/^\d+$/.test(p) && (al === `GPIO${p}` || al === `IO${p}` || al === p)) return true;
    if (/^\d+$/.test(al) && (p === `GPIO${al}` || p === `IO${al}` || p === al)) return true;
  }
  return false;
}

/** Ensure the active silkscreen pin appears in the layout (exact display name preferred). */
function ensureActive(layout: BoardPinout, activePin: string): BoardPinout {
  if (!activePin?.trim()) return layout;
  const all = [
    ...(layout.left || []),
    ...(layout.right || []),
    ...(layout.row || []),
  ];
  if (all.some((p) => pinMatches(p, activePin))) {
    // Prefer showing the silkscreen form the user reads on the board when we
    // have a bare number that matches GPIO N.
    return layout;
  }

  // Inject active pin name into a sensible slot so highlight always works.
  const name = activePin.trim();
  if (layout.kind === "dual_header") {
    const right = [...(layout.right || [])];
    const mid = Math.min(Math.floor(right.length / 2), Math.max(0, right.length - 1));
    if (right.length) right[mid] = name;
    else return { ...layout, right: [name] };
    return { ...layout, right };
  }
  const row = [...(layout.row || [])];
  if (!row.length) return { ...layout, kind: "single_row", row: [name] };
  const mid = Math.min(Math.floor(row.length / 2), row.length - 1);
  row[mid] = name;
  return { ...layout, row };
}

const GENERIC: BoardPinout = {
  kind: "single_row",
  shortName: "Module",
  row: ["+", "−", "SIG", "OUT"],
  credit: "generic header fallback",
};

/**
 * Resolve the pad map layout for one end of a wire.
 * Prefer plan partId → catalog; fall back to label heuristics.
 */
export function pinoutForBoard(
  label: string,
  activePin: string,
  partId?: string | null
): BoardPinout {
  const cat = resolveCatalogHint(partId, label);
  const base = (cat && BY_CATALOG[cat]) || guessFromLabel(label) || GENERIC;
  const withName: BoardPinout = {
    ...base,
    shortName: shortLabel(label, base.shortName),
  };
  return ensureActive(withName, activePin);
}

function shortLabel(label: string, fallback: string): string {
  const t = (label || "").trim();
  if (!t) return fallback;
  if (t.length <= 22) return t;
  return t.slice(0, 20) + "…";
}

function guessFromLabel(label: string): BoardPinout | null {
  const cat = resolveCatalogHint(null, label);
  return cat ? BY_CATALOG[cat] || null : null;
}

/** Flat list of pads for tests / search. */
export function allPads(layout: BoardPinout): string[] {
  return [...(layout.left || []), ...(layout.right || []), ...(layout.row || [])];
}
