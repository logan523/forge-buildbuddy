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
    // Incident fix: never draw a mid-canvas bezier jumper
    assert.ok(!/<path[^>]*stroke-width="1[02]"/.test(s), "no thick jumper path");
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
