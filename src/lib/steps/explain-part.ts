/**
 * "Tap-a-Pin, It Explains Itself."
 *
 * Tap a part in the 3D and it explains itself in plain English, grounded in the
 * netlist: what it is, and what each of its connections actually does. Turns a
 * technical "GPIO4 → SDA, AWG26" list into "This is the brain. It talks to the
 * screen over two data wires and shares power and ground with it." Pure; the
 * caller resolves the node's incident wires + the part at the other end.
 */

export interface ExplainWire {
  netClass: string;
  netName: string;
  colorName?: string;
  /** Label of the part at the OTHER end of this wire. */
  otherLabel: string;
}

export interface PartExplanation {
  headline: string;
  points: string[];
}

/** Plain-English role by scene node id (sat template), else a keyword guess. */
function rolePhrase(nodeId: string, label: string): string {
  const map: Record<string, string> = {
    brain: "the brain — it runs everything",
    face: "the screen — it shows the output",
    charger: "the charger — it safely fills the battery",
    battery: "the power source",
    sensor: "the sensor — it reads the world",
    touch: "the touch button — your input",
    "solar-l": "a solar panel — it harvests light",
    "solar-r": "a solar panel — it harvests light",
  };
  if (map[nodeId]) return map[nodeId]!;
  const t = label.toLowerCase();
  if (/esp|mcu|brain/.test(t)) return "the brain — it runs everything";
  if (/oled|display|screen/.test(t)) return "the screen";
  if (/charg|tp4056/.test(t)) return "the charger";
  if (/batt|cell/.test(t)) return "the power source";
  if (/sensor|sht|temp/.test(t)) return "the sensor";
  if (/solar/.test(t)) return "a solar panel";
  return "one of your parts";
}

const uniq = (xs: string[]) => [...new Set(xs)];

export function explainNode(nodeId: string, label: string, wires: ExplainWire[]): PartExplanation {
  const headline = `This is ${label} — ${rolePhrase(nodeId, label)}.`;
  if (!wires.length) return { headline, points: ["It isn't wired to anything in this step yet."] };

  const isPower = (w: ExplainWire) => /power/i.test(w.netClass);
  const isGnd = (w: ExplainWire) => /gnd|ground/i.test(w.netClass);
  const isData = (w: ExplainWire) => /i2c|spi|digital|signal|analog/i.test(w.netClass);

  const points: string[] = [];
  const powerTo = uniq(wires.filter(isPower).map((w) => w.otherLabel));
  const dataTo = uniq(wires.filter(isData).map((w) => w.otherLabel));
  const gndTo = uniq(wires.filter(isGnd).map((w) => w.otherLabel));

  if (powerTo.length) points.push(`It shares power with ${listPhrase(powerTo)}.`);
  if (dataTo.length) {
    const n = wires.filter(isData).length;
    points.push(`It talks to ${listPhrase(dataTo)} over ${n} data ${n === 1 ? "wire" : "wires"}.`);
  }
  if (gndTo.length) points.push(`It shares ground with ${listPhrase(gndTo)} — every part needs this.`);

  if (!points.length) {
    points.push(`It connects to ${listPhrase(uniq(wires.map((w) => w.otherLabel)))}.`);
  }
  return { headline, points };
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "the board";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
