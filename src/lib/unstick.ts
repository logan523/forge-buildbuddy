import type { BuildPlan, BuildStep, Part } from "./types";
import { stepKind } from "./steps/classify";

export type SymptomId =
  | "blank_display"
  | "no_upload"
  | "no_wifi"
  | "no_power"
  | "smoke_heat"
  | "sensor_wrong"
  | "touch_dead"
  | "battery_charge"
  | "mechanical"
  | "general";

export interface SymptomOption {
  id: SymptomId;
  label: string;
  emoji: string;
  hint: string;
}

export interface DiagnosisAction {
  order: number;
  action: string;
  expect: string;
  ifFail?: string;
  /**
   * Tags this action as PURELY about wire continuity on these nets (e.g.
   * ["sda","scl"]) — lets src/lib/serial/bus-proof.ts's filterDiagnosesByProof
   * skip an action a sibling device on the same shared bus already proved.
   * Optional; every action with no hint renders exactly as before. Only
   * tag actions with no software/config component — "swap these wires" is
   * a wire check, "set the library address" is not.
   */
  netHint?: string[];
}

export type Likelihood = "very_likely" | "likely" | "possible";

export interface Diagnosis {
  id: string;
  title: string;
  likelihood: Likelihood;
  score: number;
  cause: string;
  isolation?: string;
  actions: DiagnosisAction[];
  source: "catalog" | "step" | "topology" | "generic";
}

const SYMPTOMS: SymptomOption[] = [
  { id: "blank_display", label: "Display is blank", emoji: "🖥", hint: "OLED stays black or white noise" },
  { id: "no_upload", label: "Can't upload code", emoji: "💻", hint: "Port missing, upload fails, wrong board" },
  { id: "no_wifi", label: "Wi-Fi won't connect", emoji: "📶", hint: "Stuck connecting or wrong time" },
  { id: "no_power", label: "Board won't power on", emoji: "⚡", hint: "No LEDs, dead USB, resets forever" },
  { id: "smoke_heat", label: "Heat, smell, or smoke", emoji: "🔥", hint: "Stop immediately — safety first" },
  { id: "sensor_wrong", label: "Sensor reads wrong / zero", emoji: "🌡", hint: "Temp stuck, humidity 0, no change" },
  { id: "touch_dead", label: "Touch / button dead", emoji: "🔘", hint: "Always on or never triggers" },
  { id: "battery_charge", label: "Battery won't charge", emoji: "🔋", hint: "Solar/USB charge LED never on" },
  { id: "mechanical", label: "Parts don't fit / frame crooked", emoji: "🛠", hint: "Holes, bends, mounting" },
  { id: "general", label: "Something else", emoji: "❓", hint: "Walk me through isolation" },
];

function planBlob(plan: BuildPlan, step?: BuildStep): string {
  const parts = (plan.parts || []).map((p) => `${p.name} ${p.specification} ${p.catalogId || ""}`).join(" ");
  const stepText = step ? `${step.title} ${step.description}` : "";
  const wiring = (plan.wiringConnections || []).map((c) => `${c.from} ${c.to}`).join(" ");
  return `${plan.title} ${plan.description} ${parts} ${stepText} ${wiring}`.toLowerCase();
}

function hasCatalog(parts: Part[], ...ids: string[]): boolean {
  return parts.some((p) => p.catalogId && ids.includes(p.catalogId));
}

function hasText(blob: string, ...needles: string[]): boolean {
  return needles.some((n) => blob.includes(n));
}

// Step classification lives in src/lib/steps/classify.ts (one authority,
// R1 goldens pin equivalence with the previous local copy).

