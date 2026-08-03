import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { svgPinConnection } from "./pin-connection-svg";
import type { MicroStep } from "@/lib/types";

const micro = (over: Partial<MicroStep> = {}): MicroStep =>
  ({
    id: "t",
    index: 1,
    total: 4,
    colorName: "blue",
    colorHex: "#2563eb",
    netName: "I2C_SDA",
    fromPartId: "a",
    toPartId: "b",
    fromLabel: "ESP32-C3 SuperMini",
    fromPin: "GPIO4",
    toLabel: "0.96 OLED",
    toPin: "SDA",
    netClass: "i2c",
    action: "Solder blue wire…",
    verify: { tug: "tug", continuity: "beep" },
    showTechnique: true,
    ...over,
  }) as MicroStep;

describe("pin connection svg", () => {
  it("labels both silkscreen pins and color — no cartoon jumper path", () => {
    const s = svgPinConnection(micro());
    // SuperMini dual-header shows bare "4" (GPIO4 silkscreen class)
    assert.ok(/GPIO4|>4</.test(s), "ESP pin or GPIO4 visible");
    assert.match(s, /SDA/);
    assert.match(s, /BLUE|#2563eb/i);
    assert.match(s, /SOLDER/);
    assert.match(s, /ESP32|SuperMini/i);
    assert.match(s, /OLED/i);
    // SEV2: never draw a mid-canvas jumper path or dark connector pill
    assert.ok(!/<path[^>]*stroke-width="1[02]"/.test(s), "no thick jumper path");
    // Dark vertical pill at canvas center was the "black wire" artifact
    assert.ok(
      !/<rect[^>]*width="40"\s+height="60"/.test(s),
      "no mid-canvas connector pill"
    );
  });

  it("GND black never paints a mid-canvas near-black blob", () => {
    const s = svgPinConnection(
      micro({
        colorName: "black",
        colorHex: "#1e293b",
        netName: "GND",
        netClass: "gnd",
        fromPin: "GND",
        toPin: "GND",
      })
    );
    assert.ok(!/<path[^>]*stroke-width="1[02]"/.test(s), "no jumper on GND");
    assert.ok(
      !/<rect[^>]*width="40"\s+height="60"/.test(s),
      "no center pill on GND (the black-wire look)"
    );
    // Pad accent lifted off pure black; swatch may still be dark
    assert.match(s, /BLACK|GND/i);
  });

  it("draws dual-header neighbors for SuperMini (IBOM orientation)", () => {
    const s = svgPinConnection(
      micro({
        fromLabel: "ESP32-C3 SuperMini",
        fromPartId: "esp32_c3",
        fromPin: "GPIO4",
        toLabel: '0.96" OLED',
        toPartId: "oled_096",
        toPin: "SDA",
      })
    );
    // Neighbor pads so the builder can count from USB
    assert.match(s, />3V3</);
    assert.match(s, />GND</);
    assert.match(s, />5</); // right-column neighbor of 4's row class
    assert.match(s, /dual-header|USB/);
    // OLED real-parts order
    assert.match(s, />VCC</);
    assert.match(s, />SCL</);
  });

  it("escapes dangerous board names", () => {
    const s = svgPinConnection(
      micro({ fromLabel: 'Board <script>x</script>', fromPin: 'A"1' })
    );
    assert.ok(!s.includes("<script>"));
    assert.ok(s.includes("GPIO4") || s.includes("A") || s.includes("SOLDER"));
  });
});
