import type { BuildPlan, Part, WiringConnection } from "@/lib/types";
import { getModuleById, matchPart } from "@/lib/catalog";
import type {
  ElectricalComponent,
  ElectricalModel,
  ElectricalNet,
  ElectricalPin,
  NetClass,
  NetMember,
  PinRole,
  TrustGrade,
} from "./types";
import { runErc } from "./erc";

function pinRolesForCatalog(catalogId?: string, interfaceList?: string[]): ElectricalPin[] {
  const iface = interfaceList || [];
  if (catalogId === "esp32-c3" || catalogId === "esp32-devkit") {
    return [
      { name: "3V3", role: "power", domainV: 3.3, maxVoltage: 3.6 },
      { name: "5V", role: "power", domainV: 5, maxVoltage: 5.5 },
      { name: "GND", role: "gnd", domainV: 0 },
      { name: "VIN", role: "power", domainV: 5, maxVoltage: 6 },
      { name: "GPIO0", role: "digital_io", domainV: 3.3, maxVoltage: 3.6 },
      { name: "GPIO4", role: "i2c_sda", domainV: 3.3, maxVoltage: 3.6 },
      { name: "GPIO5", role: "i2c_scl", domainV: 3.3, maxVoltage: 3.6 },
      { name: "SDA", role: "i2c_sda", domainV: 3.3, maxVoltage: 3.6 },
      { name: "SCL", role: "i2c_scl", domainV: 3.3, maxVoltage: 3.6 },
    ];
  }
  if (catalogId === "ssd1306-i2c") {
    return [
      { name: "VCC", role: "power", domainV: 3.3, maxVoltage: 3.6 },
      { name: "GND", role: "gnd" },
      { name: "SDA", role: "i2c_sda", domainV: 3.3, maxVoltage: 3.6 },
      { name: "SCL", role: "i2c_scl", domainV: 3.3, maxVoltage: 3.6 },
    ];
  }
  if (catalogId === "sht31d" || catalogId === "bme280") {
    return [
      { name: "VCC", role: "power", domainV: 3.3, maxVoltage: 5.5 },
      { name: "GND", role: "gnd" },
      { name: "SDA", role: "i2c_sda", domainV: 3.3, maxVoltage: 5.5 },
      { name: "SCL", role: "i2c_scl", domainV: 3.3, maxVoltage: 5.5 },
    ];
  }
  if (catalogId === "hc-sr04") {
    return [
      { name: "VCC", role: "power", domainV: 5, maxVoltage: 5.5 },
      { name: "GND", role: "gnd" },
      { name: "TRIG", role: "digital_in", domainV: 5, maxVoltage: 5.5 },
      { name: "ECHO", role: "digital_out", domainV: 5, maxVoltage: 5.5 },
    ];
  }
  if (catalogId === "tp4056-protected") {
    return [
      { name: "IN+", role: "power", domainV: 5 },
      { name: "IN-", role: "gnd" },
      { name: "B+", role: "power", domainV: 4.2, maxVoltage: 4.2 },
      { name: "B-", role: "gnd" },
      { name: "OUT+", role: "power", domainV: 4.2, maxVoltage: 4.2 },
      { name: "OUT-", role: "gnd" },
      { name: "BAT+", role: "power", domainV: 4.2, maxVoltage: 4.2 },
      { name: "BAT-", role: "gnd" },
    ];
  }
  if (catalogId === "solar-panel-5v") {
    return [
      { name: "+", role: "power", domainV: 5, maxVoltage: 6 },
      { name: "-", role: "gnd" },
    ];
  }
  if (catalogId === "solar-charger") {
    return [
      { name: "IN+", role: "power", domainV: 5, maxVoltage: 6 },
      { name: "IN-", role: "gnd" },
      { name: "OUT+", role: "power", domainV: 4.2, maxVoltage: 4.2 },
      { name: "OUT-", role: "gnd" },
      { name: "BAT+", role: "power", domainV: 4.2, maxVoltage: 4.2 },
      { name: "BAT-", role: "gnd" },
    ];
  }
  if (catalogId === "battery-level-led") {
    return [
      { name: "+", role: "power", domainV: 3.7, maxVoltage: 4.2 },
      { name: "-", role: "gnd" },
    ];
  }
  if (catalogId === "touch-switch") {
    return [
      { name: "VCC", role: "power", domainV: 3.3, maxVoltage: 5.5 },
      { name: "GND", role: "gnd" },
      { name: "SIG", role: "digital_out", domainV: 3.3, maxVoltage: 5.5 },
      { name: "OUT", role: "digital_out", domainV: 3.3, maxVoltage: 5.5 },
    ];
  }
  if (catalogId === "nrf24l01") {
    return [
      { name: "VCC", role: "power", domainV: 3.3, maxVoltage: 3.6 },
      { name: "GND", role: "gnd" },
      { name: "CE", role: "digital_in", domainV: 3.3, maxVoltage: 3.6 },
      { name: "CSN", role: "digital_in", domainV: 3.3, maxVoltage: 3.6 },
      { name: "SCK", role: "digital_io", domainV: 3.3, maxVoltage: 3.6 },
      { name: "MOSI", role: "digital_io", domainV: 3.3, maxVoltage: 3.6 },
      { name: "MISO", role: "digital_out", domainV: 3.3, maxVoltage: 3.6 },
    ];
  }
  if (catalogId?.startsWith("battery-") || catalogId === "battery-16340" || catalogId === "battery-18650") {
    return [
      { name: "+", role: "power", domainV: 3.7, maxVoltage: 4.2 },
      { name: "-", role: "gnd" },
    ];
  }
  if (catalogId === "spdt-slide-switch") {
    // Passive 3-pin SPDT: CENTER (COM) is the pole; A/B are the throws. Modeled
    // as a 2-terminal series element in a power line (COM + one throw), so it
    // carries no voltage domain of its own — the domain is set by the net.
    return [
      { name: "COM", role: "passive" },
      { name: "A", role: "passive" },
      { name: "B", role: "passive" },
    ];
  }

  // Generic from interface list
  const pins: ElectricalPin[] = [
    { name: "VCC", role: "power", domainV: 3.3 },
    { name: "GND", role: "gnd" },
  ];
  if (iface.includes("i2c")) {
    pins.push({ name: "SDA", role: "i2c_sda", domainV: 3.3 });
    pins.push({ name: "SCL", role: "i2c_scl", domainV: 3.3 });
  }
  return pins;
}

