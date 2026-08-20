import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { declareColor, emptyReality } from "@/lib/build-reality/reality";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function rawPlan(): BuildPlan {
  return JSON.parse(readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8"));
}

// ---- GOLDEN (transcript): "GND is brown" must flow to everything ----

test('golden: "GND is brown" re-keys compiled prose, micro-step speech, and the connection facts', () => {
  const reality = declareColor(emptyReality("sat-line"), { hex: "#92400e", name: "brown", netName: "GND" });
  const plan = applyTrustPipeline(rawPlan(), reality);
  const gndEdges = (plan.steps.flatMap((s) => s.compiled?.connections ?? [])).filter(
    (c) => c.netName.toUpperCase() === "GND"
  );
  assert.ok(gndEdges.length > 0, "fixture has GND legs");
  for (const c of gndEdges) {
    assert.equal(c.colorName, "brown");
    assert.equal(c.colorHex, "#92400e");
    assert.equal(c.colorSource, "user");
    assert.equal(c.canonicalColorName, "black", "the pedagogy name is preserved for scoring");
  }
  const gndMicro = plan.steps
    .flatMap((s) => s.compiled?.microSteps ?? [])
    .filter((m) => m.netName.toUpperCase() === "GND");
  assert.ok(gndMicro.length > 0);
  for (const m of gndMicro) {
    assert.match(m.action, /brown wire/, "spoken/printed instruction says the builder's color");
  }
});

test("golden: free-text label wins in prose — 'the short orange one'", () => {
  const reality = declareColor(emptyReality("sat-line"), {
    hex: "#ea580c",
    name: "orange",
    label: "the short orange one",
    netName: "GND",
  });
  const plan = applyTrustPipeline(rawPlan(), reality);
  const m = plan.steps.flatMap((s) => s.compiled?.microSteps ?? []).find((x) => x.netName.toUpperCase() === "GND");
  assert.ok(m);
  assert.match(m!.action, /the short orange one wire/);
});

// ---- eng E5: declarations never move wires between steps ----

test("E5: declaring a color never changes edge→step assignment", () => {
  const before = applyTrustPipeline(rawPlan());
  const reality = declareColor(emptyReality("sat-line"), { hex: "#92400e", name: "brown", netName: "GND" });
  const after = applyTrustPipeline(rawPlan(), reality);
  const mapOf = (p: BuildPlan) =>
    p.steps.map((s) => [s.stepNumber, (s.compiled?.connections ?? []).map((c) => c.id).sort()]);
  assert.deepEqual(mapOf(after), mapOf(before));
});

// ---- byte-identical without reality (the no-regression golden) ----

test("no reality (or an empty one) compiles byte-identical to today", () => {
  // builtAt is a per-run wall-clock stamp that predates this cycle — the
  // only legitimate difference between two runs. Everything else must match.
  const norm = (p: BuildPlan) => JSON.stringify(p).replace(/"builtAt":"[^"]+"/g, '"builtAt":"X"');
  const a = norm(applyTrustPipeline(rawPlan()));
  const b = norm(applyTrustPipeline(rawPlan(), undefined));
  const c = norm(applyTrustPipeline(rawPlan(), emptyReality("sat-line")));
  assert.equal(a, b);
  assert.equal(a, c, "empty reality stamps nothing");
});

// ---- eng E3 conformance: one resolution point for every renderer ----

test("E3 conformance: the model-level stamp (which the 3D harness + panels read) equals the compiled connection color", () => {
  const reality = declareColor(emptyReality("sat-line"), { hex: "#92400e", name: "brown", netName: "GND" });
  const plan = applyTrustPipeline(rawPlan(), reality);
  const compiledGnd = plan.steps
    .flatMap((s) => s.compiled?.connections ?? [])
    .find((cn) => cn.netName.toUpperCase() === "GND");
  assert.ok(compiledGnd);
  // harness.ts:422, connection-spars.ts, and missing-device-panel all resolve
  // via `net.displayColorHex ?? netColorFor(...)` — so stamp == compiled is
  // exactly the "3D tube color equals prose color" invariant.
  const gndNet = plan.electrical!.nets.find((n) => n.name.toUpperCase() === "GND");
  assert.ok(gndNet);
  assert.equal(gndNet!.displayColorHex?.toLowerCase(), compiledGnd!.colorHex.toLowerCase());
  assert.equal(gndNet!.displayColorSource, "user");
});

// ---- per-connection beats per-net ----

test("a single-leg declaration overrides just that leg; siblings keep the net color", () => {
  let reality = declareColor(emptyReality("sat-line"), { hex: "#92400e", name: "brown", netName: "GND" });
  const base = applyTrustPipeline(rawPlan(), reality);
  const legs = base.steps.flatMap((s) => s.compiled?.connections ?? []).filter((c) => c.netName.toUpperCase() === "GND");
  assert.ok(legs.length >= 2, "need 2+ GND legs for this test");
  const target = legs[0];
  reality = declareColor(reality, { hex: "#e2e8f0", name: "white", connectionId: target.id });
  const plan = applyTrustPipeline(rawPlan(), reality);
  const after = plan.steps.flatMap((s) => s.compiled?.connections ?? []).filter((c) => c.netName.toUpperCase() === "GND");
  assert.equal(after.find((c) => c.id === target.id)?.colorName, "white");
  assert.equal(after.find((c) => c.id !== target.id)?.colorName, "brown");
});
