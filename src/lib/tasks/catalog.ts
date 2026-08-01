import type { TaskDef } from "./types";

/** v1 task list — offline-runnable checks first (T01–T06). */
export const TASKS: TaskDef[] = [
  {
    id: "T01",
    title: "Identify every part on the table",
    prompt: "Match each BOM part to a real name and identity (catalog or clear label).",
    skillIds: ["part-identify"],
    offline: true,
  },
  {
    id: "T02",
    title: "Wire OLED I2C (SDA/SCL + power path)",
    prompt: "Complete OLED-related wiring micro-steps with authority colors; stage focus is a subset.",
    skillIds: ["wire-one-net", "i2c-ssd1306", "step-isolate"],
    offline: true,
  },
  {
    id: "T03",
    title: "Prep/desolder steps do not absorb nets",
    prompt: "Prepare/desolder steps must not carry compiled connection legs.",
    skillIds: ["wire-one-net"],
    offline: true,
  },
  {
    id: "T04",
    title: "Harness + instruction conformance",
    prompt: "Table and 3D tubes both trace to the netlist.",
    skillIds: ["step-isolate", "wire-one-net"],
    offline: true,
  },
  {
    id: "T05",
    title: "Flash path is defined (offline gate)",
    prompt: "Software steps exist; flash skill triggers; human-confirm guidance present.",
    skillIds: ["esp32c3-flash"],
    offline: true,
  },
  {
    id: "T06",
    title: "Expected I2C devices for verify",
    prompt: "Plan yields expected I2C addresses from catalog for live verify.",
    skillIds: ["i2c-ssd1306", "esp32c3-flash"],
    offline: true,
  },
];

export function taskById(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}
