import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import {
  parseStepGrade,
  buildStepGradeUser,
  gradePlanSteps,
} from "./step-grade";

const demo = () => applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);

test("parser clamps score to 1-5 and keeps issues", () => {
  const g = parseStepGrade(6, '{"score": 4, "issues": ["SDA/SCL could be clearer"]}');
  assert.equal(g.score, 4);
  assert.deepEqual(g.issues, ["SDA/SCL could be clearer"]);
  assert.equal(parseStepGrade(1, '{"score": 9, "issues": []}').score, 5, "9 clamps to 5");
  assert.equal(parseStepGrade(1, '{"score": 0, "issues": []}').score, 1, "0 clamps into the 1-5 range");
  assert.equal(parseStepGrade(1, '{"issues": []}').score, 0, "missing score → needs review");
});

test("parser flags-on-abstain: garbage/prose → score 0 with a review note (never a false pass)", () => {
  assert.equal(parseStepGrade(1, "looks great to me").score, 0);
  assert.equal(parseStepGrade(1, "").score, 0);
  assert.ok(parseStepGrade(1, "{broken").issues[0].includes("review"));
});

test("parser extracts JSON from fenced/prose output", () => {
  const g = parseStepGrade(2, 'Sure:\n```json\n{"score": 2, "issues": ["no pin numbers"]}\n```');
  assert.equal(g.score, 2);
  assert.deepEqual(g.issues, ["no pin numbers"]);
});

test("prompt carries the derived connections so the grader can catch prose/fact drift", () => {
  const plan = demo();
  const s6 = plan.steps.find((s) => s.stepNumber === 6)!;
  const user = buildStepGradeUser(plan, s6);
  assert.match(user, /DERIVED CONNECTIONS/);
  assert.match(user, /blue wire: ESP32-C3.*SDA/i);
  assert.match(user, /STEP 6:/);
});

test("gradePlanSteps grades every step and fails safe (score 0) when the model throws", async () => {
  const plan = demo();
  let calls = 0;
  const boom = await gradePlanSteps(plan, async () => {
    calls++;
    throw new Error("api down");
  });
  assert.equal(boom.length, plan.steps.length);
  assert.equal(calls, plan.steps.length);
  assert.ok(boom.every((g) => g.score === 0));

  const good = await gradePlanSteps(plan, async () => '{"score": 5, "issues": []}');
  assert.ok(good.every((g) => g.score === 5));
});
