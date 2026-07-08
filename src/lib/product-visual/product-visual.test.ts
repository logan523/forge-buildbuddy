import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";
import { buildProductVisual, classifyRole, matchPartsInStep } from "./index";

describe("product visual", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const pv = buildProductVisual(plan);

  it("builds nodes for sat-line electronics + base", () => {
    assert.ok(pv.scene.nodes.length >= 6, `expected many nodes, got ${pv.scene.nodes.length}`);
    const roles = new Set(pv.scene.nodes.map((n) => n.role));
    assert.ok(roles.has("mcu"));
    assert.ok(roles.has("display"));
    assert.ok(roles.has("battery") || roles.has("power"));
  });

  it("stage 0 is full product physical form (not block diagram)", () => {
    const s0 = pv.stageForStep("prep");
    assert.equal(s0.stepNumber, 0);
    assert.equal(s0.mode, "full");
    assert.equal(s0.visiblePartIds.length, pv.scene.nodes.length);
    assert.match(pv.heroSvg, /<svg/);
    // Physical sat-clock form markers
    assert.equal(pv.form, "sat_clock");
    assert.match(pv.heroSvg, /bamboo|Bamboo|brass|Brass|solar|12:42/i);
    // Must NOT be the old module-card block diagram only
    assert.ok(!pv.heroSvg.includes(">MCU</text>") || pv.heroSvg.includes("ESP32") || pv.heroSvg.includes("12:42"));
  });

  it("mid step reveals subset or highlight", () => {
    const mid = Math.min(3, (plan.steps?.length || 1) - 1);
    const stage = pv.stageForStep(mid);
    assert.ok(stage.stepNumber === mid + 1);
    assert.ok(stage.visiblePartIds.length >= 1);
    assert.ok(stage.visiblePartIds.length <= pv.scene.nodes.length);
    const svg = pv.svgForStep(mid);
    assert.match(svg, /<svg/);
  });

  it("late step approaches full assembly", () => {
    const last = (plan.steps?.length || 1) - 1;
    const stage = pv.stageForStep(last);
    // verify/software steps show full
    assert.ok(stage.visiblePartIds.length >= Math.min(4, pv.scene.nodes.length));
  });

  it("tech labels include refs when electrical present", () => {
    const withRef = pv.scene.nodes.filter((n) => n.ref);
    assert.ok(withRef.length >= 1, "expected designators after trust pipeline");
    const techSvg = pv.svgForStep("prep", true);
    assert.ok(/U\d|BT\d/.test(techSvg) || techSvg.includes("·"), techSvg.slice(0, 200));
  });

  it("classifyRole maps catalog-ish parts", () => {
    assert.equal(
      classifyRole({ id: "1", name: "ESP32-C3", specification: "dev board", quantity: 1 }),
      "mcu"
    );
    assert.equal(
      classifyRole({ id: "2", name: "OLED", specification: "SSD1306", quantity: 1 }),
      "display"
    );
  });

  it("matchPartsInStep finds OLED in wiring step text", () => {
    const step = {
      stepNumber: 1,
      title: "Wire the OLED display",
      description: "Connect ESP32-C3 GPIO4 to OLED SDA",
    };
    const matched = matchPartsInStep(step, plan.parts);
    assert.ok(matched.some((p) => /oled|display/i.test(p.name)));
  });
});
