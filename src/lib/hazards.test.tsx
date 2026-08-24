import { test } from "node:test";
import assert from "node:assert/strict";
import { hazardLabel, isBlockingHazard, needsSafetyAck } from "./hazards";

test("enum tokens never reach a beginner raw", () => {
  assert.equal(hazardLabel("LIPO"), "Lithium battery");
  assert.equal(hazardLabel("ESD_SENSITIVE"), "Static-sensitive parts");
  // An unknown tag is still a hazard. Title-casing it is worse than a real
  // label and far better than dropping it.
  assert.equal(hazardLabel("SHARP_EDGES"), "Sharp edges");
  for (const t of ["LIPO", "MAINS", "WHATEVER_NEW_TAG"]) {
    assert.doesNotMatch(hazardLabel(t), /_/, `"${t}" leaked an underscore token`);
  }
});

test("only hazards that can hurt you gate the build", () => {
  assert.equal(isBlockingHazard("LIPO"), true);
  assert.equal(isBlockingHazard("MAINS"), true);
  assert.equal(isBlockingHazard("HIGH_CURRENT"), true);
  // A soldering-iron warning does not get to interrupt anyone.
  assert.equal(isBlockingHazard("SOLDERING"), false);
  assert.equal(isBlockingHazard("ESD_SENSITIVE"), false);
});

test("the weather clock's real tags demand an acknowledgement", () => {
  assert.equal(needsSafetyAck(["LIPO", "ESD_SENSITIVE"]), true);
  assert.equal(needsSafetyAck(["ESD_SENSITIVE", "SOLDERING"]), false);
  assert.equal(needsSafetyAck([]), false);
  assert.equal(needsSafetyAck(undefined), false);
});

test("the acknowledgement is recorded with a time, not a boolean", async () => {
  // A bare `true` is not evidence of anything. The record has to be able to
  // say WHEN someone was told a lithium cell can vent.
  await import("../test-utils/dom");
  const { loadMeta, touchPlan } = await import("./storage");
  const id = `hazard-test-${Math.random().toString(36).slice(2)}`;

  assert.equal(loadMeta(id)?.safetyAckAt, undefined, "acked before being asked");
  const at = new Date().toISOString();
  touchPlan(id, { safetyAckAt: at });
  assert.equal(loadMeta(id)?.safetyAckAt, at);

  // And it survives an unrelated touch — opening the build again must not
  // silently clear it, nor re-prompt someone who already read it.
  touchPlan(id, { buildMode: "full" });
  assert.equal(loadMeta(id)?.safetyAckAt, at, "the acknowledgement was lost on a later write");
});

test("the gate does not print the same warning twice", async () => {
  // Seen on screen: an authored warning and a derived finding rendered as two
  // cards with the same sentence, at the bottom of the safety screen. The
  // validator reads the same plan the warnings came from, so restatement is
  // the normal case, not an edge one.
  await import("../test-utils/dom");
  const { render, screen, cleanup } = await import("@testing-library/react");
  const { SafetyGate } = await import("../components/bench/safety-gate");
  const weatherClock = (await import("@/data/solar-weather-clock.json")).default;
  const { applyTrustPipeline } = await import("./trust");

  const plan = applyTrustPipeline(weatherClock as never);
  render(<SafetyGate plan={plan} onAcknowledge={() => {}} onHome={() => {}} />);

  // "Li-ion cells can fire if shorted, crushed, or charged incorrectly" appears
  // in both an authored warning and a derived finding. It must render once.
  const hits = screen.queryAllByText(/cells can fire if shorted/i);
  assert.equal(hits.length, 1, `the same warning rendered ${hits.length} times`);
  cleanup();
});
