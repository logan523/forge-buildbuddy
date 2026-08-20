import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildPlan } from "@/lib/types";
import { attachElectrical } from "@/lib/electrical";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function planWithNets(nets: { name: string; members: { ref: string; pin: string }[] }[]): BuildPlan {
  const base = JSON.parse(
    readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8")
  ) as BuildPlan;
  return { ...base, structuredNets: nets.map((n) => ({ ...n })) } as BuildPlan;
}

function memberPin(plan: BuildPlan, netName: string, ref: string): string | undefined {
  const net = plan.electrical?.nets.find((n) => n.name.toUpperCase() === netName.toUpperCase());
  return net?.members.find((m) => m.ref === ref)?.pin;
}

// GOLDEN (transcript): "i did GND to G" — the clone's silkscreen says G.

test('golden: "G" binds to the board\'s GND pin — never invents a new pin', () => {
  const plan = attachElectrical(
    planWithNets([
      { name: "GND", members: [{ ref: "esp32c3", pin: "G" }, { ref: "oled-display", pin: "GND" }] },
    ])
  );
  assert.equal(memberPin(plan, "GND", "U2"), "GND", "G resolved to the canonical GND pin");
  const net = plan.electrical!.nets.find((n) => n.name === "GND")!;
  assert.equal(net.netClass, "gnd");
});

test("single letters V / D / C bind to VCC-family / SDA / SCL on boards that have them", () => {
  const plan = attachElectrical(
    planWithNets([
      { name: "3V3", members: [{ ref: "esp32c3", pin: "3V3" }, { ref: "oled-display", pin: "V" }] },
      { name: "SDA", members: [{ ref: "esp32c3", pin: "GPIO4" }, { ref: "oled-display", pin: "D" }] },
      { name: "SCL", members: [{ ref: "esp32c3", pin: "GPIO5" }, { ref: "oled-display", pin: "C" }] },
    ])
  );
  assert.equal(memberPin(plan, "3V3", "U1"), "VCC");
  assert.equal(memberPin(plan, "SDA", "U1"), "SDA");
  assert.equal(memberPin(plan, "SCL", "U1"), "SCL");
});

test("golden: charger-family labels OUT+/B+/B-/OUT- keep binding (regression guard)", () => {
  const plan = attachElectrical(
    planWithNets([
      { name: "VBAT", members: [{ ref: "solar-charger", pin: "B+" }, { ref: "battery", pin: "BAT+" }] },
    ])
  );
  const net = plan.electrical!.nets.find((n) => n.name === "VBAT");
  assert.ok(net && net.members.length === 2, "both charger-family members bound");
});