function isMechanicalPart(p: Part): boolean {
  const id = p.catalogId || "";
  return ["bamboo-coaster", "brass-wire-1mm", "copper-tube-3mm", "jumper-wires", "breadboard"].includes(id);
}

export function assignRefs(parts: Part[]): ElectricalComponent[] {
  const components: ElectricalComponent[] = [];
  let u = 1;
  let bt = 1;

  for (const part of parts || []) {
    if (isMechanicalPart(part)) continue;

    const match = part.catalogId
      ? { module: getModuleById(part.catalogId), confidence: part.matchConfidence || "high" }
      : (() => {
          const m = matchPart(part);
          return { module: m.module, confidence: m.confidence };
        })();

    const mod = match.module;
    const catalogId = part.catalogId || mod?.id;
    const isCell = !!mod?.isLithiumCell || /16340|18650|li-?ion cell/i.test(`${part.name} ${part.specification}`);
    const ref = isCell ? `BT${bt++}` : `U${u++}`;

    const pinoutGrade: TrustGrade =
      match.confidence === "high" && catalogId ? "verified" : match.confidence === "medium" ? "derived" : "assumed";

    const pins = pinRolesForCatalog(catalogId, mod?.interface);
    // Ensure maxIO from module
    const maxIO = mod?.maxIOVoltage ?? undefined;
    const logic = mod?.logicVoltage ?? undefined;
    const enrichedPins = pins.map((p) => ({
      ...p,
      maxVoltage: p.maxVoltage ?? (p.role === "gnd" ? 0 : maxIO ?? undefined),
      domainV: p.domainV ?? (p.role === "gnd" ? 0 : logic ?? undefined),
    }));

    components.push({
      ref,
      partId: part.id,
      name: part.name,
      catalogId,
      matchConfidence: String(match.confidence),
      pinoutGrade,
      pins: enrichedPins,
      isLithiumCell: isCell,
      providesChargeProtection: !!mod?.providesProtection,
      logicVoltage: mod?.logicVoltage,
      maxIOVoltage: mod?.maxIOVoltage,
    });
  }
  return components;
}