/** Symptoms that make sense for this plan/step — hide irrelevant ones. */
export function relevantSymptoms(plan: BuildPlan, step?: BuildStep): SymptomOption[] {
  const blob = planBlob(plan, step);
  const parts = plan.parts || [];
  const kind = stepKind(step);
  const out: SymptomOption[] = [];

  const push = (id: SymptomId) => {
    const s = SYMPTOMS.find((x) => x.id === id);
    if (s && !out.some((o) => o.id === id)) out.push(s);
  };

  // Always available
  push("no_power");
  push("smoke_heat");
  push("general");

  if (hasCatalog(parts, "ssd1306-i2c") || hasText(blob, "oled", "ssd1306", "display")) push("blank_display");
  if (hasCatalog(parts, "esp32-c3", "esp32-devkit", "arduino-nano", "raspberry-pi-pico") || hasText(blob, "esp32", "arduino", "upload")) {
    push("no_upload");
  }
  if (hasText(blob, "wifi", "wi-fi", "ssid", "ntp", "network")) push("no_wifi");
  if (hasCatalog(parts, "sht31d", "dht22", "bme280", "hc-sr04") || hasText(blob, "sensor", "humidity", "temperature")) {
    push("sensor_wrong");
  }
  if (hasCatalog(parts, "touch-switch") || hasText(blob, "touch", "button")) push("touch_dead");
  if (
    hasCatalog(parts, "battery-16340", "battery-18650", "tp4056-protected", "solar-charger", "solar-panel-5v") ||
    hasText(blob, "battery", "charge", "solar", "tp4056")
  ) {
    push("battery_charge");
  }
  if (kind === "mechanical" || hasText(blob, "brass", "bamboo", "frame", "drill")) push("mechanical");

  // Software steps prioritize upload/wifi
  if (kind === "software") {
    return [SYMPTOMS.find((s) => s.id === "no_upload")!, SYMPTOMS.find((s) => s.id === "no_wifi")!, ...out.filter((s) => !["no_upload", "no_wifi"].includes(s.id))].filter(Boolean);
  }

  return out;
}

function rank(likelihood: Likelihood): number {
  return likelihood === "very_likely" ? 100 : likelihood === "likely" ? 70 : 40;
}

function d(
  partial: Omit<Diagnosis, "score"> & { likelihood: Likelihood }
): Diagnosis {
  return { ...partial, score: rank(partial.likelihood) };
}

/**
 * Ranked diagnosis trees for a symptom in the context of this plan/step.
 * Pure TypeScript — no LLM. Merges step commonMistakes when present.
 */
/**
 * Reality-aware trim (Slice 3, V2): drop checklist actions that are purely
 * about wire continuity on nets the builder's own reality already PROVED
 * (every joint on the net verified at instrument/assisted tier). Mirrors
 * filterDiagnosesByProof's contract exactly: never empties a checklist,
 * trimmed diagnoses sort last, orders renumber.
 */
export function filterDiagnosesByReality(
  diagnoses: Diagnosis[],
  reality: import("./build-reality/types").BuildReality | undefined
): Diagnosis[] {
  if (!reality) return diagnoses;
  const byNet = new Map<string, { total: number; verified: number }>();
  for (const j of Object.values(reality.joints)) {
    if (j.state === "removed") continue;
    const key = j.netName.toLowerCase();
    const row = byNet.get(key) ?? { total: 0, verified: 0 };
    row.total++;
    if (j.state === "verified" && j.evidence && j.evidence.tier !== "self-report") row.verified++;
    byNet.set(key, row);
  }
  const proven = new Set(
    [...byNet.entries()].filter(([, r]) => r.total > 0 && r.verified === r.total).map(([k]) => k)
  );
  if (proven.size === 0) return diagnoses;

  const withTrim = diagnoses.map((d) => {
    const kept = d.actions.filter(
      (a) => !(a.netHint && a.netHint.length > 0 && a.netHint.every((t) => proven.has(t.toLowerCase())))
    );
    const trimmed = kept.length < d.actions.length;
    const finalActions = (kept.length > 0 ? kept : d.actions).map((a, i) => ({ ...a, order: i + 1 }));
    return { diagnosis: { ...d, actions: finalActions }, trimmed };
  });
  withTrim.sort((a, b) => Number(a.trimmed) - Number(b.trimmed));
  return withTrim.map((w) => w.diagnosis);
}

