import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnose, relevantSymptoms } from "./unstick";
import { applyTrustPipeline } from "./trust";
import type { BuildPlan } from "./types";
import demo from "@/data/sat-line.json";

describe("unstick", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const wiringStep = plan.steps.find((s) => /wire/i.test(s.title)) || plan.steps[5];
  const uploadStep = plan.steps.find((s) => /upload|code/i.test(s.title));

  it("offers blank_display for sat-line (has OLED)", () => {
    const symptoms = relevantSymptoms(plan, wiringStep);
    assert.ok(symptoms.some((s) => s.id === "blank_display"));
    assert.ok(symptoms.some((s) => s.id === "smoke_heat"));
  });

  it("ranks SDA/SCL swap high for blank display", () => {
    const diags = diagnose(plan, "blank_display", wiringStep);
    assert.ok(diags.length >= 2);
    assert.equal(diags[0].likelihood, "very_likely");
    assert.ok(diags.some((d) => d.id.includes("sda-scl") || /SDA|SCL|swap/i.test(d.title)));
  });

  it("smoke_heat leads with disconnect", () => {
    const diags = diagnose(plan, "smoke_heat");
    assert.ok(diags[0].id.includes("safety") || /disconnect|immediately/i.test(diags[0].title));
    assert.ok(diags[0].isolation || diags[0].actions[0]);
  });

  it("no_upload includes cable diagnosis", () => {
    const diags = diagnose(plan, "no_upload", uploadStep);
    assert.ok(diags.some((d) => /cable|USB|port/i.test(d.title + d.cause)));
  });

  it("merges step commonMistakes when symptom matches", () => {
    const step = plan.steps.find((s) => (s.commonMistakes?.length || 0) > 0);
    assert.ok(step, "demo should have commonMistakes after Phase 0");
    const diags = diagnose(plan, "general", step);
    assert.ok(diags.some((d) => d.source === "step" || d.id.startsWith("step-mistake")));
  });

  it("software step prioritizes upload symptom", () => {
    if (!uploadStep) return;
    const symptoms = relevantSymptoms(plan, uploadStep);
    assert.equal(symptoms[0].id, "no_upload");
  });
});