const KNOWN_PIN_TOKEN =
  /^(GPIO\d+|3\.?3V|3V3|5V|GND|VIN|VCC|SDA|SCL|SIG|OUT|ECHO|TRIG|IN\+|IN-|B\+|B-|BAT\+|BAT-|\+|CE|CSN|SCK|MOSI|MISO)$/i;

/**
 * Parse free-text endpoint like "ESP32-C3 5V" or "OLED VCC".
 * Prefer the last whitespace-separated token so device hyphens (ESP32-C3)
 * never steal bare +/- pin matches.
 */
function parseEndpoint(ep: string): { deviceHint: string; pinToken: string } {
  const trimmed = ep.trim();
  const upper = trimmed.toUpperCase();
  const parts = upper.split(/\s+/).filter(Boolean);
  const tail = (parts[parts.length - 1] || "").replace(/\s+/g, "");

  let pinToken: string | undefined;
  if (KNOWN_PIN_TOKEN.test(tail)) {
    pinToken = tail === "3.3V" ? "3V3" : tail;
  } else {
    pinToken =
      upper.match(/\b(GPIO\s*\d+)\b/)?.[1].replace(/\s+/g, "") ||
      // No bare +/- — those only match as whole last token above
      upper.match(/\b(3\.?3V|3V3|5V|GND|VIN|VCC|SDA|SCL|SIG|OUT|ECHO|TRIG|IN\+|IN-|B\+|B-|BAT\+|BAT-)\b/)?.[1] ||
      upper.match(/\(([^)]+)\)/)?.[1]?.replace(/\s+/g, "") ||
      "UNKNOWN";
  }

  // Device hint is everything before the pin token when pin was trailing
  let deviceHint = trimmed;
  if (KNOWN_PIN_TOKEN.test(tail) && parts.length > 1) {
    deviceHint = trimmed.replace(/\s+\S+\s*$/, "").trim();
  }
  deviceHint = deviceHint.replace(/\(.*?\)/g, "").trim().toLowerCase();

  return { deviceHint, pinToken: pinToken.replace(/\s+/g, "").toUpperCase() };
}

function resolveRef(hint: string, full: string, components: ElectricalComponent[]): ElectricalComponent | null {
  const h = `${hint} ${full}`.toLowerCase();
  const score = (c: ElectricalComponent) => {
    let s = 0;
    const n = `${c.name} ${c.catalogId || ""}`.toLowerCase();
    if (h.includes("esp32") && n.includes("esp32")) s += 10;
    if ((h.includes("oled") || h.includes("display") || h.includes("ssd")) && (n.includes("oled") || n.includes("ssd"))) s += 10;
    if (h.includes("sht") && n.includes("sht")) s += 10;
    if (h.includes("touch") && n.includes("touch")) s += 10;
    // Prefer TP4056 over generic "charg" when named
    if (h.includes("tp4056") && (n.includes("tp4056") || c.catalogId === "tp4056-protected")) s += 14;
    if (
      (h.includes("solar charg") || h.includes("charging controller") || h.includes("solar controller")) &&
      (n.includes("solar") && n.includes("charg"))
    )
      s += 12;
    if ((h.includes("charg") || h.includes("tp4056")) && (n.includes("tp4056") || n.includes("charg"))) s += 8;
    if (h.includes("solar panel") && n.includes("solar-panel")) s += 12;
    if (h.includes("solar") && n.includes("solar") && !h.includes("charg")) s += 8;
    // "Battery +" → cell, not "Battery Level Indicator"
    if (
      (/\bbattery\b/.test(h) || h.includes("li-ion") || h.includes("16340") || h.includes("18650")) &&
      !h.includes("level") &&
      !h.includes("indicator") &&
      !h.includes("led")
    ) {
      if (c.isLithiumCell) s += 16;
      else if (n.includes("level") || n.includes("indicator") || c.catalogId === "battery-level-led") s -= 8;
      else if (n.includes("battery")) s += 4;
    }
    if ((h.includes("level") || h.includes("indicator")) && (n.includes("level") || n.includes("indicator"))) s += 12;
    if (h.includes("bme") && n.includes("bme")) s += 10;
    if (h.includes("nrf") && n.includes("nrf")) s += 10;
    for (const w of c.name.toLowerCase().split(/\s+/)) {
      if (w.length > 3 && h.includes(w)) s += 2;
    }
    return s;
  };
  let best: ElectricalComponent | null = null;
  let bestS = 0;
  for (const c of components) {
    const s = score(c);
    if (s > bestS) {
      bestS = s;
      best = c;
    }
  }
  return bestS >= 2 ? best : null;
}

