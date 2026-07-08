import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFormSpec } from "./schema";
import { matchFormSpec, scoreTemplates } from "./match";
import { resolveFormSpec } from "./resolve";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";
import { applyTrustPipeline } from "@/lib/trust";
import { buildProductVisual } from "../index";

function plan(over: Partial<BuildPlan> & Pick<BuildPlan, "id" | "title" | "parts">): BuildPlan {
  return {
    description: over.description || "",
    difficulty: "beginner",
    estimatedTime: "1h",
    estimatedCost: "$10",
    tools: [],
    steps: [],
    wiringConnections: [],
    warnings: [],
    ...over,
  };
}

describe("FormSpec schema", () => {
  it("parses canonical formSpec", () => {
    const s = parseFormSpec({
      templateId: "weather_stick",
      productCaption: "Outdoor sensor",
      materials: { base: "pla" },
    });
    assert.ok(s);
    assert.equal(s!.templateId, "weather_stick");
  });

  it("coerces aliases", () => {
    const s = parseFormSpec({ template: "rover", caption: "Bot" });
    assert.equal(s?.templateId, "robot_chassis");
  });

  it("rejects junk", () => {
    assert.equal(parseFormSpec({ foo: 1 }), undefined);
    assert.equal(parseFormSpec(null), undefined);
  });
});

describe("FormSpec match", () => {
  it("maps sat-line BOM to sat_clock", () => {
    const p = applyTrustPipeline(demo as unknown as BuildPlan);
    const m = matchFormSpec(p);
    assert.equal(m.templateId, "sat_clock");
    assert.ok(m.grade === "high" || m.grade === "medium");
  });

  it("maps rover text to robot_chassis", () => {
    const m = matchFormSpec(
      plan({
        id: "r",
        title: "Line following robot rover",
        description: "Wheeled chassis with motors and L298",
        parts: [
          { id: "1", name: "ESP32", specification: "MCU", quantity: 1 },
          { id: "2", name: "DC Motor", specification: "wheel drive", quantity: 2 },
          { id: "3", name: "Wheels", specification: "rubber", quantity: 2 },
        ],
      })
    );
    assert.equal(m.templateId, "robot_chassis");
  });

  it("maps plant stick to weather_stick", () => {
    const m = matchFormSpec(
      plan({
        id: "p",
        title: "Garden moisture stake",
        description: "Outdoor plant soil moisture sensor on a pole",
        parts: [
          { id: "1", name: "Soil moisture sensor", specification: "analog", quantity: 1 },
          { id: "2", name: "ESP32-C3", specification: "board", quantity: 1 },
        ],
      })
    );
    assert.equal(m.templateId, "weather_stick");
  });

  it("scores breadboard for empty-ish", () => {
    const ranked = scoreTemplates(plan({ id: "x", title: "test", parts: [] }));
    assert.ok(ranked.some((r) => r.id === "breadboard"));
  });
});

describe("FormSpec resolve + visual", () => {
  it("sat-line demo uses high-grade sat_clock", () => {
    const p = applyTrustPipeline(demo as unknown as BuildPlan);
    const spec = resolveFormSpec(p);
    assert.equal(spec.templateId, "sat_clock");
    assert.equal(spec.grade, "high");
    const pv = buildProductVisual(p);
    assert.equal(pv.form, "sat_clock");
    assert.match(pv.heroSvg, /12:42|Bamboo|pvBamboo|pvSolar/i);
    assert.ok(!pv.heroSvg.includes(">MCU</text>") || pv.heroSvg.includes("12:42"));
  });

  it("description-only plant plan is not a block diagram of cards only", () => {
    const p = plan({
      id: "plant-1",
      title: "Plant moisture stick",
      description: "Garden outdoor soil moisture on a stake",
      parts: [
        { id: "s", name: "Soil moisture sensor", specification: "probe", quantity: 1 },
        { id: "m", name: "ESP32-C3", specification: "dev board", quantity: 1 },
      ],
    });
    const pv = buildProductVisual(p);
    assert.equal(pv.form, "weather_stick");
    assert.match(pv.heroSvg, /ellipse|mast|sensor|stake|stick|pvMetal/i);
  });

  it("plan.formSpec wins over match", () => {
    const p = plan({
      id: "x",
      title: "Anything",
      parts: [{ id: "1", name: "ESP32", specification: "mcu", quantity: 1 }],
      formSpec: {
        templateId: "sensor_pod",
        params: {},
        materials: {},
        layers: {},
        productCaption: "Forced pod",
        source: "llm",
        grade: "assumed",
      },
    });
    assert.equal(resolveFormSpec(p).templateId, "sensor_pod");
  });
});
