import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initialWiringVerifyStatus,
  resolveBuildDoneGate,
} from "./build-done-gate";

describe("build done gate", () => {
  it("building while steps incomplete", () => {
    const g = resolveBuildDoneGate({
      allStepsComplete: false,
      expectedI2cCount: 2,
      wiringVerify: "pending",
    });
    assert.equal(g.phase, "building");
  });

  it("verify-board when complete + I2C + pending", () => {
    const g = resolveBuildDoneGate({
      allStepsComplete: true,
      expectedI2cCount: 2,
      wiringVerify: "pending",
    });
    assert.equal(g.phase, "verify-board");
    assert.equal(g.softSkipAllowed, true);
    assert.match(g.body, /2 I2C devices/);
  });

  it("celebrate when passed", () => {
    const g = resolveBuildDoneGate({
      allStepsComplete: true,
      expectedI2cCount: 2,
      wiringVerify: "passed",
    });
    assert.equal(g.phase, "celebrate");
    assert.match(g.body, /board answered/i);
  });

  it("celebrate when skipped (soft)", () => {
    const g = resolveBuildDoneGate({
      allStepsComplete: true,
      expectedI2cCount: 1,
      wiringVerify: "skipped",
    });
    assert.equal(g.phase, "celebrate");
    assert.match(g.body, /skipped/i);
  });

  it("celebrate immediately when no I2C devices", () => {
    const g = resolveBuildDoneGate({
      allStepsComplete: true,
      expectedI2cCount: 0,
      wiringVerify: "not-required",
    });
    assert.equal(g.phase, "celebrate");
  });

  it("initial status pending iff I2C expected", () => {
    assert.equal(initialWiringVerifyStatus(0), "not-required");
    assert.equal(initialWiringVerifyStatus(2), "pending");
  });
});
