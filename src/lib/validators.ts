import type { BuildPlan, Part, WiringConnection } from "./types";
import { getModuleById, matchPart, type CatalogModule } from "./catalog";

export type SafetySeverity = "critical" | "warning" | "info";

export interface SafetyFinding {
  id: string;
  severity: SafetySeverity;
  title: string;
  detail: string;
  mitigation?: string;
}

export interface SafetyReport {
  findings: SafetyFinding[];
  hazardTags: string[];
  /** True when a critical finding requires builder attention before power-on */
  requiresAttention: boolean;
}

function blob(plan: BuildPlan): string {
  const parts = (plan.parts || []).map((p) => `${p.name} ${p.specification} ${p.notes || ""}`).join(" ");
  const steps = (plan.steps || []).map((s) => `${s.title} ${s.description}`).join(" ");
  const warnings = (plan.warnings || []).join(" ");
  return `${plan.title} ${plan.description} ${parts} ${steps} ${warnings}`.toLowerCase();
}

function resolvedModules(parts: Part[]): { part: Part; mod: CatalogModule }[] {
  const out: { part: Part; mod: CatalogModule }[] = [];
  for (const part of parts || []) {
    if (part.catalogId) {
      const mod = getModuleById(part.catalogId);
      if (mod) out.push({ part, mod });
      continue;
    }
    const m = matchPart(part);
    if (m.module && (m.confidence === "high" || m.confidence === "medium")) {
      out.push({ part, mod: m.module });
    }
  }
  return out;
}

function hasProtection(parts: Part[], mods: { part: Part; mod: CatalogModule }[]): boolean {
  if (mods.some(({ mod }) => mod.providesProtection)) return true;
  const text = parts.map((p) => `${p.name} ${p.specification}`).join(" ").toLowerCase();
  return /\b(tp4056|bms|dw01|protection circuit|battery management|protected cell|protected battery)\b/.test(text);
}

function hasLithium(mods: { part: Part; mod: CatalogModule }[], text: string): boolean {
  if (mods.some(({ mod }) => mod.isLithiumCell || mod.hazards.includes("LIPO"))) return true;
  return /\b(li-?ion|li-?po|lithium|16340|18650|21700|lipo)\b/.test(text);
}

/** Extract GPIO-like identifiers from wiring endpoints for conflict detection. */
export function extractPinKeys(endpoint: string): string[] {
  const keys: string[] = [];
  const s = endpoint.toUpperCase();
  const gpio = s.matchAll(/\bGPIO\s*(\d+)\b/g);
  for (const m of gpio) keys.push(`GPIO${m[1]}`);
  const bare = s.matchAll(/\b(?:PIN\s*)?(\d+)\s*\(/g);
  for (const m of bare) {
    // only if it looks like a pin label in parentheses form "Pin 2 ("
  }
  const pinN = s.matchAll(/\bPIN\s*(\d+)\b/g);
  for (const m of pinN) keys.push(`PIN${m[1]}`);
  // Named power nets are shared intentionally
  if (/\bGND\b/.test(s)) keys.push("GND");
  if (/\b3\.?3V\b/.test(s) || /\b3V3\b/.test(s)) keys.push("3V3");
  if (/\b5V\b/.test(s)) keys.push("5V");
  if (/\bSDA\b/.test(s)) keys.push(`SDA:${s}`);
  if (/\bSCL\b/.test(s)) keys.push(`SCL:${s}`);
  return keys;
}

function detectPinConflicts(connections: WiringConnection[]): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  // Map signal pins (GPIO*) to the set of "other ends"
  const gpioUse = new Map<string, string[]>();

  for (const c of connections || []) {
    const from = c.from || "";
    const to = c.to || "";
    const fromKeys = extractPinKeys(from).filter((k) => k.startsWith("GPIO"));
    const toKeys = extractPinKeys(to).filter((k) => k.startsWith("GPIO"));

    for (const g of fromKeys) {
      const list = gpioUse.get(g) || [];
      list.push(to);
      gpioUse.set(g, list);
    }
    for (const g of toKeys) {
      const list = gpioUse.get(g) || [];
      list.push(from);
      gpioUse.set(g, list);
    }
  }

  for (const [gpio, uses] of gpioUse) {
    const unique = [...new Set(uses.map((u) => u.toLowerCase()))];
    // I2C bus legitimately fans out SDA/SCL to multiple devices — skip if all mentions are SDA or SCL only
    const allI2c = unique.every((u) => /\b(sda|scl|oled|sht|bme|display|sensor)\b/.test(u));
    if (unique.length >= 3 && !allI2c) {
      findings.push({
        id: `pin-conflict-${gpio}`,
        severity: "warning",
        title: `${gpio} appears heavily shared`,
        detail: `${gpio} connects to: ${uses.slice(0, 5).join("; ")}. Shared power/I2C buses are fine; conflicting digital functions are not.`,
        mitigation: "Confirm this pin is intentionally a bus (I2C/SPI) or reassign unique GPIOs per device.",
      });
    }
  }
  return findings;
}

