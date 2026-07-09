import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildSatClockScene3D } from "./build-scene";
import { cadCameraForNodes, frameForNodeIds, sceneWorldBounds } from "./cad-frame";

describe("cad-frame modeler framing", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const scene = buildSatClockScene3D(plan);

  it("bounds enclose stand base and cage", () => {
    const b = sceneWorldBounds(scene.nodes, scene.rootScale);
    assert.ok(b.radius > 0.3, `radius ${b.radius}`);
    assert.ok(b.center[1] > 0.2, "center above ground");
    assert.ok(b.min[1] < b.center[1] && b.max[1] > b.center[1]);
  });

  it("cadCamera places eye outside bounds radius", () => {
    const b = sceneWorldBounds(scene.nodes, scene.rootScale);
    const cam = cadCameraForNodes(scene.nodes, scene.rootScale, 1.85);
    const dist = Math.hypot(
      cam.position[0] - cam.target[0],
      cam.position[1] - cam.target[1],
      cam.position[2] - cam.target[2]
    );
    assert.ok(dist > b.radius * 1.5, `cam dist ${dist} vs radius ${b.radius}`);
    assert.ok(cam.fov >= 35 && cam.fov <= 50);
  });

  it("camera is finite (never NaN black-screen)", () => {
    const cam = cadCameraForNodes(scene.nodes, scene.rootScale, 1.85);
    for (const n of [...cam.position, ...cam.target]) {
      assert.ok(Number.isFinite(n), String(n));
    }
  });

  it("frameForNodeIds inspects a single part tighter than full assembly", () => {
    const full = cadCameraForNodes(scene.nodes, scene.rootScale, 1.4);
    const part = frameForNodeIds(scene.nodes, ["brain"], scene.rootScale, 1.15);
    const fullDist = Math.hypot(
      full.position[0] - full.target[0],
      full.position[1] - full.target[1],
      full.position[2] - full.target[2]
    );
    const partDist = Math.hypot(
      part.position[0] - part.target[0],
      part.position[1] - part.target[1],
      part.position[2] - part.target[2]
    );
    assert.ok(partDist < fullDist, `inspect ${partDist} < full ${fullDist}`);
    assert.ok(part.fov <= full.fov);
    for (const n of [...part.position, ...part.target]) {
      assert.ok(Number.isFinite(n));
    }
  });
});