function normalizePinName(token: string, comp: ElectricalComponent): string {
  const t = token.toUpperCase().replace(/\s+/g, "");
  // Direct match
  const exact = comp.pins.find((p) => p.name.toUpperCase() === t);
  if (exact) return exact.name;
  // GPIO4 etc. on MCU
  if (/^GPIO\d+$/.test(t)) {
    const g = comp.pins.find((p) => p.name.toUpperCase() === t);
    if (g) return g.name;
    // invent digital pin for ERC
    return t;
  }
  if (t === "3.3V" || t === "3V3") {
    return comp.pins.find((p) => /3V3|3\.3V/i.test(p.name))?.name || "3V3";
  }
  if (t === "5V") {
    return comp.pins.find((p) => /^5V$/i.test(p.name) || p.name === "VIN")?.name || "5V";
  }
  if (t === "SIG" || t === "SIGNAL") return comp.pins.find((p) => p.name === "SIG" || p.name === "OUT")?.name || "SIG";
  // Single-letter silkscreen (R3-lite, Slice 2): tiny boards abbreviate —
  // the real build's ESP32-C3 clone printed "G" where the plan said "GND"
  // ("i did GND to G what next"). Only bind when the component actually HAS
  // the matching pin: a bare letter must never invent a pin, and "D"/"C"/"S"
  // stay data-direction-safe by matching against the canonical pin list.
  if (t === "G" || t === "GND" || t === "GROUND" || t === "VSS" || t === "-" || t === "−") {
    const gnd = comp.pins.find((p) => /^(GND|GROUND|VSS|-|−)$/i.test(p.name));
    if (gnd) return gnd.name;
    if (t !== "G") return t; // non-G spellings keep today's fallthrough shape
  }
  if (t === "V" || t === "VCC" || t === "VDD" || t === "+") {
    const pwr = comp.pins.find((p) => /^(VCC|VDD|3V3|3\.3V|VIN|\+)$/i.test(p.name));
    if (pwr) return pwr.name;
    if (t !== "V") return t;
  }
  if (t === "D" || t === "SDA" || t === "DA") {
    const sda = comp.pins.find((p) => /SDA/i.test(p.name));
    if (sda) return sda.name;
    if (t !== "D" && t !== "DA") return t;
  }
  if (t === "C" || t === "SCL" || t === "CL" || t === "SCK") {
    const scl = comp.pins.find((p) => /SCL|SCK/i.test(p.name));
    if (scl) return scl.name;
    if (t !== "C" && t !== "CL") return t;
  }
  if (t === "S") {
    const sig = comp.pins.find((p) => /^(SIG|OUT|S)$/i.test(p.name));
    if (sig) return sig.name;
  }
  if (t === "BAT+" || t === "B+") return comp.pins.find((p) => /B\+|BAT\+/i.test(p.name))?.name || t;
  if (t === "BAT-" || t === "B-") return comp.pins.find((p) => /B-|BAT-/i.test(p.name))?.name || t;
  if (t === "OUT+" || t === "OUT") return comp.pins.find((p) => /OUT\+|BAT\+/i.test(p.name))?.name || t;
  if (t === "OUT-") return comp.pins.find((p) => /OUT-|BAT-/i.test(p.name))?.name || t;
  // Fuzzy
  const fuzzy = comp.pins.find((p) => t.includes(p.name.toUpperCase()) || p.name.toUpperCase().includes(t));
  return fuzzy?.name || t;
}

