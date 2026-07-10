/**
 * THE wire-color authority (eng review V5).
 *
 * Every surface that colors a wire — step text chips, the 2D hands-on
 * diagrams, the 3D harness tubes, the legend — resolves through this module,
 * so the views can never disagree.
 *
 * Precedence (V5, founder-approved):
 *   1. Well-known NET name (SDA=blue, SCL=yellow — beginners must be able to
 *      tell the two I²C lines apart; this matches the existing 2D teaching
 *      convention and the demo's own structuredNets).
 *   2. NET CLASS standard (power=red, gnd=black, …). Class color WINS over a
 *      plan/LLM-supplied wireColor on classed nets — LLM-chosen colors are the
 *      origin of the demo's green-vs-blue SDA contradiction.
 *   3. Plan-supplied wireColor — honored only for unclassed ("other") nets.
 *   4. Fallback grey.
 */

export const WIRE_NAME_HEX: Record<string, string> = {
  red: "#dc2626",
  black: "#1e293b",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  white: "#e2e8f0",
  brown: "#92400e",
  purple: "#a855f7",
  grey: "#94a3b8",
  gray: "#94a3b8",
};

export const NET_CLASS_HEX: Record<string, string> = {
  gnd: WIRE_NAME_HEX.black,
  power: WIRE_NAME_HEX.red,
  i2c: WIRE_NAME_HEX.blue,
  spi: WIRE_NAME_HEX.purple,
  uart: WIRE_NAME_HEX.green,
  analog: "#d97706",
  digital: "#0891b2",
  signal: "#0891b2",
  other: WIRE_NAME_HEX.grey,
};

/**
 * Distinguishable colors for well-known nets that share a class. Matched by
 * substring so "SDA", "I2C_SDA", and "SENS_SDA" all resolve identically.
 */
function wellKnownNetHex(netName: string): string | undefined {
  const n = netName.toLowerCase();
  if (n.includes("sda")) return WIRE_NAME_HEX.blue;
  if (n.includes("scl")) return WIRE_NAME_HEX.yellow;
  return undefined;
}

/** Classes with a pedagogical standard color (everything except "other"). */
function classedHex(netClass: string): string | undefined {
  if (netClass === "other") return undefined;
  return NET_CLASS_HEX[netClass];
}

function hexFromWireColor(wireColor: string): string | undefined {
  const k = wireColor.toLowerCase().trim();
  if (WIRE_NAME_HEX[k]) return WIRE_NAME_HEX[k];
  const bare = wireColor.replace(/^#/, "");
  if (/^[0-9a-f]{3,8}$/i.test(bare)) return `#${bare}`;
  return undefined;
}

/** Resolve the display color for a net. See precedence above. */
export function netColorFor(netClass: string, wireColor?: string, netName?: string): string {
  const known = netName ? wellKnownNetHex(netName) : undefined;
  if (known) return known;
  const classed = classedHex(netClass);
  if (classed) return classed;
  if (wireColor) {
    const fromPlan = hexFromWireColor(wireColor);
    if (fromPlan) return fromPlan;
  }
  return NET_CLASS_HEX.other;
}

/** Human color name for a resolved hex ("blue"), for text like "the blue wire". */
export function wireColorName(hex: string): string {
  const target = hex.toLowerCase();
  for (const [name, value] of Object.entries(WIRE_NAME_HEX)) {
    if (name === "gray") continue;
    if (value.toLowerCase() === target) return name;
  }
  if (target === NET_CLASS_HEX.analog) return "orange";
  if (target === NET_CLASS_HEX.digital) return "teal";
  return "colored";
}

/**
 * True when a plan-supplied wireColor conflicts with the standard for its
 * classed net — surfaced by the step-content validator as a warning, never
 * silently divergent rendering.
 */
export function colorConflict(netClass: string, wireColor?: string, netName?: string): boolean {
  if (!wireColor) return false;
  const authority = netColorFor(netClass, undefined, netName);
  const fromPlan = hexFromWireColor(wireColor);
  if (!fromPlan) return false;
  if (netClass === "other") return false;
  return fromPlan.toLowerCase() !== authority.toLowerCase();
}

/** Legend rows for UI — the same rows every surface shows. */
export function wireLegend(): { netClass: string; color: string; meaning: string }[] {
  return [
    { netClass: "power", color: NET_CLASS_HEX.power, meaning: "Power (VCC / B+)" },
    { netClass: "gnd", color: NET_CLASS_HEX.gnd, meaning: "Ground" },
    { netClass: "i2c", color: WIRE_NAME_HEX.blue, meaning: "I²C data (SDA)" },
    { netClass: "i2c", color: WIRE_NAME_HEX.yellow, meaning: "I²C clock (SCL)" },
    { netClass: "digital", color: NET_CLASS_HEX.digital, meaning: "Digital / GPIO" },
    { netClass: "analog", color: NET_CLASS_HEX.analog, meaning: "Solar / analog" },
  ];
}
