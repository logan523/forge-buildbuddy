import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { encodePlanShare, decodePlanShare } from "./share";
import { filterStepsForMode } from "./modes";
import type { BuildPlan } from "./types";
import demo from "@/data/sat-line.json";
import { applyTrustPipeline } from "./trust";

describe("share encode/decode", () => {
  it("round-trips sat-line plan", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const enc = encodePlanShare(plan);
    assert.ok(enc.length > 100);
    const dec = decodePlanShare(enc);
    assert.ok(dec);
    assert.equal(dec!.title, plan.title);
    assert.equal(dec!.parts.length, plan.parts.length);
    assert.equal(dec!.steps.length, plan.steps.length);
  });

  it("rejects garbage", () => {
    assert.equal(decodePlanShare("not-valid!!!"), null);
  });
});

describe("build modes", () => {
  it("quick mode reduces sat-line step count but keeps core path", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const full = filterStepsForMode(plan, "full");
    const quick = filterStepsForMode(plan, "quick");
    assert.equal(full.length, plan.steps.length);
    assert.ok(quick.length <= full.length);
    assert.ok(quick.length >= 4);
    assert.ok(quick.some((s) => /wire|upload|code/i.test(s.title)));
  });
});