function oledOn5V(connections: WiringConnection[]): boolean {
  // Only trust explicit wiring edges — free text often mentions "5V solar" near "OLED"
  for (const c of connections || []) {
    const pair = `${c.from} → ${c.to}`.toLowerCase();
    const involvesOled = /\boled\b/.test(pair);
    const involves5v = /\b5\s*v\b|\b5v\b/.test(pair);
    const powerNet = /\b(vcc|vin|\+)\b/.test(pair) || /\b5\s*v\b|\b5v\b/.test(pair);
    if (involvesOled && involves5v && powerNet) return true;
  }
  return false;
}

/**
 * Hardcoded safety analysis — no LLM.
 * Runs after plan generation / on demo load.
 */
export function validatePlan(plan: BuildPlan): SafetyReport {
  const findings: SafetyFinding[] = [];
  const hazardTags = new Set<string>();
  const text = blob(plan);
  const parts = plan.parts || [];
  const mods = resolvedModules(parts);

  for (const { mod } of mods) {
    for (const h of mod.hazards || []) hazardTags.add(h);
  }
  if (hasLithium(mods, text)) hazardTags.add("LIPO");
  if (/\b(mains|120v|240v|wall outlet|ac line|110v)\b/.test(text)) hazardTags.add("MAINS");
  if (mods.some(({ mod }) => mod.hazards.includes("ESD_SENSITIVE")) || /\besp32|oled|cmos\b/.test(text)) {
    hazardTags.add("ESD_SENSITIVE");
  }

  // 1) Li-ion without protection path
  if (hasLithium(mods, text) && !hasProtection(parts, mods)) {
    findings.push({
      id: "lipo-no-protection",
      severity: "critical",
      title: "Lithium battery without a clear protection/charge path",
      detail:
        "This plan includes a Li-ion/LiPo cell but no TP4056 (with protection), BMS, or protected-cell path was found in the parts list.",
      mitigation:
        "Add a protected TP4056 board (DW01 + MOSFET) or a 1S BMS, or use a protected cell in a proper holder. Never charge a bare cell from USB directly.",
    });
  } else if (hasLithium(mods, text)) {
    findings.push({
      id: "lipo-present",
      severity: "warning",
      title: "Lithium battery project",
      detail: "Li-ion cells can fire if shorted, crushed, or charged incorrectly.",
      mitigation: "Charge only through the designed charge path. Do not leave charging unattended on wood or fabric.",
    });
  }

  // 2) HC-SR04 + 3.3V MCU
  const hasHcsr04 = mods.some(({ mod }) => mod.id === "hc-sr04") || /\bhc-?sr04\b/.test(text);
  const has33Mcu = mods.some(({ mod }) => mod.logicVoltage === 3.3 && mod.category === "mcu");
  if (hasHcsr04 && has33Mcu) {
    findings.push({
      id: "hcsr04-5v-echo",
      severity: "critical",
      title: "HC-SR04 ECHO can damage 3.3V MCUs",
      detail:
        "HC-SR04 ECHO outputs a 5V signal. ESP32, ESP32-C3, and Pico GPIOs are not 5V tolerant.",
      mitigation: "Use a resistor voltage divider on ECHO (e.g. 1k + 2k), a level shifter, or a 3.3V ultrasonic module.",
    });
  }

  // 3) OLED powered from 5V (wiring only — avoids "5V solar" false positives)
  if (oledOn5V(plan.wiringConnections || [])) {
    findings.push({
      id: "oled-5v",
      severity: "critical",
      title: "OLED may be wired to 5V",
      detail: "Many SSD1306 modules are damaged or unreliable when VCC is 5V.",
      mitigation: "Wire OLED VCC to 3.3V only. Use red wire from the MCU 3.3V pin.",
    });
  }

  // 4) nRF24 at 5V risk
  if (mods.some(({ mod }) => mod.id === "nrf24l01") && /\bnrf24\b.{0,30}\b5v\b|\b5v\b.{0,30}\bnrf24\b/.test(text)) {
    findings.push({
      id: "nrf24-5v",
      severity: "critical",
      title: "nRF24L01 must not be powered from 5V",
      detail: "The nRF24L01+ is a 3.3V-only radio. 5V on VCC often kills the module instantly.",
      mitigation: "Power VCC from 3.3V with a solid supply and decoupling capacitor.",
    });
  }

  // 5) Mains
  if (hazardTags.has("MAINS")) {
    findings.push({
      id: "mains",
      severity: "critical",
      title: "Mains / wall-voltage content detected",
      detail: "Projects involving mains AC are outside safe DIY guidance for beginners.",
      mitigation: "Use a pre-certified USB or wall adapter. Do not wire AC mains on a breadboard.",
    });
  }

  // 6) I2C devices — pull-up awareness
  const i2cMods = mods.filter(({ mod }) => mod.interface?.includes("i2c") || mod.requiresPullups);
  if (i2cMods.length >= 1 && !/\bpull-?up\b/.test(text)) {
    findings.push({
      id: "i2c-pullups",
      severity: "info",
      title: "I2C pull-ups not mentioned",
      detail: "I2C needs pull-up resistors on SDA and SCL. Many modules include them onboard.",
      mitigation: "If the bus is flaky, add 4.7kΩ pull-ups from SDA and SCL to 3.3V (one set per bus).",
    });
  }

  // 7) Pin conflicts
  findings.push(...detectPinConflicts(plan.wiringConnections || []));

  // 8) Catalog coverage
  const unmatched = parts.filter((p) => !p.catalogId || p.matchConfidence === "none" || p.matchConfidence === "low");
  if (parts.length > 0 && unmatched.length === parts.length) {
    findings.push({
      id: "catalog-none",
      severity: "info",
      title: "No parts matched the trusted module catalog",
      detail: "Pinouts and voltage rules could not be auto-verified. Treat wiring as ASSUMED.",
      mitigation: "Double-check every pin against module silkscreen and datasheets.",
    });
  } else if (unmatched.length > 0) {
    findings.push({
      id: "catalog-partial",
      severity: "info",
      title: `${unmatched.length} part(s) not confidently matched`,
      detail: unmatched.map((p) => p.name).slice(0, 6).join(", "),
      mitigation: "Unmatched parts rely on the AI description — verify specs before buying.",
    });
  }

  // Collect footguns as info
  for (const { part, mod } of mods) {
    if (mod.footguns?.length && (part.matchConfidence === "high" || part.matchConfidence === "medium")) {
      findings.push({
        id: `footgun-${mod.id}`,
        severity: "info",
        title: `Known gotcha: ${mod.name}`,
        detail: mod.footguns[0],
        mitigation: mod.footguns.slice(1).join(" ") || undefined,
      });
    }
  }

  // Dedupe by id
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  // Severity sort: critical → warning → info
  const rank = { critical: 0, warning: 1, info: 2 };
  deduped.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    findings: deduped,
    hazardTags: [...hazardTags],
    requiresAttention: deduped.some((f) => f.severity === "critical"),
  };
}

/**
 * Merge validator warnings into plan.warnings without duplicating.
 */
export function applySafetyToPlan(plan: BuildPlan, report: SafetyReport): BuildPlan {
  const existing = plan.warnings || [];
  const injected = report.findings
    .filter((f) => f.severity === "critical" || f.severity === "warning")
    .map((f) => `${f.title}: ${f.detail}${f.mitigation ? ` → ${f.mitigation}` : ""}`);

  const warnings = [...existing];
  for (const w of injected) {
    if (!warnings.some((e) => e.slice(0, 40) === w.slice(0, 40))) warnings.push(w);
  }

  return {
    ...plan,
    warnings,
    safetyReport: report,
    hazardTags: report.hazardTags,
  };
}
