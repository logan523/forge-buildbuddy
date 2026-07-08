import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTrustPipeline } from "./trust";
import { validatePlan, extractPinKeys } from "./validators";
import type { BuildPlan } from "./types";
import { enrichParts } from "./catalog";

function basePlan(over: Partial<BuildPlan> = {}): BuildPlan {
  return {
    id: "test",
    title: "Test",
    description: "A test project",
    difficulty: "beginner",
    estimatedTime: "1h",
    estimatedCost: "$10",
    parts: [],
    tools: [],
    steps: [],
    wiringConnections: [],
    warnings: [],
    ...over,
  };
}

describe("validators", () => {
  it("flags lithium without protection as critical", () => {
    const plan = basePlan({
      parts: enrichParts([
        {
          id: "bat",
          name: "Li-ion Battery",
          specification: "3.7V 16340",
          quantity: 1,
        },
      ]),
    });
    const report = validatePlan(plan);
    assert.ok(report.findings.some((f) => f.id === "lipo-no-protection" && f.severity === "critical"));
    assert.equal(report.requiresAttention, true);
    assert.ok(report.hazardTags.includes("LIPO"));
  });

  it("does not flag lipo-no-protection when TP4056 present", () => {
    const plan = basePlan({
      parts: enrichParts([
        {
          id: "bat",
          name: "Li-ion Battery",
          specification: "3.7V 16340",
          quantity: 1,
        },
        {
          id: "chg",
          name: "Battery Charging Board",
          specification: "TP4056 Li-ion charging module with Type-C",
          quantity: 1,
        },
      ]),
    });
    const report = validatePlan(plan);
    assert.ok(!report.findings.some((f) => f.id === "lipo-no-protection"));
  });

  it("flags HC-SR04 with ESP32-C3 as critical", () => {
    const plan = basePlan({
      parts: enrichParts([
        {
          id: "mcu",
          name: "ESP32-C3",
          specification: "development board",
          quantity: 1,
        },
        {
          id: "us",
          name: "HC-SR04",
          specification: "ultrasonic distance sensor",
          quantity: 1,
        },
      ]),
    });
    const report = validatePlan(plan);
    assert.ok(report.findings.some((f) => f.id === "hcsr04-5v-echo" && f.severity === "critical"));
  });

  it("flags OLED wired to 5V", () => {
    const plan = basePlan({
      parts: enrichParts([
        { id: "oled", name: "OLED", specification: "SSD1306 I2C", quantity: 1 },
      ]),
      wiringConnections: [
        { from: "ESP32 5V", to: "OLED Display VCC", wireColor: "red" },
      ],
    });
    const report = validatePlan(plan);
    assert.ok(report.findings.some((f) => f.id === "oled-5v"));
  });

  it("extractPinKeys finds GPIO numbers", () => {
    const keys = extractPinKeys("ESP32-C3 GPIO4 (SDA)");
    assert.ok(keys.includes("GPIO4"));
  });

  it("applyTrustPipeline enriches sat-line-like BOM and attaches safetyReport", () => {
    const trusted = applyTrustPipeline(
      basePlan({
        title: "Sat Line-ish",
        parts: [
          {
            id: "oled",
            name: "OLED Display",
            specification: "0.96 inch SSD1306 I2C 128x64",
            quantity: 1,
          },
          {
            id: "esp",
            name: "ESP32-C3 Microcontroller",
            specification: "ESP32-C3 development board with Wi-Fi",
            quantity: 1,
          },
          {
            id: "bat",
            name: "Li-ion Battery",
            specification: "3.7V 16340 Li-ion rechargeable battery",
            quantity: 1,
          },
          {
            id: "tp",
            name: "Battery Charging Board",
            specification: "TP4056 Li-ion charging module with Type-C",
            quantity: 1,
          },
        ],
        wiringConnections: [
          { from: "ESP32-C3 3.3V (Pin 2)", to: "OLED Display VCC", wireColor: "red" },
        ],
      })
    );
    assert.ok(trusted.safetyReport);
    assert.ok(trusted.parts.some((p) => p.catalogId === "ssd1306-i2c"));
    assert.ok(trusted.parts.some((p) => p.matchConfidence === "high" || p.matchConfidence === "medium"));
  });
});
