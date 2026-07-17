import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expectedI2cAddresses } from "./expected-devices";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan, Part } from "@/lib/types";
import demo from "@/data/sat-line.json";

// Same pattern every other test in this codebase uses to get a fully
// catalog-enriched plan out of the raw demo fixture (see firmware.test.ts,
// cart.test.ts, storage.test.ts, unstick.test.ts, ...) — enrichParts (which
// binds catalogId) runs inside applyTrustPipeline, not on the raw JSON.
const plan = applyTrustPipeline(demo as unknown as BuildPlan);

function withParts(parts: Part[]): BuildPlan {
  return { ...plan, parts };
}

describe("expectedI2cAddresses", () => {
  it("returns [] for a plan with no parts", () => {
    assert.deepEqual(expectedI2cAddresses(withParts([])), []);
  });

  it("returns [] for the raw demo fixture before any trust pipeline has run (no catalogIds bound yet)", () => {
    const raw = demo as unknown as BuildPlan;
    assert.deepEqual(expectedI2cAddresses(raw), []);
  });

  it("returns [] for a part matched to a non-I2C-address catalog module (the MCU board itself)", () => {
    const mcu = plan.parts.find((p) => p.catalogId === "esp32-c3");
    assert.ok(mcu, "sat-line's ESP32-C3 part should have matched catalogId esp32-c3");
    assert.deepEqual(
      expectedI2cAddresses(withParts([mcu!])),
      [],
      "esp32-c3 exposes an I2C bus but isn't itself an addressable I2C device"
    );
  });

  it("returns [] for a part whose catalogId doesn't exist in the catalog", () => {
    const bogus: Part = {
      id: "x",
      name: "Mystery module",
      specification: "",
      quantity: 1,
      catalogId: "not-a-real-catalog-id",
    };
    assert.deepEqual(expectedI2cAddresses(withParts([bogus])), []);
  });

  it("returns [] for a part with no catalogId at all", () => {
    const unmatched: Part = { id: "x", name: "Some part", specification: "", quantity: 1 };
    assert.deepEqual(expectedI2cAddresses(withParts([unmatched])), []);
  });

  it("derives BME280's primary + alt address, short label, and the sensor symptom hint", () => {
    const part: Part = {
      id: "x",
      name: "Env sensor board",
      specification: "BME280 module",
      quantity: 1,
      catalogId: "bme280",
    };
    const devices = expectedI2cAddresses(withParts([part]));
    assert.equal(devices.length, 1);
    assert.deepEqual(devices[0], {
      addresses: [0x76, 0x77],
      label: "pressure/temp/humidity sensor",
      partName: "Env sensor board",
      catalogId: "bme280",
      symptomHint: "sensor_wrong",
    });
  });

  it("dedupes two parts matched to the same catalog module into one expected device", () => {
    const oled1: Part = { id: "a", name: "OLED #1", specification: "", quantity: 1, catalogId: "ssd1306-i2c" };
    const oled2: Part = { id: "b", name: "OLED #2", specification: "", quantity: 1, catalogId: "ssd1306-i2c" };
    const devices = expectedI2cAddresses(withParts([oled1, oled2]));
    assert.equal(devices.length, 1);
    assert.equal(devices[0].partName, "OLED #1", "first occurrence wins over a duplicate catalog match");
  });

  it("sat-line demo plan (after applyTrustPipeline, like the other tests do): OLED + SHT31 expected, nothing else", () => {
    const devices = expectedI2cAddresses(plan);
    assert.equal(
      devices.length,
      2,
      `expected exactly OLED + SHT31, got: ${devices.map((d) => d.catalogId).join(", ")}`
    );

    const oled = devices.find((d) => d.catalogId === "ssd1306-i2c");
    assert.ok(oled);
    assert.deepEqual(oled!.addresses, [0x3c, 0x3d]);
    assert.equal(oled!.label, "OLED display");
    assert.equal(oled!.partName, "OLED Display");
    assert.equal(oled!.symptomHint, "blank_display");

    const sht = devices.find((d) => d.catalogId === "sht31d");
    assert.ok(sht);
    assert.deepEqual(sht!.addresses, [0x44, 0x45]);
    assert.equal(sht!.label, "temp/humidity sensor");
    assert.equal(sht!.partName, "Temperature & Humidity Sensor");
    assert.equal(sht!.symptomHint, "sensor_wrong");
  });
});
