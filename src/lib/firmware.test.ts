import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPinMap, generateFirmware, isSoftwareStep, doneWhenForSoftwareStep } from "./firmware";
import { applyTrustPipeline } from "./trust";
import type { BuildPlan } from "./types";
import demo from "@/data/sat-line.json";

describe("firmware", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("extracts SDA/SCL/TOUCH from sat-line wiring", () => {
    const map = buildPinMap(plan);
    assert.equal(map.PIN_SDA, 4);
    assert.equal(map.PIN_SCL, 5);
    assert.equal(map.PIN_TOUCH, 0);
  });

  it("generates package with blink, scanner, oled, sensor, full app", () => {
    const fw = generateFirmware(plan);
    assert.ok(fw);
    assert.equal(fw!.boardId, "esp32-c3");
    const ids = fw!.sketches.map((s) => s.id);
    assert.ok(ids.includes("blink"));
    assert.ok(ids.includes("i2c_scanner"));
    assert.ok(ids.includes("oled_test"));
    assert.ok(ids.includes("sensor_test"));
    assert.ok(ids.includes("full_app"));
  });

  it("embeds pin numbers in generated code", () => {
    const fw = generateFirmware(plan)!;
    const scanner = fw.sketches.find((s) => s.id === "i2c_scanner")!;
    assert.match(scanner.code, /PIN_SDA 4/);
    assert.match(scanner.code, /PIN_SCL 5/);
    const app = fw.sketches.find((s) => s.id === "full_app")!;
    assert.match(app.code, /PIN_TOUCH 0/);
    assert.match(app.code, /WIFI_SSID/);
  });

  it("platformio ini targets esp32-c3", () => {
    const fw = generateFirmware(plan)!;
    assert.match(fw.platformioIni, /esp32-c3|espressif32/);
  });

  it("detects software steps", () => {
    const upload = plan.steps.find((s) => /upload/i.test(s.title));
    assert.ok(upload);
    assert.equal(isSoftwareStep(upload), true);
    assert.equal(isSoftwareStep(plan.steps[0]), false);
  });

  it("returns null without MCU", () => {
    const bare: BuildPlan = {
      ...plan,
      parts: [{ id: "x", name: "Resistor", specification: "10k", quantity: 1 }],
    };
    assert.equal(generateFirmware(bare), null);
  });
});

describe("doneWhenForSoftwareStep", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const fw = generateFirmware(plan)!;

  it("matches the blink smoke-test step and states the LED/serial check", () => {
    const step = {
      stepNumber: 90,
      title: "Upload the blink smoke test",
      description:
        "Flash the board with the smoke test sketch to confirm the board, cable, and port are all good before wiring anything else.",
    };
    const doneWhen = doneWhenForSoftwareStep(step, fw);
    assert.ok(doneWhen);
    assert.match(doneWhen!, /01_blink/);
    assert.match(doneWhen!, /115200/);
    assert.match(doneWhen!, /"blink" printed/i);
  });

  it("matches the I2C scanner step and lists addresses derived from the BOM (OLED + SHT31 both present in sat-line)", () => {
    const step = {
      stepNumber: 91,
      title: "Run the I2C scanner",
      description: "Upload the I2C bus scanner sketch and confirm every sensor answers on the bus.",
    };
    const doneWhen = doneWhenForSoftwareStep(step, fw);
    assert.ok(doneWhen);
    assert.match(doneWhen!, /02_i2c_scanner/);
    assert.match(doneWhen!, /0x3C \(display\)/i);
    assert.match(doneWhen!, /0x44 \(sensor\)/i);
  });

  it("I2C scanner expected addresses fall back to plain language when no display/sensor sketch was generated", () => {
    const bare = { ...fw, sketches: fw.sketches.filter((s) => s.id !== "oled_test" && s.id !== "sensor_test") };
    const step = { stepNumber: 91, title: "Run the I2C scanner", description: "Upload the I2C bus scanner sketch." };
    const doneWhen = doneWhenForSoftwareStep(step, bare);
    assert.ok(doneWhen);
    assert.match(doneWhen!, /your display\/sensor addresses/i);
  });

  it("matches the full-app step and describes the clock behavior (OLED + Wi-Fi-capable board)", () => {
    const step = {
      stepNumber: 92,
      title: "Upload the final full app sketch",
      description: "Flash the complete integrated app and set your Wi-Fi credentials.",
    };
    const doneWhen = doneWhenForSoftwareStep(step, fw);
    assert.ok(doneWhen);
    assert.match(doneWhen!, /05_full_app/);
    assert.match(doneWhen!, /clock face light up with the time/i);
  });

  it("defaults to the LAST sketch when the step text doesn't match any sketch by keyword", () => {
    const step = { stepNumber: 93, title: "Set the coaster on the shelf", description: "Place the finished build somewhere stable." };
    const doneWhen = doneWhenForSoftwareStep(step, fw);
    const last = fw.sketches[fw.sketches.length - 1];
    assert.equal(last.id, "full_app", "sat-line generates full_app last, as generateFirmware always pushes it last");
    assert.ok(doneWhen);
    assert.ok(doneWhen!.includes(last.filename));
  });

  it("returns null when the firmware package has no sketches at all", () => {
    const empty = { ...fw, sketches: [] };
    assert.equal(doneWhenForSoftwareStep(plan.steps[0], empty), null);
  });
});
