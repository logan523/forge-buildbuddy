/**
 * Voltage-domain authority — "The 3.3V Island."
 *
 * A beginner's core fear ("will I fry it?") is really about one invisible thing:
 * voltage. So paint it. Every net resolves to a domain with a stable color, so
 * the connections table, the 3D pads, and the wiring map can all glow by domain
 * — and a wire bridging two different colors is visibly the danger.
 *
 * Pure. Derived from the netlist's per-pin domainV (the same numbers checksFor
 * already reads), so the colors can never disagree with the electrical model.
 */

export interface VoltageDomain {
  /** Stable key for grouping / legend. */
  key: "gnd" | "3v3" | "5v" | "batt" | "pwr" | "signal";
  /** Short label a beginner reads ("3.3V", "GND", "Battery"). */
  label: string;
  /** Island color. */
  colorHex: string;
  /** Domain volts, or null for signal/data nets with no power domain. */
  volts: number | null;
}

const GND: VoltageDomain = { key: "gnd", label: "GND", colorHex: "#334155", volts: 0 };
const SIGNAL: VoltageDomain = { key: "signal", label: "Signal", colorHex: "#94a3b8", volts: null };

/** Map a domain voltage (+ net class) to its island. */
export function domainForVolts(volts: number | undefined, netClass?: string): VoltageDomain {
  if (netClass && /^(gnd|ground)$/i.test(netClass)) return GND;
  if (typeof volts !== "number" || !isFinite(volts)) return SIGNAL;
  if (volts <= 0.3) return GND;
  if (volts >= 3.0 && volts <= 3.6) return { key: "3v3", label: "3.3V", colorHex: "#0d9488", volts };
  if (volts > 3.6 && volts <= 4.35) return { key: "batt", label: "Battery", colorHex: "#d97706", volts };
  if (volts >= 4.5 && volts <= 5.5) return { key: "5v", label: "5V", colorHex: "#ea580c", volts };
  return { key: "pwr", label: `${volts % 1 === 0 ? volts : volts.toFixed(1)}V`, colorHex: "#a855f7", volts };
}

/** Domain for a net: GND by class/name, else its members' domain voltage. */
export function domainForNet(net: {
  netClass?: string;
  name?: string;
  members?: { domainV?: number }[];
}): VoltageDomain {
  if (net.netClass && /^(gnd|ground)$/i.test(net.netClass)) return GND;
  if (net.name && /^(gnd|ground|vss|agnd)$/i.test(net.name)) return GND;
  const v = net.members?.find((m) => typeof m.domainV === "number")?.domainV;
  return domainForVolts(v, net.netClass);
}

/** Would a wire between these two domains bridge different voltage islands? */
export function bridgesDomains(a: VoltageDomain, b: VoltageDomain): boolean {
  // Signal↔anything and same-domain are fine; two different POWER islands are the danger.
  if (a.key === "signal" || b.key === "signal") return false;
  if (a.key === "gnd" || b.key === "gnd") return false;
  return a.key !== b.key;
}