export function diagnose(plan: BuildPlan, symptomId: SymptomId, step?: BuildStep): Diagnosis[] {
  const parts = plan.parts || [];
  const blob = planBlob(plan, step);
  const list: Diagnosis[] = [];

  // ── Step-authored common mistakes (highest trust when present) ──
  if (step?.commonMistakes?.length) {
    step.commonMistakes.forEach((cm, i) => {
      const matchesSymptom =
        symptomId === "general" ||
        (symptomId === "blank_display" && /blank|display|oled|screen|i2c|sda|scl/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "no_upload" && /upload|port|board|flash|code/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "no_wifi" && /wifi|wi-fi|ssid|network|time|1970/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "sensor_wrong" && /sensor|humidity|temp|sht|dht|bme|zero/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "touch_dead" && /touch|button|gpio0/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "battery_charge" && /battery|charge|solar|lipo|short/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "smoke_heat" && /heat|short|fire|smell|spark/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "no_power" && /power|brown|reset|dead|voltage/i.test(`${cm.symptom} ${cm.cause}`)) ||
        (symptomId === "mechanical" && /crack|fit|bend|hole|length/i.test(`${cm.symptom} ${cm.cause}`));

      if (!matchesSymptom) return;

      list.push(
        d({
          id: `step-mistake-${step.stepNumber}-${i}`,
          title: cm.symptom,
          likelihood: "very_likely",
          cause: cm.cause,
          source: "step",
          isolation: "Stay on this step's wiring — don't rebuild the whole project yet.",
          actions: [
            { order: 1, action: cm.fix, expect: "Symptom improves or disappears.", ifFail: "Try the next diagnosis below." },
          ],
        })
      );
    });
  }

  // ── Safety first ──
  if (symptomId === "smoke_heat") {
    list.push(
      d({
        id: "safety-disconnect",
        title: "Disconnect power immediately",
        likelihood: "very_likely",
        cause: "Heat/smell means excess current — short, reverse polarity, or overloaded regulator.",
        source: "generic",
        isolation: "Unplug USB. Disconnect the battery. Move the cell to a non-flammable surface (ceramic/concrete).",
        actions: [
          {
            order: 1,
            action: "Unplug USB and disconnect battery leads. Do not touch hot parts.",
            expect: "Heat stops rising within a minute.",
          },
          {
            order: 2,
            action: "With power off, check battery +/− against TP4056 BAT pads and solar OUT pads for reverse polarity.",
            expect: "Silkscreen + matches battery +.",
            ifFail: "Rewire before any power-on.",
          },
          {
            order: 3,
            action: "Inspect for solder bridges between adjacent pins (especially VCC–GND on OLED/ESP).",
            expect: "No shiny bridges; continuity meter does not beep VCC to GND.",
          },
          {
            order: 4,
            action: "Only then power from USB alone (battery disconnected) and watch for 30 seconds.",
            expect: "No heat, no smell. If heat returns, stop and recheck polarity.",
          },
        ],
      })
    );
  }

  // ── Blank display ──
  if (symptomId === "blank_display") {
    list.push(
      d({
        id: "oled-sda-scl-swap",
        title: "SDA and SCL wires are swapped",
        likelihood: "very_likely",
        cause: "Most common OLED blank-screen cause. Data and clock lines reversed.",
        source: "catalog",
        isolation: "Leave power and GND; only touch the two I2C signal wires.",
        actions: [
          {
            order: 1,
            action: "Swap the SDA and SCL wires at one end only (ESP or OLED).",
            expect: "Display shows content after reset.",
            ifFail: "Swap back and continue.",
            netHint: ["sda", "scl"],
          },
          {
            order: 2,
            action: "Confirm OLED VCC is on 3.3V (not 5V) and GND is common with the ESP.",
            expect: "Multimeter: ~3.3V between OLED VCC and GND when powered.",
            netHint: ["power", "gnd"],
          },
        ],
      }),
      d({
        id: "oled-i2c-address",
        title: "Wrong I2C address in code",
        likelihood: "likely",
        cause: "Many SSD1306 modules are 0x3C; some are 0x3D. Code must match.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "Upload an I2C scanner sketch. Note every address printed.",
            expect: "You see 0x3C and/or 0x3D (and maybe 0x44 for SHT31).",
            ifFail: "If no devices: wiring/power problem, not address.",
          },
          {
            order: 2,
            action: "Set the display library address to the scanned value (often 0x3C).",
            expect: "Display initializes.",
          },
        ],
      }),
      d({
        id: "oled-not-i2c-module",
        title: "Wrong display module (SPI 7-pin instead of I2C 4-pin)",
        likelihood: "possible",
        cause: "SPI OLEDs need more wires and different libraries.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "Count pins: this plan needs 4-pin I2C (VCC GND SCL SDA).",
            expect: "Exactly four pins labeled for I2C.",
            ifFail: "Replace with an I2C SSD1306 0.96\" module.",
          },
        ],
      })
    );
  }

  // ── Upload ──
  if (symptomId === "no_upload") {
    list.push(
      d({
        id: "upload-cable",
        title: "Charge-only USB cable or bad cable",
        likelihood: "very_likely",
        cause: "Many USB-C cables carry power only — no data lines.",
        source: "generic",
        isolation: "Use a known data cable; try a different USB port.",
        actions: [
          {
            order: 1,
            action: "Swap to a data-capable USB-C cable (one that works with phones for file transfer).",
            expect: "A serial port appears in the IDE (e.g. /dev/cu.usbserial or COM port).",
          },
          {
            order: 2,
            action: "Install CH340 or CP210x drivers if the port still never appears.",
            expect: "Port shows up when the board is plugged in.",
          },
        ],
      }),
      d({
        id: "upload-board-select",
        title: "Wrong board selected in the IDE",
        likelihood: "likely",
        cause: "ESP32-C3 needs an ESP32-C3 board entry, not generic ESP32.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: hasCatalog(parts, "esp32-c3")
              ? "Select board: ESP32C3 Dev Module (or your exact C3 board)."
              : "Select the board that matches your MCU (ESP32 / Nano / Pico).",
            expect: "Upload progresses past 'Connecting...'.",
            ifFail: "Hold BOOT (if present) while upload starts, then release.",
          },
        ],
      }),
      d({
        id: "upload-boot-button",
        title: "Board needs BOOT held for download mode",
        likelihood: "possible",
        cause: "Some ESP32-C3 Super Mini clones need manual download mode.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "Hold BOOT, press RESET once, release BOOT, then click Upload.",
            expect: "Upload completes with 'Hard resetting via RTS'.",
          },
        ],
      })
    );
  }

  // ── Wi-Fi ──
  if (symptomId === "no_wifi") {
    list.push(
      d({
        id: "wifi-credentials",
        title: "SSID/password wrong or 5 GHz-only network",
        likelihood: "very_likely",
        cause: "ESP32-C3 typically joins 2.4 GHz Wi-Fi only. Typos kill connection.",
        source: "generic",
        actions: [
          {
            order: 1,
            action: "Open Serial Monitor at 115200. Watch connect logs.",
            expect: "Clear fail reason (auth, no AP, timeout).",
          },
          {
            order: 2,
            action: "Confirm SSID/password exact match; use a 2.4 GHz network or dual-band AP.",
            expect: "Log shows connected; time/NTP updates.",
          },
        ],
      }),
      d({
        id: "wifi-power",
        title: "Brownout when Wi-Fi radio starts",
        likelihood: "likely",
        cause: "Weak USB cable or battery sags under Wi-Fi current.",
        source: "topology",
        actions: [
          {
            order: 1,
            action: "Power from a short, known-good USB data cable on a computer port (not a weak hub).",
            expect: "No endless reboot loop when Wi-Fi starts.",
          },
          {
            order: 2,
            action: "If on battery only, measure battery voltage under load — should stay above ~3.3V.",
            expect: "Voltage stable; board stops resetting.",
          },
        ],
      })
    );
  }

  // ── No power ──
  if (symptomId === "no_power") {
    list.push(
      d({
        id: "power-isolation",
        title: "Start with USB-only isolation",
        likelihood: "very_likely",
        cause: "Battery path or peripheral short can prevent boot.",
        source: "generic",
        isolation: "Disconnect battery and all peripherals. USB + bare MCU only.",
        actions: [
          {
            order: 1,
            action: "Unplug battery. Disconnect OLED/sensors. Leave only ESP on USB.",
            expect: "Board power LED on (if present); port enumerates.",
          },
          {
            order: 2,
            action: "Upload Blink or empty sketch to prove the MCU is alive.",
            expect: "Upload OK; optional LED blinks.",
            ifFail: "Cable/board/driver issue — see upload diagnoses.",
          },
          {
            order: 3,
            action: "Reconnect GND + 3.3V only to OLED, then I2C lines one at a time.",
            expect: "Each addition keeps the board alive.",
          },
        ],
      }),
      d({
        id: "power-polarity",
        title: "Battery polarity reversed",
        likelihood: "likely",
        cause: "Reversed cell can prevent boot or heat protection FETs.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "With power off, verify battery + to BAT+/OUT+ and − to BAT−/GND.",
            expect: "Matches silkscreen; multimeter polarity correct.",
          },
        ],
      })
    );
  }

  // ── Sensor ──
  if (symptomId === "sensor_wrong") {
    list.push(
      d({
        id: "sensor-i2c-bus",
        title: "Sensor not on the I2C bus",
        likelihood: "very_likely",
        cause: "Shared SDA/SCL/GND missing or wrong address.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "Run I2C scanner — SHT31 often 0x44/0x45; BME280 0x76/0x77.",
            expect: "Sensor address appears alongside OLED if both connected.",
            ifFail: "Check SDA/SCL continuity and common GND.",
            netHint: ["sda", "scl", "gnd"],
          },
          {
            order: 2,
            action: "Confirm sensor VCC is powered (3.3V) and code uses the scanned address.",
            expect: "Readings change when you breathe on / warm the sensor.",
          },
        ],
      })
    );
    if (hasCatalog(parts, "hc-sr04") || hasText(blob, "hc-sr04", "ultrasonic")) {
      list.push(
        d({
          id: "hcsr04-5v-echo",
          title: "HC-SR04 ECHO at 5V confusing or damaging 3.3V MCU",
          likelihood: "likely",
          cause: "ECHO is 5V logic — needs divider on 3.3V boards.",
          source: "catalog",
          actions: [
            {
              order: 1,
              action: "Add a resistor divider on ECHO (e.g. 1k + 2k to GND) or use a 3.3V ultrasonic module.",
              expect: "Stable distance readings; MCU stops browning out.",
            },
          ],
        })
      );
    }
  }

  // ── Touch ──
  if (symptomId === "touch_dead") {
    list.push(
      d({
        id: "touch-gnd-sig",
        title: "Missing common GND or floating SIG",
        likelihood: "very_likely",
        cause: "Touch modules need VCC, GND, and SIG to a GPIO.",
        source: "catalog",
        actions: [
          {
            order: 1,
            action: "Verify touch GND ties to ESP GND; SIG to the GPIO in code (often GPIO0).",
            expect: "Logic level on SIG changes when you touch the pad (meter or serial print).",
          },
          {
            order: 2,
            action: "Confirm code reads the same pin number as the wire.",
            expect: "Sleep/wake toggles.",
          },
        ],
      })
    );
  }

  // ── Battery / charge ──
  if (symptomId === "battery_charge") {
    list.push(
      d({
        id: "charge-path",
        title: "Solar/USB not on the charge input",
        likelihood: "very_likely",
        cause: "Panels must feed controller IN; USB feeds TP4056 IN — not raw across the cell.",
        source: "topology",
        actions: [
          {
            order: 1,
            action: "Trace: solar +/− → controller IN; controller OUT → battery; TP4056 BAT → battery.",
            expect: "No direct panel-to-cell short path.",
          },
          {
            order: 2,
            action: "In bright light or with USB on TP4056, watch charge LED (if present).",
            expect: "Charge indicator responds.",
            ifFail: "Check reverse polarity on IN pads.",
          },
        ],
      })
    );
  }

  // ── Mechanical ──
  if (symptomId === "mechanical") {
    list.push(
      d({
        id: "mech-remeasure",
        title: "Remeasure before forcing a fit",
        likelihood: "very_likely",
        cause: "Small bend/drill errors compound.",
        source: "generic",
        actions: [
          {
            order: 1,
            action: "Compare each dimension to the step numbers with a ruler — don't force parts.",
            expect: "Error located to one bend or hole.",
          },
          {
            order: 2,
            action: "Recut/rebend the bad segment rather than stacking fixes.",
            expect: "Dry-fit sits flat without spring tension on wires.",
          },
        ],
      })
    );
  }

  // ── General isolation (always useful fallback) ──
  if (symptomId === "general" || list.length < 2) {
    list.push(
      d({
        id: "generic-isolation",
        title: "Binary search: prove the MCU first",
        likelihood: "likely",
        cause: "Most 'mystery' failures are power, ground, or one bad peripheral.",
        source: "generic",
        isolation: "USB + MCU only → add one module at a time.",
        actions: [
          {
            order: 1,
            action: "Disconnect battery and peripherals. USB + bare board. Upload Blink.",
            expect: "MCU alive.",
          },
          {
            order: 2,
            action: "Reconnect modules one at a time (power/GND first, then signals). Retest after each.",
            expect: "The addition that breaks it is your culprit.",
          },
          {
            order: 3,
            action: "When found, check polarity, pin numbers, and solder joints on that module only.",
            expect: "System stable again.",
          },
        ],
      })
    );
  }

  // Boost catalog footguns when relevant
  for (const part of parts) {
    if (!part.footguns?.[0] || !part.catalogId) continue;
    if (symptomId === "blank_display" && part.catalogId.includes("ssd1306")) {
      list.push(
        d({
          id: `footgun-${part.catalogId}`,
          title: `Catalog gotcha: ${part.name}`,
          likelihood: "possible",
          cause: part.footguns[0],
          source: "catalog",
          actions: [
            {
              order: 1,
              action: part.footguns.slice(1).join(" ") || part.footguns[0],
              expect: "Matches module silkscreen and known-good wiring.",
            },
          ],
        })
      );
    }
  }

  // Sort by score desc, dedupe by id
  const seen = new Set<string>();
  return list
    .filter((x) => {
      if (seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    })
    .sort((a, b) => b.score - a.score);
}

export function likelihoodLabel(l: Likelihood): string {
  if (l === "very_likely") return "Very likely";
  if (l === "likely") return "Likely";
  return "Possible";
}

export function allSymptoms(): SymptomOption[] {
  return SYMPTOMS;
}
