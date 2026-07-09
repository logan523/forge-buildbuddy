import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cylinderEulerFromDirection,
  applyEulerToUp,
  directionError,
  wireCubeRods,
  cubeCorners,
  rodEndpointError,
  assertSatFidelityParams,
  lerpVec3,
  SAT_FIDELITY,
} from "./geom-math";

describe("geom-math solid product rods", () => {
  it("wireCubeRods yields 12 rods of equal length = size", () => {
    const size = 62;
    const rods = wireCubeRods(size);
    assert.equal(rods.length, 12);
    for (const r of rods) {
      assert.ok(Math.abs(r.length - size) < 1e-6, `len ${r.length}`);
    }
  });

  it("cube has 8 corners spanning size", () => {
    const c = cubeCorners(60);
    assert.equal(c.length, 8);
    const xs = c.map((p) => p[0]);
    assert.equal(Math.max(...xs) - Math.min(...xs), 60);
  });

  it("applyEuler(+Y) ≈ dir for ±X ±Y ±Z (catches broken Euler hand-roll)", () => {
    const axes: [number, number, number][] = [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const dir of axes) {
      const e = cylinderEulerFromDirection(...dir);
      const got = applyEulerToUp(e);
      const err = directionError(got, dir);
      assert.ok(
        err < 1e-5,
        `dir ${dir} → euler ${e} → ${got} err=${err}`
      );
    }
  });

  it("all 12 cube rods: euler maps +Y onto edge dir (endpoint error ~0)", () => {
    const size = 68;
    const rods = wireCubeRods(size);
    for (const rod of rods) {
      const got = applyEulerToUp(rod.euler);
      // direction may be flipped ±dir — both valid for undirected edge
      const errFwd = directionError(got, rod.dir);
      const errBack = directionError(got, [-rod.dir[0], -rod.dir[1], -rod.dir[2]]);
      assert.ok(
        Math.min(errFwd, errBack) < 1e-5,
        `rod mid=${rod.mid} dir=${rod.dir} got=${got}`
      );
      const endErr = rodEndpointError(rod);
      assert.ok(
        endErr < SAT_FIDELITY.maxRodEndpointError,
        `endpoint error ${endErr} for mid ${rod.mid} (would be ~96 if X rods along Z)`
      );
    }
  });

  it("assertSatFidelityParams rejects hairline toy proportions", () => {
    const bad = assertSatFidelityParams({
      rodR: 0.5,
      cageSize: 40,
      solarDepth: 0.5,
      rootScale: 0.01,
      batteryRadius: 4,
      cameraDistance: 5,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.failures.length >= 4);
  });

  it("assertSatFidelityParams accepts life-size real-part gates", () => {
    const good = assertSatFidelityParams({
      rodR: SAT_FIDELITY.minRodRadiusMm,
      cageSize: 48,
      solarDepth: SAT_FIDELITY.minSolarDepthMm,
      rootScale: SAT_FIDELITY.minRootScale,
      batteryRadius: 8.25,
      batteryHeight: 34,
      espLongEdge: 22.5,
      cameraDistance: SAT_FIDELITY.maxCameraDistance,
    });
    assert.equal(good.ok, true, good.failures.join("; "));
  });

  it("assertSatFidelityParams rejects illustration-scale battery / cage", () => {
    const bad = assertSatFidelityParams({
      rodR: 2.5,
      cageSize: 68,
      solarDepth: 2.4,
      rootScale: 0.012,
      batteryRadius: 10.5,
      batteryHeight: 53,
      espLongEdge: 32,
      cameraDistance: 4,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.failures.some((f) => f.includes("cageSize") || f.includes("battery")));
  });

  it("lerpVec3 midpoints", () => {
    assert.deepEqual(lerpVec3([0, 0, 0], [10, 20, 30], 0.5), [5, 10, 15]);
  });
});
