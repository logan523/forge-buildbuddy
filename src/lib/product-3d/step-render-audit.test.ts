import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { auditPlanRender } from "./step-render-audit";

const demo = () => applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);

test("audit: the fixed demo renders every step cleanly — zero errors", () => {
  const findings = auditPlanRender(demo());
  const errors = findings.filter((f) => f.severity === "error");
  assert.deepEqual(
    errors,
    [],
    `expected no render errors, got:\n${errors.map((e) => `  step ${e.stepNumber} ${e.code}: ${e.detail}`).join("\n")}`
  );
});

test("audit: a wiring step whose focus points at a phantom part is flagged FOCUS_UNRESOLVED", () => {
  const plan = demo();
  const wiring = plan.steps.find((s) => s.compiled?.focusPartIds?.length);
  assert.ok(wiring, "precondition: a wiring step has focus");
  // Corrupt the focus so it resolves to no scene node (simulates a broken join).
  wiring!.compiled!.focusPartIds = ["not-a-real-part"];

  const findings = auditPlanRender(plan);
  const hit = findings.find((f) => f.stepNumber === wiring!.stepNumber && f.code === "FOCUS_UNRESOLVED");
  assert.ok(hit, "phantom focus is caught as an error");
  assert.equal(hit!.severity, "error");
});

test("audit: focus spanning every part is flagged FOCUS_TOO_BROAD (no useful zoom)", () => {
  const plan = demo();
  const step = plan.steps.find((s) => s.compiled?.focusPartIds?.length)!;
  // Focus on literally every part → framing the whole board, not a zoom.
  step.compiled!.focusPartIds = (plan.parts || []).map((p) => p.id);

  const findings = auditPlanRender(plan);
  assert.ok(
    findings.some((f) => f.stepNumber === step.stepNumber && f.code === "FOCUS_TOO_BROAD"),
    "whole-board focus is flagged"
  );
});

test("audit: findings are addressable — every finding names a real step", () => {
  const plan = demo();
  const nums = new Set(plan.steps.map((s) => s.stepNumber));
  for (const f of auditPlanRender(plan)) assert.ok(nums.has(f.stepNumber));
});
