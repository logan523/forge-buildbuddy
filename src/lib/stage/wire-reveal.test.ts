import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssemblyRecipe } from "@/lib/product-3d";
import { wireRevealPhaseIndex, wireRevealT } from "./wire-reveal";

/** Tiny hand-built recipe: phase 1 reveals the i2c_sda net, the last phase
 * (wildcard) catches everything else. No scene/parts needed — pure. */
function makeFixtureRecipe(): AssemblyRecipe {
  return {
    templateId: "test_fixture",
    productLabel: "Wire reveal fixture",
    parts: [],
    joints: [],
    phases: [
      { id: "phase-0", index: 0, title: "Phase 0", callout: "", addsParts: [], addsJoints: [], addsNets: [] },
      {
        id: "phase-1",
        index: 1,
        title: "Phase 1",
        callout: "",
        addsParts: [],
        addsJoints: [],
        addsNets: ["i2c_sda"],
      },
      {
        id: "phase-2",
        index: 2,
        title: "Complete",
        callout: "",
        addsParts: [],
        addsJoints: [],
        addsNets: ["*"],
      },
    ],
  };
}

describe("wireRevealPhaseIndex", () => {
  const recipe = makeFixtureRecipe();

  it("matches the reveal phase case-insensitively", () => {
    assert.equal(wireRevealPhaseIndex({ netName: "I2C_SDA" }, recipe), 1);
  });

  it("matches as a substring, not only an exact name", () => {
    assert.equal(wireRevealPhaseIndex({ netName: "sensor_i2c_sda_bus" }, recipe), 1);
  });

  it("an unmatched net falls back to the last phase index", () => {
    assert.equal(wireRevealPhaseIndex({ netName: "totally_unrelated_net" }, recipe), 2);
  });

  it("the wildcard phase catches anything earlier phases don't match", () => {
    assert.equal(wireRevealPhaseIndex({ netName: "another_stray_signal" }, recipe), 2);
    assert.equal(wireRevealPhaseIndex({ netName: "vbus" }, recipe), 2);
  });
});

describe("wireRevealT", () => {
  const recipe = makeFixtureRecipe();
  const wire = { netName: "i2c_sda" }; // reveals at phase index 1

  it("draws on monotonically across its one-phase-wide window, clamped to [0,1]", () => {
    assert.equal(wireRevealT(wire, 0, recipe), 0, "never negative before the reveal phase");
    assert.equal(wireRevealT(wire, 1.0, recipe), 0);
    assert.equal(wireRevealT(wire, 1.5, recipe), 0.5);
    assert.equal(wireRevealT(wire, 2.0, recipe), 1);
    assert.equal(wireRevealT(wire, 3.0, recipe), 1, "stays clamped to 1 once scrub is well past reveal");
  });
});
