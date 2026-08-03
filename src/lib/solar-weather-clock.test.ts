import { test } from "node:test";
import assert from "node:assert/strict";
import plan from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import { generateFirmware } from "@/lib/firmware";
import type { BuildPlan } from "@/lib/types";

// The authored build runs through the real trust pipeline exactly as the app
// loads it (build/[id]/page.tsx). These assertions are the ship gate for
// Logan's personal Solar Weather Clock: correct part binding, a clean ERC on
// the corrected two-ground / two-charger topology, and a firmware package.
const trusted = applyTrustPipeline(plan as unknown as BuildPlan);

test("solar-weather-clock: every part binds to the intended catalog module", () => {
  const byId = Object.fromEntries(trusted.parts.map((p) => [p.id, p]));
  const expected: Record<string, string> = {
    esp32c3: "esp32-c3",
    oled: "ssd1306-i2c",
    sht3x: "sht31d",
    charger: "tp4056-protected",
    "solar-charger": "solar-charger",
    battery: "battery-lipo-1s",
    switch: "spdt-slide-switch",
    "solar-panel": "solar-panel-5v",
    "capacity-meter": "battery-level-led",
  };
  for (const [id, cat] of Object.entries(expected)) {
    assert.equal(byId[id]?.catalogId, cat, `${id} should bind ${cat}, got ${byId[id]?.catalogId}`);
  }
});

test("solar-weather-clock: the LiPo is modeled as a lithium cell", () => {
  const cell = trusted.electrical?.components.find((c) => c.isLithiumCell);
  assert.ok(cell, "a lithium cell component should exist");
  assert.ok(cell!.ref.startsWith("BT"), `cell should get a BT ref, got ${cell!.ref}`);
});

test("solar-weather-clock: ERC is clean (no errors)", () => {
  const erc = trusted.electrical?.erc;
  assert.ok(erc, "electrical model present");
  assert.equal(
    erc!.clean,
    true,
    `ERC errors: ${erc!.errors.map((e) => `${e.rule}: ${e.title}`).join(" | ")}`
  );
});

test("solar-weather-clock: no unbound structured-net members", () => {
  assert.equal(
    trusted.electrical?.unboundEdges.length ?? 0,
    0,
    JSON.stringify(trusted.electrical?.unboundEdges)
  );
});

test("solar-weather-clock: the ESP32 is powered on its 5V pin (never 3V3 input)", () => {
  const esp = trusted.electrical!.components.find((c) => c.catalogId === "esp32-c3")!;
  const nets = trusted.electrical!.nets;
  const on5v = nets.some((n) => n.members.some((m) => m.ref === esp.ref && m.pin === "5V"));
  assert.ok(on5v, "ESP32 must be powered on the 5V pin");
  // 3V3 must only ever be an OUTPUT rail feeding the OLED/sensor, i.e. on a net named 3V3.
  const badVin = nets.some(
    (n) => n.name !== "3V3" && n.members.some((m) => m.ref === esp.ref && m.pin === "3V3")
  );
  assert.equal(badVin, false, "ESP32 3V3 must not be used as a power input");
});

test("solar-weather-clock: load ground comes from the charger OUT- (protection intact)", () => {
  const charger = trusted.electrical!.components.find((c) => c.catalogId === "tp4056-protected")!;
  const gnd = trusted.electrical!.nets.find((n) => n.name === "GND")!;
  assert.ok(
    gnd.members.some((m) => m.ref === charger.ref && m.pin === "OUT-"),
    "the load GND net must include the charger OUT- pad"
  );
  // The raw B- must NOT be on the same net as the load ground.
  assert.ok(
    !gnd.members.some((m) => m.ref === charger.ref && m.pin === "B-"),
    "charger B- must not share the load ground net"
  );
});

test("solar-weather-clock: compiler assigns the guided one-wire-at-a-time steps", () => {
  assert.equal(trusted.compiledFacts?.status, "ok");
  const totalMicro = trusted.steps.reduce((a, s) => a + (s.compiled?.microSteps?.length ?? 0), 0);
  assert.ok(totalMicro >= 12, `expected many guided wires, got ${totalMicro}`);
});

test("solar-weather-clock: the safety and measure steps carry NO solder wires", () => {
  // Step 1 (safety) and Step 4 (measure) must never be classified into guided
  // wiring — a beginner landing there and being told to solder is wrong.
  const byNum = Object.fromEntries(trusted.steps.map((s) => [s.stepNumber, s]));
  assert.equal(byNum[1]?.compiled?.microSteps?.length ?? 0, 0, "safety step must have no wires");
  assert.equal(byNum[4]?.compiled?.microSteps?.length ?? 0, 0, "measure step must have no wires");
});

test("solar-weather-clock: the LiPo's leads are only wired in the final wiring step", () => {
  // Connect-the-battery-LAST is the core LiPo safety rule. Every micro-step that
  // attaches a battery lead must live in the last (highest-numbered) wiring step.
  const touchesCell = (label: string) => label.includes("LiPo Battery");
  const wiringStepNums = trusted.steps
    .filter((s) => (s.compiled?.microSteps?.length ?? 0) > 0)
    .map((s) => s.stepNumber);
  const lastWiring = Math.max(...wiringStepNums);
  let batteryLeadCount = 0;
  for (const s of trusted.steps) {
    for (const m of s.compiled?.microSteps ?? []) {
      if (touchesCell(m.fromLabel) || touchesCell(m.toLabel)) {
        batteryLeadCount++;
        assert.equal(
          s.stepNumber,
          lastWiring,
          `battery-lead wire must be in the last wiring step (${lastWiring}), found in step ${s.stepNumber}`
        );
      }
    }
  }
  assert.ok(batteryLeadCount >= 2, "expected the LiPo's two leads to be wired");
});

test("solar-weather-clock: firmware generates the ESP32-C3 weather app on GPIO4/5", () => {
  const fw = generateFirmware(trusted);
  assert.ok(fw, "firmware should generate for ESP32-C3");
  assert.equal(fw!.boardId, "esp32-c3");
  const ids = fw!.sketches.map((s) => s.id);
  assert.ok(ids.includes("full_app"), "full app sketch present");
  assert.ok(ids.includes("i2c_scanner"), "i2c scanner present");
  assert.equal(fw!.pinMap.PIN_SDA, 4);
  assert.equal(fw!.pinMap.PIN_SCL, 5);
  assert.equal(fw!.pinMap.I2C_SHT_ADDR, 0x44);
});
