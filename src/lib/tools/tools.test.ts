/**
 * Tools facade smoke — every export must stay importable (P1.1 surface).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import {
  attachCompiledFacts,
  auditConformance,
  auditPlanHarness,
  auditPlanRender,
  isolatePartIds,
  resolveGoal,
} from "./index";
import { applyTrustPipeline } from "@/lib/trust";

describe("tools facade", () => {
  it("compile + audits + isolation run on the demo plan", () => {
    const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
    assert.equal(plan.compiledFacts?.status, "ok");

    const table = auditConformance(plan);
    assert.equal(table.available, true);
    assert.equal(table.traced, true);

    const harness = auditPlanHarness(plan);
    assert.equal(harness.available, true);
    assert.equal(harness.traced, true);

    const render = auditPlanRender(plan);
    assert.equal(
      render.filter((f) => f.severity === "error").length,
      0,
      "demo has zero render errors"
    );

    const wiring = plan.steps.find((s) => (s.compiled?.focusPartIds?.length ?? 0) > 0);
    assert.ok(wiring);
    const parts = isolatePartIds(wiring!.compiled!.focusPartIds, null);
    assert.ok(parts && parts.length >= 1);

    const goal = resolveGoal(wiring!);
    assert.ok(goal.length > 0 && goal.length <= 160);
  });

  it("attachCompiledFacts is re-exported", () => {
    const bare = JSON.parse(JSON.stringify(satLine)) as BuildPlan;
    // Strip any pre-baked compiled if present so the tool path is exercised.
    bare.steps = (bare.steps || []).map(({ compiled: _c, ...s }) => s);
    bare.compiledFacts = undefined;
    const out = attachCompiledFacts(bare);
    assert.ok(out.compiledFacts);
  });
});
