/**
 * Skill goldens — encode the taste once so regressions fail here, not in dogfood.
 * Each goldenId listed on a skill should appear in a test name or assertion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { netColorFor, wireColorName } from "@/lib/wire-colors";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import { isolationCulprit, buildIsolationWalk } from "@/lib/isolation-walk";
import { isolatePartIds } from "@/lib/stage/step-isolation";
import { auditPlanRender } from "@/lib/product-3d/step-render-audit";
import { SKILLS } from "./catalog";

function demo(): BuildPlan {
  return applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
}

describe("skill goldens", () => {
  it("every skill goldenId is unique and non-empty", () => {
    const ids = SKILLS.flatMap((s) => s.goldenIds);
    assert.ok(ids.length >= 6);
    assert.equal(new Set(ids).size, ids.length, "duplicate golden ids");
  });

  it("golden wire-one-color-authority: SDA blue / SCL yellow", () => {
    // i2c-sda-blue-scl-yellow + wire-one-color-authority
    const sda = wireColorName(netColorFor("i2c", undefined, "I2C_SDA"));
    const scl = wireColorName(netColorFor("i2c", undefined, "I2C_SCL"));
    assert.equal(sda.toLowerCase(), "blue");
    assert.equal(scl.toLowerCase(), "yellow");
  });

  it("golden wire-one-no-ordinal-pins: micro-steps use silkscreen, not leftmost/rightmost", () => {
    const plan = demo();
    const micro = plan.steps.flatMap((s) => s.compiled?.microSteps ?? []);
    assert.ok(micro.length > 0);
    for (const m of micro) {
      assert.ok(!/\b(leftmost|rightmost|third pin from)\b/i.test(m.action));
      assert.ok(m.fromPin && m.toPin);
    }
  });

  it("golden i2c-addr-alt-ok: OLED expected addresses include 0x3C and/or 0x3D", () => {
    const plan = demo();
    const devices = expectedI2cAddresses(plan);
    const oled = devices.find((d) => /oled|ssd1306/i.test(d.catalogId + d.label));
    assert.ok(oled, "demo should expect an OLED on I2C");
    const hex = oled!.addresses;
    assert.ok(hex.includes(0x3c) || hex.includes(0x3d), String(hex));
  });

  it("golden isolate-wiring-not-full-product: wiring focus is a subset of parts", () => {
    const plan = demo();
    const wiring = plan.steps.find((s) => (s.compiled?.focusPartIds?.length ?? 0) > 0)!;
    const focus = isolatePartIds(wiring.compiled!.focusPartIds, null)!;
    assert.ok(focus.length >= 1);
    assert.ok(focus.length < (plan.parts?.length ?? 99), "must not focus the whole BOM");
  });

  it("golden isolate-wiring-not-full-product: render audit has zero errors on demo", () => {
    const errors = auditPlanRender(demo()).filter((f) => f.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.detail).join("; "));
  });

  it("golden isolation-culprit-last-added: culprit is the part that broke the walk", () => {
    const plan = demo();
    const walk = buildIsolationWalk(plan.parts || []);
    assert.ok(walk && walk.addOrder.length >= 1);
    const brokeAt = walk!.addOrder.length - 1;
    const name = isolationCulprit(walk!, brokeAt);
    assert.equal(name, walk!.addOrder[brokeAt]);
  });

  it("golden part-id-catalog-not-prose: demo parts carry real names (not empty)", () => {
    const plan = demo();
    for (const p of plan.parts || []) {
      assert.ok((p.name || "").trim().length > 1, p.id);
    }
  });

  it("golden flash-human-confirm: skill lists human-confirm guidance", () => {
    const flash = SKILLS.find((s) => s.id === "esp32c3-flash")!;
    assert.match(flash.guidance, /Human must confirm flash/i);
  });
});