function pinMeta(comp: ElectricalComponent, pinName: string): ElectricalPin {
  const found = comp.pins.find((p) => p.name.toUpperCase() === pinName.toUpperCase());
  if (found) return found;
  // Synthesized GPIO
  if (/^GPIO\d+$/i.test(pinName)) {
    return {
      name: pinName.toUpperCase(),
      role: "digital_io",
      domainV: comp.logicVoltage ?? 3.3,
      maxVoltage: comp.maxIOVoltage ?? 3.6,
    };
  }
  return { name: pinName, role: "unknown" };
}

function classifyNet(name: string, members: NetMember[]): NetClass {
  if (name === "GND" || members.every((m) => m.role === "gnd")) return "gnd";
  if (name === "3V3" || name === "5V" || name.startsWith("V") || members.some((m) => m.role === "power" && m.pin.match(/VCC|3V3|5V|VIN|\+/i))) {
    if (name === "GND") return "gnd";
    return "power";
  }
  if (name === "SDA" || name === "SCL" || members.some((m) => m.role === "i2c_sda" || m.role === "i2c_scl")) return "i2c";
  if (members.some((m) => m.role !== "unknown" && m.role !== "passive")) return "signal";
  return "unknown";
}

function netNameFor(a: NetMember, b: NetMember, fallback: string): { name: string; grade: TrustGrade } {
  const pins = `${a.pin} ${b.pin} ${a.role} ${b.role}`.toUpperCase();
  if (/\bGND\b/.test(pins) || a.role === "gnd" || b.role === "gnd") return { name: "GND", grade: "derived" };
  if (/3\.?3V|3V3/.test(pins)) return { name: "3V3", grade: "derived" };
  if (/\b5V\b/.test(pins)) return { name: "5V", grade: "derived" };
  if (a.role === "i2c_sda" || b.role === "i2c_sda" || /\bSDA\b/.test(pins)) return { name: "SDA", grade: "derived" };
  if (a.role === "i2c_scl" || b.role === "i2c_scl" || /\bSCL\b/.test(pins)) return { name: "SCL", grade: "derived" };
  return { name: fallback, grade: "assumed" };
}

function resolveStructuredRef(
  refToken: string,
  components: ElectricalComponent[],
  parts: Part[]
): ElectricalComponent | null {
  const t = refToken.trim();
  // Exact designator
  const byRef = components.find((c) => c.ref.toUpperCase() === t.toUpperCase());
  if (byRef) return byRef;
  // part id
  const byPartId = components.find((c) => c.partId === t);
  if (byPartId) return byPartId;
  // catalog id
  const byCat = components.find((c) => c.catalogId === t);
  if (byCat) return byCat;
  // name / fuzzy via existing resolver
  return resolveRef(t, t, components);
}

function addMemberToBucket(
  netBuckets: Map<string, { members: NetMember[]; grade: TrustGrade }>,
  name: string,
  grade: TrustGrade,
  members: NetMember[]
) {
  const bucket = netBuckets.get(name) || { members: [], grade };
  if (grade === "verified" || (grade === "derived" && bucket.grade === "assumed")) {
    bucket.grade = grade;
  }
  const key = (m: NetMember) => `${m.ref}.${m.pin}`;
  const seen = new Set(bucket.members.map(key));
  for (const m of members) {
    if (!seen.has(key(m))) {
      bucket.members.push(m);
      seen.add(key(m));
    }
  }
  netBuckets.set(name, bucket);
}

/**
 * Build formal electrical model.
 * Prefer plan.structuredNets (LLM/canonical); fall back to free-text wiringConnections.
 */
