import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPinMap, generateFirmware, isSoftwareStep } from "./firmware";
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
