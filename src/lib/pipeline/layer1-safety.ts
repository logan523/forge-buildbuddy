import type { HazardTag } from "./types";

/** L1 — classify hazards from raw input text (no LLM). */
export function classifyInputHazards(text: string): HazardTag[] {
  const t = text.toLowerCase();
  const tags = new Set<HazardTag>();

  if (/\b(li-?ion|li-?po|lithium|16340|18650|21700|lipo|battery)\b/.test(t)) tags.add("LIPO");
  if (/\b(mains|120v|240v|110v|wall outlet|ac line|mains voltage)\b/.test(t)) tags.add("MAINS");
  if (/\b(esp32|oled|cmos|mosfet|sensor|mcu)\b/.test(t)) tags.add("ESD_SENSITIVE");
  if (/\b(motor|servo|stepper|high current|>\s*2a|amp)\b/.test(t)) tags.add("HIGH_CURRENT");
  if (/\b(heatsink|hot|thermal|dissipat)\b/.test(t)) tags.add("HEAT");
  if (/\b(solder|soldering|desolder)\b/.test(t)) tags.add("SOLDERING");
  if (/\b(motor|servo|moving|actuator|fan)\b/.test(t)) tags.add("MOVING");

  return [...tags];
}

export function safetyPreamble(tags: HazardTag[]): string {
  if (tags.length === 0) return "No elevated hazard tags detected in the input.";
  const notes: string[] = [];
  if (tags.includes("LIPO")) {
    notes.push("LITHIUM: Require protected charge path (TP4056 with DW01 or BMS). Never short cells. Never charge unattended on flammable surfaces.");
  }
  if (tags.includes("MAINS")) {
    notes.push("MAINS: Do not design breadboard mains. Use pre-certified adapters only. Flag as advanced/restricted.");
  }
  if (tags.includes("ESD_SENSITIVE")) {
    notes.push("ESD: Include handling precautions for MCU/display/sensors.");
  }
  if (tags.includes("HIGH_CURRENT")) {
    notes.push("CURRENT: Call out wire gauge and supply headroom.");
  }
  return notes.join("\n");
}
