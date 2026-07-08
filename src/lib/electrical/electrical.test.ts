import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildElectricalModel, attachElectrical } from "./index";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";

describe("electrical netlist", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("builds components and nets for sat-line", () => {
    const m = plan.electrical!;
    assert.ok(m.components.length >= 5);
    assert.ok(m.nets.length >= 3);
    assert.ok(m.nets.some((n) => n.name === "GND" || n.name === "SDA" || n.name === "3V3" || n.name === "SCL"));
  });

  it("marks catalog pinouts verified/derived", () => {
    const m = plan.electrical!;
    const mcu = m.components.find((c) => c.catalogId === "esp32-c3");
    assert.ok(mcu);
    assert.ok(mcu!.pinoutGrade === "verified" || mcu!.pinoutGrade === "derived");
  });

  it("sat-line with TP4056 is ERC-clean of LIPO_PROTECTION error", () => {
    const m = plan.electrical!;
    assert.ok(!m.erc.errors.some((e) => e.rule === "LIPO_PROTECTION"));
  });
});

describe("electrical ERC rules", () => {
  it("errors on lithium without protector", () => {
    const bare: BuildPlan = {
      id: "t",
      title: "Bare cell",
      description: "test",
      difficulty: "beginner",
      estimatedTime: "1h",
      estimatedCost: "$5",
      parts: [
        {
          id: "b",
          name: "Li-ion Battery",
          specification: "3.7V 16340",
          quantity: 1,
        },
      ],
      tools: [],
      steps: [],
      wiringConnections: [],
      warnings: [],
    };
    const m = buildElectricalModel(attachElectrical(bare).parts ? bare : bare);
    // need enrich first
    const trusted = applyTrustPipeline(bare);
    assert.ok(trusted.electrical);
    assert.ok(
      trusted.electrical!.erc.errors.some((e) => e.rule === "LIPO_PROTECTION") ||
        trusted.safetyReport?.findings.some((f) => /lipo|lithium|protection/i.test(f.id + f.title))
    );
    assert.equal(trusted.electrical!.erc.canExportPcb, false);
  });

  it("errors when OLED VCC on 5V wiring", () => {
    const plan: BuildPlan = {
      id: "t2",
      title: "Bad OLED",
      description: "esp oled",
      difficulty: "beginner",
      estimatedTime: "1h",
      estimatedCost: "$10",
      parts: [
        { id: "mcu", name: "ESP32-C3", specification: "dev board", quantity: 1 },
        { id: "oled", name: "OLED", specification: "SSD1306 I2C 0.96", quantity: 1 },
      ],
      tools: [],
      steps: [],
      wiringConnections: [
        { from: "ESP32-C3 5V", to: "OLED VCC", wireColor: "red" },
        { from: "ESP32-C3 GND", to: "OLED GND", wireColor: "black" },
      ],
      warnings: [],
    };
    const trusted = applyTrustPipeline(plan);
    const erc = trusted.electrical!.erc;
    // voltage domain or existing oled-5v safety
    const hasDomain =
      erc.errors.some((e) => e.rule.includes("VOLTAGE") || /5V/i.test(e.title)) ||
      trusted.safetyReport?.findings.some((f) => /oled|5v|voltage/i.test(f.id + f.title));
    assert.ok(hasDomain, JSON.stringify(erc.errors));
  });

  it("blocks PCB export when ERC has errors", () => {
    const bare: BuildPlan = {
      id: "t3",
      title: "x",
      description: "esp and cell no charger",
      difficulty: "beginner",
      estimatedTime: "1h",
      estimatedCost: "$5",
      parts: [
        { id: "m", name: "ESP32-C3", specification: "board", quantity: 1 },
        { id: "b", name: "16340 battery", specification: "3.7V Li-ion", quantity: 1 },
      ],
      tools: [],
      steps: [],
      wiringConnections: [{ from: "ESP32-C3 GND", to: "16340 battery -" }],
      warnings: [],
    };
    const t = applyTrustPipeline(bare);
    assert.equal(t.electrical?.erc.canExportPcb, false);
    assert.equal(t.electrical?.erc.canPublishKit, false);
  });
});
