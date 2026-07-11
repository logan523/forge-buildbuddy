/**
 * Operating-Point Solver — the truth spine that promotes the netlist from static
 * rule-checking to solved physics.
 *
 * A beginner's rail isn't a label, it's a number under load: hang one peripheral
 * too many off a thin battery wire and the voltage sags. This estimates that —
 * per power rail, sum the load current, apply the series resistance (source +
 * wiring), and report the DELIVERED voltage and whether it browns out.
 *
 * Honest about its model: it's a bounded IR-sag ESTIMATE (radial rail, typical
 * currents, assumed resistances), not a measured value — every output carries the
 * "assumed" trust grade, matching the electrical core's claim hygiene. Pure; the
 * pin-glow-by-solved-voltage visualization is built on top of this.
 */

import type { ElectricalModel, ElectricalComponent } from "./types";

/** Typical active current draw (mA) by catalog part. Sources draw ~0 as loads. */
const CURRENT_MA: Record<string, number> = {
  esp32_c3: 80, // MCU active, radio idle
  oled_096: 15,
  sht30: 1,
  ttp223: 5,
  tp4056: 0, // charger — a source path, not a system load
  solar_cell: 0,
  cell_16340: 0, // the source itself
  generic_pcb: 5,
};
/** Peak draw (mA) — the WiFi TX spike is what actually browns a board out. */
const PEAK_MA: Record<string, number> = {
  esp32_c3: 350, // WiFi/BLE TX burst — datasheet peak
};
const DEFAULT_LOAD_MA = 10;

const SOURCE_CATALOG = new Set(["cell_16340", "tp4056", "solar_cell"]);

export interface RailOperatingPoint {
  netName: string;
  /** Nominal rail voltage (V). */
  nominalV: number;
  /** Summed steady load current on the rail (mA). */
  loadMa: number;
  /** Summed peak current (WiFi TX burst etc.) — what browns a board out (mA). */
  peakMa: number;
  /** Series resistance estimate (Ω): source internal + wiring/contact. */
  seriesOhm: number;
  /** Nominal − I·R at steady load (V) — the normal reading. */
  deliveredV: number;
  /** Nominal − I·R at peak (V) — the dip during a burst. */
  deliveredPeakV: number;
  /** Steady sag from nominal (mV). */
  sagMv: number;
  status: "ok" | "marginal" | "brownout";
  grade: "assumed";
}

/** Voltage floors a rail must stay above, by nominal band (V). */
function floorsFor(nominalV: number): { marginal: number; brownout: number } {
  if (nominalV <= 3.6) return { marginal: nominalV - 0.15, brownout: nominalV - 0.35 }; // 3.3V logic
  if (nominalV <= 4.35) return { marginal: 3.5, brownout: 3.3 }; // Li-ion: the 3.3V LDO dropout floor
  return { marginal: nominalV - 0.25, brownout: nominalV - 0.5 }; // 5V rail
}

export interface OperatingPoint {
  available: boolean;
  rails: RailOperatingPoint[];
  /** The worst rail status, for a one-glance summary. */
  worst: "ok" | "marginal" | "brownout" | "none";
}

function isSource(c: ElectricalComponent | undefined): boolean {
  if (!c) return false;
  return !!c.isLithiumCell || (c.catalogId ? SOURCE_CATALOG.has(c.catalogId) : false);
}

function loadFor(c: ElectricalComponent | undefined): number {
  if (!c || isSource(c)) return 0;
  if (c.catalogId && c.catalogId in CURRENT_MA) return CURRENT_MA[c.catalogId]!;
  return DEFAULT_LOAD_MA;
}

function peakFor(c: ElectricalComponent | undefined): number {
  if (!c || isSource(c)) return 0;
  if (c.catalogId && c.catalogId in PEAK_MA) return PEAK_MA[c.catalogId]!;
  return loadFor(c); // no distinct peak → steady draw
}

export function solveOperatingPoint(model: ElectricalModel | undefined | null): OperatingPoint {
  if (!model || !model.nets?.length) return { available: false, rails: [], worst: "none" };

  const byRef = new Map(model.components.map((c) => [c.ref, c]));
  const rails: RailOperatingPoint[] = [];

  for (const net of model.nets) {
    if (net.netClass !== "power") continue;
    const nominalV = Math.max(0, ...net.members.map((m) => m.domainV ?? 0));
    if (nominalV <= 0) continue;

    // Sum steady + peak current over distinct non-source components on the rail.
    const refs = new Set(net.members.map((m) => m.ref));
    let loadMa = 0;
    let peakMa = 0;
    let loadCount = 0;
    let batteryDirect = false;
    for (const ref of refs) {
      const c = byRef.get(ref);
      const l = loadFor(c);
      if (l > 0) loadCount++;
      loadMa += l;
      peakMa += peakFor(c);
      if (c?.isLithiumCell) batteryDirect = true;
    }
    if (loadMa <= 0) continue; // no load, no meaningful operating point

    // Series R: source internal + wiring. Each extra load daisy-chained on shared
    // thin breadboard wiring adds resistance — the honest reason stacking loads
    // browns a board out. Estimates, graded "assumed".
    const base = batteryDirect ? 0.5 : 0.3;
    const seriesOhm = Math.round((base + 0.1 * Math.max(0, loadCount - 1)) * 100) / 100;
    const deliveredV = nominalV - (loadMa / 1000) * seriesOhm;
    const deliveredPeakV = nominalV - (peakMa / 1000) * seriesOhm;
    const sagMv = Math.round((nominalV - deliveredV) * 1000);

    // Brownout is judged on the PEAK dip against the rail's real floor.
    const { marginal, brownout } = floorsFor(nominalV);
    const status: RailOperatingPoint["status"] =
      deliveredPeakV < brownout ? "brownout" : deliveredPeakV < marginal ? "marginal" : "ok";

    rails.push({
      netName: net.name,
      nominalV,
      loadMa,
      peakMa,
      seriesOhm,
      deliveredV: Math.round(deliveredV * 100) / 100,
      deliveredPeakV: Math.round(deliveredPeakV * 100) / 100,
      sagMv,
      status,
      grade: "assumed",
    });
  }

  const rank = { ok: 0, marginal: 1, brownout: 2 } as const;
  const worst = rails.reduce<OperatingPoint["worst"]>(
    (w, r) => (w === "none" || rank[r.status] > rank[w as "ok" | "marginal" | "brownout"] ? r.status : w),
    "none"
  );

  return { available: true, rails, worst };
}
