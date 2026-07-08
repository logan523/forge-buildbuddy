/**
 * Dual-audience presentation of ERC violations.
 * Expert fields (title/detail/rule/refs/nets) stay on the model.
 * This layer adds plain-language "what's wrong / what to do" for beginners.
 */
import type { ElectricalComponent, ErcReport, ErcViolation } from "./types";

export type ErcAudienceView = {
  /** Beginner-facing */
  plainTitle: string;
  plainDetail: string;
  plainFix: string;
  whyItMatters: string;
  /** Expert-facing (from model, optionally enriched) */
  techTitle: string;
  techDetail: string;
  rule: string;
  severity: ErcViolation["severity"];
  id: string;
  refs?: string[];
  nets?: string[];
  /** Human labels for refs: "U2 → ESP32-C3" */
  refLabels: string[];
};

function refMap(components: ElectricalComponent[]): Map<string, string> {
  return new Map(components.map((c) => [c.ref, c.name]));
}

function labelRefs(refs: string[] | undefined, map: Map<string, string>): string[] {
  if (!refs?.length) return [];
  return refs.map((r) => {
    const n = map.get(r);
    return n ? `${r} · ${n}` : r;
  });
}

function humanList(labels: string[]): string {
  if (labels.length === 0) return "a part";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** Rule → beginner narrative. Expert title/detail remain the source of truth. */
function presentOne(v: ErcViolation, map: Map<string, string>): ErcAudienceView {
  const refLabels = labelRefs(v.refs, map);
  const who = humanList(refLabels.length ? refLabels : (v.refs || []).map((r) => r));
  const nets = v.nets?.length ? v.nets.join(", ") : undefined;

  const base = {
    techTitle: v.title,
    techDetail: v.detail,
    rule: v.rule,
    severity: v.severity,
    id: v.id,
    refs: v.refs,
    nets: v.nets,
    refLabels,
  };

  switch (v.rule) {
    case "VOLTAGE_DOMAIN":
      return {
        ...base,
        plainTitle: "Wrong voltage on a part",
        plainDetail: `Something that looks like a higher-voltage power wire is connected to ${who}, which only tolerates a lower voltage.`,
        plainFix: "Use the 3.3V pin for 3.3V parts (most OLEDs and ESP boards). Only use 5V when the part is clearly labeled 5V.",
        whyItMatters: "Too much voltage can permanently damage chips.",
      };
    case "VOLTAGE_DOMAIN_SIGNAL":
      return {
        ...base,
        plainTitle: "A 5V signal may be hitting a 3.3V pin",
        plainDetail: `A signal wire on ${nets || "this net"} mixes a higher-voltage driver with a fragile pin on ${who}.`,
        plainFix: "Add a level shifter or resistor divider on the high-voltage output (classic fix for ultrasonic ECHO → ESP32).",
        whyItMatters: "Logic pins can die even if power rails look fine.",
      };
    case "LIPO_PROTECTION":
      return {
        ...base,
        plainTitle: "Lithium battery needs a charger/protection board",
        plainDetail: `You have a Li-ion cell (${who}) but no TP4056/BMS-style protector in the plan.`,
        plainFix: "Add a protected charge module (e.g. TP4056 with DW01). Never charge a bare cell from USB.",
        whyItMatters: "Unprotected lithium cells can overheat or catch fire.",
      };
    case "LIPO_TOPOLOGY":
      return {
        ...base,
        plainTitle: "Battery and charger wiring is unclear",
        plainDetail: "We couldn't prove the cell +/− connects only to the charger battery pads.",
        plainFix: "Wire the cell only to BAT+/BAT− (or B+/B−) on the charger. Don't put raw USB 5V across the cell.",
        whyItMatters: "Wrong charge path is the #1 beginner Li-ion hazard.",
      };
    case "GND_CONNECTIVITY":
      return {
        ...base,
        plainTitle: "Not everything shares ground",
        plainDetail: refLabels.length
          ? `These parts don't show a ground connection yet: ${humanList(refLabels)}.`
          : "Modules need a shared black ground wire between them.",
        plainFix: "Connect every module's GND to the same ground (usually ESP32 GND).",
        whyItMatters: "Without shared ground, nothing talks reliably and power paths can float.",
      };
    case "I2C_BUS":
      return {
        ...base,
        plainTitle: "I2C data/clock bus incomplete",
        plainDetail: "Display/sensor parts need shared SDA and SCL wires to the microcontroller.",
        plainFix: "Wire all SDA pins together to one MCU pin, and all SCL pins to another. Use the same pins as the plan steps.",
        whyItMatters: "I2C screens and sensors stay blank if either wire is missing.",
      };
    case "I2C_PULLUP":
      return {
        ...base,
        plainTitle: "I2C pull-ups not mentioned",
        plainDetail: "Many modules already have pull-ups onboard — this is a heads-up, not a failure.",
        plainFix: "If the bus is flaky, add 4.7kΩ resistors from SDA and SCL to 3.3V.",
        whyItMatters: "Weak pull-ups cause intermittent I2C failures.",
      };
    case "PAD_MULTI_NET":
      return {
        ...base,
        plainTitle: "Same pin is listed on different wires",
        plainDetail: `Our wiring model put one pad on multiple nets${nets ? ` (${nets})` : ""}. That usually means messy labels, not a real short on the board.`,
        plainFix: "Use clear names like “ESP32 3.3V → OLED VCC” (one pin per wire end). Avoid vague “Battery +” when you also have a battery-level LED.",
        whyItMatters: "Conflicting pin maps make automated checks (and your build) unreliable.",
      };
    case "PAD_UNKNOWN":
      return {
        ...base,
        plainTitle: "A wire names a pin we don't recognize",
        plainDetail: `Check silkscreen for ${who}. The plan uses a pin label that isn't in our catalog pinout.`,
        plainFix: "Rename the connection to match the board (VCC, GND, SDA, SCL, SIG, BAT+, …).",
        whyItMatters: "Unknown pins can't be voltage-checked safely.",
      };
    case "NET_UNBOUND":
      return {
        ...base,
        plainTitle: "A wire couldn't be matched to parts",
        plainDetail: v.detail,
        plainFix: "Name both ends with part + pin (e.g. “ESP32-C3 GPIO4” → “OLED SDA”).",
        whyItMatters: "Unmatched wires are skipped by the electrical check.",
      };
    case "OUTPUT_CONTENTION":
      return {
        ...base,
        plainTitle: "Two outputs fighting on one wire",
        plainDetail: `More than one part is driving ${nets || "the same signal"}.`,
        plainFix: "Only one driver should own a wire unless the parts are designed as open-drain/I2C.",
        whyItMatters: "Output contention can damage GPIO pins.",
      };
    case "PINOUT_ASSUMED":
      return {
        ...base,
        plainTitle: "Pinout not fully verified",
        plainDetail: `We're guessing pin roles for ${who}.`,
        plainFix: "Check the silkscreen against the module photo/datasheet before power-on.",
        whyItMatters: "Wrong pin assumptions are a common brick risk.",
      };
    case "MPN_UNFROZEN":
      return {
        ...base,
        plainTitle: "Part number not frozen in catalog",
        plainDetail: `${who} is catalog-linked but lacks a manufacturer MPN.`,
        plainFix: "Optional for hobby builds; freeze an MPN when you care about exact reorder.",
        whyItMatters: "Procurement certainty for kits and production.",
      };
    default:
      return {
        ...base,
        plainTitle: v.title,
        plainDetail: v.detail,
        plainFix: v.mitigation,
        whyItMatters: "Flagged by the electrical rules check.",
      };
  }
}

export function presentErc(
  erc: ErcReport,
  components: ElectricalComponent[]
): {
  summaryPlain: string;
  summaryTech: string;
  errors: ErcAudienceView[];
  warnings: ErcAudienceView[];
  infos: ErcAudienceView[];
} {
  const map = refMap(components);
  const errors = erc.errors.map((e) => presentOne(e, map));
  const warnings = erc.warnings.map((w) => presentOne(w, map));
  const infos = erc.infos.map((i) => presentOne(i, map));

  const summaryPlain = erc.clean
    ? warnings.length === 0
      ? "Wiring looks good — no blocking problems found."
      : `No blocking problems. ${warnings.length} thing(s) to double-check before power-on.`
    : `${errors.length} problem(s) to fix before first power-on${warnings.length ? ` · ${warnings.length} warning(s)` : ""}.`;

  return {
    summaryPlain,
    summaryTech: erc.summary,
    errors,
    warnings,
    infos,
  };
}
