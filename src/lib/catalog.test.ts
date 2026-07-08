import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichParts, matchPart, scoreMatch, getCatalog } from "./catalog";

describe("catalog", () => {
  it("loads modules", () => {
    assert.ok(getCatalog().length >= 20);
  });

  it("matches SSD1306 OLED with high confidence", () => {
    const m = matchPart({
      name: "OLED Display",
      specification: "0.96 inch SSD1306 I2C 128x64",
    });
    assert.equal(m.catalogId, "ssd1306-i2c");
    assert.ok(m.confidence === "high" || m.confidence === "medium");
  });

  it("matches ESP32-C3", () => {
    const m = matchPart({
      name: "ESP32-C3 Microcontroller",
      specification: "ESP32-C3 development board with Wi-Fi",
    });
    assert.equal(m.catalogId, "esp32-c3");
    assert.notEqual(m.confidence, "none");
  });

  it("matches 16340 battery as lithium cell", () => {
    const m = matchPart({
      name: "Li-ion Battery",
      specification: "3.7V 16340 Li-ion rechargeable battery",
    });
    assert.equal(m.catalogId, "battery-16340");
    assert.equal(m.module?.isLithiumCell, true);
  });

  it("does not false-match random wood as MCU", () => {
    const m = matchPart({ name: "Wooden box", specification: "pine 10cm" });
    assert.ok(m.confidence === "none" || m.score < 35);
  });

  it("enrichParts assigns ids and catalog binds", () => {
    const parts = enrichParts([
      {
        id: "",
        name: "TP4056 Charger",
        specification: "Type-C lithium charging board",
        quantity: 1,
      },
    ]);
    assert.ok(parts[0].id);
    assert.equal(parts[0].catalogId, "tp4056-protected");
  });

  it("scoreMatch ranks exact alias above weak token overlap", () => {
    const ssd = getCatalog().find((m) => m.id === "ssd1306-i2c")!;
    const high = scoreMatch("ssd1306 oled i2c", ssd);
    const low = scoreMatch("random resistor pack", ssd);
    assert.ok(high > low);
  });
});
