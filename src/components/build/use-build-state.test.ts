import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuildPlan, BuildStep } from "@/lib/types";
import {
  buildReducer,
  initialBuildState,
  progressPct,
  needsSafetyAck,
  type BuildState,
  type BuildAction,
} from "./use-build-state";

const step = (n: number): BuildStep => ({
  stepNumber: n,
  title: `Step ${n}`,
  description: `Do thing ${n}`,
});

const run = (state: BuildState, ...actions: BuildAction[]) =>
  actions.reduce(buildReducer, state);

test("characterization walk: prep → start → step 1 → complete → next → drawer → prev", () => {
  // Mirrors the Slice-0 browser baseline: prep first, Start building,
  // mark step 1 complete, Next to step 2, open the Parts drawer.
  let s = initialBuildState({ planId: "sat-line", startAtPrep: true });
  assert.equal(s.showPrep, true);
  assert.equal(s.stepIndex, 0);

  s = run(s, { type: "START_BUILD" });
  assert.equal(s.showPrep, false, "Start building enters the build view");

  s = run(s, { type: "TOGGLE_COMPLETE", stepNumber: 1 });
  assert.ok(s.completed.has(1), "mark complete records the step number");

  s = run(s, { type: "NEXT_STEP", max: 11 });
  assert.equal(s.stepIndex, 1, "Next advances to step 2 of 11");

  s = run(s, { type: "OPEN_DRAWER", drawer: "parts" });
  assert.equal(s.drawer, "parts", "Parts drawer opens");

  s = run(s, { type: "PREV_STEP" });
  assert.equal(s.stepIndex, 0);

  s = run(s, { type: "TOGGLE_COMPLETE", stepNumber: 1 });
  assert.ok(!s.completed.has(1), "toggling again un-completes");
});

test("step navigation clamps at both ends and on mode shrink", () => {
  let s = run(initialBuildState({ planId: "p", startAtPrep: false }), {
    type: "PREV_STEP",
  });
  assert.equal(s.stepIndex, 0, "prev at 0 stays at 0");

  s = run(s, { type: "GO_STEP", index: 10, max: 11 });
  assert.equal(s.stepIndex, 10);
  s = run(s, { type: "NEXT_STEP", max: 11 });
  assert.equal(s.stepIndex, 10, "next at last step stays");

  // Quick mode shrinks the visible list — index must clamp (old useEffect behavior).
  s = run(s, { type: "CLAMP_STEP", max: 4 });
  assert.equal(s.stepIndex, 3);
});

test("exactly one drawer at a time; prep closes drawers", () => {
  let s = initialBuildState({ planId: "p", startAtPrep: false });
  s = run(
    s,
    { type: "OPEN_DRAWER", drawer: "firmware", fwSketchId: "blink" },
    { type: "OPEN_DRAWER", drawer: "case" }
  );
  assert.equal(s.drawer, "case", "opening a drawer replaces the previous one");
  assert.equal(s.fwSketchId, "blink", "firmware sketch selection is preserved");

  s = run(s, { type: "OPEN_PREP" });
  assert.equal(s.drawer, null, "returning to prep closes drawers");
  assert.equal(s.showPrep, true);

  s = run(s, { type: "OPEN_DRAWER", drawer: "unstick" });
  assert.equal(s.unstickSymptom, null, "unstick opens with a fresh symptom");
  s = run(s, { type: "CLOSE_DRAWER" });
  assert.equal(s.drawer, null);
  assert.equal(s.publishMsg, "", "close clears publish message");
});

// R2 (eng review, REGRESSION RULE): progress % counted completed step numbers
// from ALL modes against the FILTERED step list — quick mode could exceed 100%.
test("R2 regression: progressPct counts only steps visible in the current mode", () => {
  const fullSteps = Array.from({ length: 11 }, (_, i) => step(i + 1));
  const quickSteps = [step(1), step(3), step(5), step(7)];

  assert.equal(progressPct(new Set(), fullSteps), 0);
  assert.equal(progressPct(new Set([1, 2]), fullSteps), 18, "2 of 11 = 18%");

  const allDone = new Set(fullSteps.map((s) => s.stepNumber));
  assert.equal(
    progressPct(allDone, quickSteps),
    100,
    "old code returned 275% here (11 completed / 4 visible)"
  );

  assert.equal(
    progressPct(new Set([1, 2, 4]), quickSteps),
    25,
    "completed steps hidden by the mode filter do not count"
  );

  assert.equal(progressPct(new Set([1]), []), 0, "zero visible steps never divides by zero");
});

test("needsSafetyAck gates only when the plan has critical findings", () => {
  const clean = { safetyReport: undefined, electrical: undefined } as unknown as BuildPlan;
  assert.equal(needsSafetyAck(clean, false), false, "demo baseline: no ack checkbox");

  const critical = {
    safetyReport: { requiresAttention: true },
  } as unknown as BuildPlan;
  assert.equal(needsSafetyAck(critical, false), true);
  assert.equal(needsSafetyAck(critical, true), false, "acknowledging unlocks Start");

  const dirtyErc = {
    electrical: { erc: { clean: false } },
  } as unknown as BuildPlan;
  assert.equal(needsSafetyAck(dirtyErc, false), true);
});