export function buildElectricalModel(plan: BuildPlan): ElectricalModel {
  const components = assignRefs(plan.parts || []);
  // Stamp refs onto a copy used only for model (plan.parts updated in attachElectrical)
  const unboundEdges: ElectricalModel["unboundEdges"] = [];
  const netBuckets = new Map<string, { members: NetMember[]; grade: TrustGrade }>();

  const ensureCompPin = (comp: ElectricalComponent, pinName: string) => {
    if (!comp.pins.some((p) => p.name.toUpperCase() === pinName.toUpperCase())) {
      comp.pins.push(pinMeta(comp, pinName));
    }
  };

  const useStructured = Array.isArray(plan.structuredNets) && plan.structuredNets.length > 0;

  if (useStructured) {
    plan.structuredNets!.forEach((sn, i) => {
      const members: NetMember[] = [];
      for (const sm of sn.members || []) {
        const comp = resolveStructuredRef(sm.ref, components, plan.parts || []);
        if (!comp) {
          unboundEdges.push({
            from: `${sm.ref}.${sm.pin}`,
            to: sn.name,
            reason: `structured ref unbound: ${sm.ref}`,
          });
          continue;
        }
        const pin = normalizePinName(sm.pin, comp);
        ensureCompPin(comp, pin);
        const meta = pinMeta(comp, pin);
        members.push({
          ref: comp.ref,
          pin,
          role: meta.role,
          domainV: meta.domainV,
          maxVoltage: meta.maxVoltage,
        });
      }
      if (members.length === 0) return;
      const name = sn.name || `N$${i}`;
      // Structured nets from LLM/catalog path are "derived" (or verified if all members verified)
      const allVerified = members.every((m) => {
        const c = components.find((x) => x.ref === m.ref);
        return c?.pinoutGrade === "verified";
      });
      addMemberToBucket(netBuckets, name, allVerified ? "verified" : "derived", members);
    });
  } else {
    (plan.wiringConnections || []).forEach((c: WiringConnection, i: number) => {
      const pa = parseEndpoint(c.from);
      const pb = parseEndpoint(c.to);
      const ca = resolveRef(pa.deviceHint, c.from, components);
      const cb = resolveRef(pb.deviceHint, c.to, components);

      if (!ca || !cb) {
        unboundEdges.push({
          from: c.from,
          to: c.to,
          reason: !ca && !cb ? "neither endpoint bound" : !ca ? `unbound: ${c.from}` : `unbound: ${c.to}`,
        });
        return;
      }

      const pinA = normalizePinName(pa.pinToken, ca);
      const pinB = normalizePinName(pb.pinToken, cb);
      ensureCompPin(ca, pinA);
      ensureCompPin(cb, pinB);

      const metaA = pinMeta(ca, pinA);
      const metaB = pinMeta(cb, pinB);

      const memberA: NetMember = {
        ref: ca.ref,
        pin: pinA,
        role: metaA.role,
        domainV: metaA.domainV,
        maxVoltage: metaA.maxVoltage,
      };
      const memberB: NetMember = {
        ref: cb.ref,
        pin: pinB,
        role: metaB.role,
        domainV: metaB.domainV,
        maxVoltage: metaB.maxVoltage,
      };

      const { name, grade } = netNameFor(memberA, memberB, `N$${i}`);
      addMemberToBucket(netBuckets, name, grade, [memberA, memberB]);
    });
  }

  const nets: ElectricalNet[] = [...netBuckets.entries()].map(([name, b]) => ({
    name,
    netClass: (plan.structuredNets?.find((s) => s.name === name)?.netClass as NetClass) || classifyNet(name, b.members),
    members: b.members,
    grade: b.grade,
  }));

  const modelWithoutErc: Omit<ElectricalModel, "erc"> = {
    components,
    nets,
    unboundEdges,
    builtAt: new Date().toISOString(),
  };

  const erc = runErc(modelWithoutErc, plan);

  return { ...modelWithoutErc, erc };
}

/** Derive structuredNets from a finished electrical model (for demos / legacy free-text plans). */
export function structuredNetsFromModel(model: ElectricalModel): import("@/lib/types").StructuredNet[] {
  return model.nets.map((n) => ({
    name: n.name,
    netClass: n.netClass,
    members: n.members.map((m) => ({ ref: m.ref, pin: m.pin })),
  }));
}
