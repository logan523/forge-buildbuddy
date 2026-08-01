/**
 * Skills catalog v0 — six packs. Install only what the context needs.
 */

import type { Skill } from "./types";

export const SKILLS: Skill[] = [
  {
    id: "part-identify",
    name: "Part identify",
    group: "core-build",
    summary: "Match the module in hand to catalog identity + silkscreen labels.",
    guidance:
      "Never invent pin order. Name pins by silkscreen only. Use part_identity and the catalog GLB/parametric for 'is this the thing I'm holding?'. If uncertain, show both name and photo/3D, not prose alone.",
    triggers: {
      stepKinds: ["mechanical", "general", "wiring"],
      keywords: ["identify", "find the", "which part", "looks like", "unpack"],
    },
    tools: ["part_identity", "get_step_facts"],
    goldenIds: ["part-id-catalog-not-prose"],
  },
  {
    id: "wire-one-net",
    name: "Wire one net",
    group: "core-build",
    summary: "One physical wire at a time from compiled connections.",
    guidance:
      "Use get_step_facts / micro-steps. Order: GND → power → signal. Color from wire-color authority only. Action = silkscreen labels at both ends. Do not paraphrase into ordinal pin positions.",
    triggers: {
      stepKinds: ["wiring"],
      netClasses: ["gnd", "ground", "power", "signal", "digital", "analog", "i2c"],
    },
    tools: ["get_step_facts", "build_wire_plan", "isolate_step", "audit_step_render"],
    goldenIds: ["wire-one-color-authority", "wire-one-no-ordinal-pins"],
  },
  {
    id: "i2c-ssd1306",
    name: "I2C SSD1306",
    group: "buses",
    summary: "SDA/SCL colors, addresses 0x3C/0x3D, blank-display rescue.",
    guidance:
      "SDA is blue, SCL is yellow (class authority). Expected addresses include 0x3C and 0x3D. Blank display → diagnose blank_display, check power first then swap SDA/SCL. Never invent a third I2C pin.",
    triggers: {
      stepKinds: ["wiring", "verify", "software"],
      netClasses: ["i2c"],
      symptoms: ["blank_display"],
      keywords: ["oled", "ssd1306", "sda", "scl", "i2c"],
    },
    tools: ["get_step_facts", "verify_expected_devices", "diagnose", "isolate_step"],
    goldenIds: ["i2c-sda-blue-scl-yellow", "i2c-addr-alt-ok"],
  },
  {
    id: "esp32c3-flash",
    name: "ESP32-C3 flash",
    group: "flash-serial",
    summary: "Browser flash path: computer-ready → diag/blink → serial evidence.",
    guidance:
      "Open computer-ready before flash. Prefer the shipped diag firmware for I2C scan. Human must confirm flash. After flash, verify_expected_devices against catalog I2C parts. No board → static checklist only.",
    triggers: {
      stepKinds: ["software"],
      keywords: ["flash", "upload", "firmware", "serial", "arduino", "esp32"],
    },
    tools: ["flash_firmware", "serial_connect", "verify_expected_devices"],
    goldenIds: ["flash-human-confirm"],
  },
  {
    id: "step-isolate",
    name: "Step isolate",
    group: "stage-3d",
    summary: "Stage shows only parts this step touches — kitchen-table focus.",
    guidance:
      "Default workbench: isolate_step from focusPartIds or current micro-step endpoints. Overview/hero only on prep or expanded stage. Pass audit_step_render before claiming the 3D is ready.",
    triggers: {
      stepKinds: ["wiring", "mechanical"],
      keywords: ["3d", "show me", "where is", "camera", "focus"],
    },
    tools: ["isolate_step", "audit_step_render", "get_step_facts", "build_wire_plan"],
    goldenIds: ["isolate-wiring-not-full-product"],
  },
  {
    id: "isolation-walk",
    name: "Isolation walk",
    group: "debug",
    summary: "Binary-search which add-on broke the build.",
    guidance:
      "Use diagnose + isolation walk: add modules one at a time until it breaks. Culprit is the last added part or its wires. Do not re-author the netlist in chat — open the matching wiring step facts.",
    triggers: {
      symptoms: ["blank_display", "no_power", "sensor_wrong", "touch_dead", "general"],
      keywords: ["stuck", "broken", "doesn't work", "not working", "isolation"],
    },
    tools: ["diagnose", "get_step_facts", "verify_expected_devices"],
    goldenIds: ["isolation-culprit-last-added"],
  },
];

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function skillsByGroup(group: Skill["group"]): Skill[] {
  return SKILLS.filter((s) => s.group === group);
}
