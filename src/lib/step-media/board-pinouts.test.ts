import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allPads,
  pinMatches,
  pinoutForBoard,
  resolveCatalogHint,
} from "./board-pinouts";

describe("board-pinouts", () => {
  it("resolves SuperMini / ESP labels to dual-header layout with GPIO neighbors", () => {
    const L = pinoutForBoard("ESP32-C3 SuperMini", "GPIO4", "esp32_c3");
    assert.equal(L.kind, "dual_header");
    assert.ok(L.left?.length && L.right?.length);
    const pads = allPads(L);
    // Bare "4" is the silkscreen; GPIO4 must match it
    assert.ok(pads.some((p) => pinMatches(p, "GPIO4")));
    assert.ok(pads.includes("3V3") || pads.includes("GND"));
  });

  it("matches GPIO4 to pad 4 and GPIO5 to pad 5", () => {
    assert.ok(pinMatches("4", "GPIO4"));
    assert.ok(pinMatches("GPIO4", "4"));
    assert.ok(pinMatches("5", "GPIO5"));
    assert.ok(!pinMatches("4", "GPIO5"));
  });

  it("uses RealPartSpec OLED pin order", () => {
    const L = pinoutForBoard('0.96" SSD1306 OLED', "SDA", "oled_096");
    assert.equal(L.kind, "single_row");
    assert.deepEqual(L.row, ["VCC", "GND", "SCL", "SDA"]);
  });

  it("uses TP4056 edge pad names from RealPartSpec", () => {
    const L = pinoutForBoard("TP4056 charger", "B+", "tp4056");
    assert.ok(allPads(L).includes("B+"));
    assert.ok(allPads(L).includes("OUT-"));
  });

  it("injects unknown active pin so highlight never misses", () => {
    const L = pinoutForBoard("Mystery board", "Q99", null);
    assert.ok(allPads(L).some((p) => pinMatches(p, "Q99")));
  });

  it("resolveCatalogHint maps common labels", () => {
    assert.equal(resolveCatalogHint(null, "ESP32-C3 SuperMini"), "esp32_c3");
    assert.equal(resolveCatalogHint("oled_096", "Display"), "oled_096");
    assert.equal(resolveCatalogHint(null, "sht30 humidity"), "sht30");
  });
});
