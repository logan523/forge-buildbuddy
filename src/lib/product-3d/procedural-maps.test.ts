import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearProceduralMapCache,
  getProceduralMap,
  makeBrushedMetalNormal,
  makeCopperPadNormal,
  makeFr4Roughness,
  makePvcNormal,
  proceduralMapSize,
} from "./procedural-maps";
import { getMaterialPreset } from "./materials";

describe("procedural maps + material contrast (graphics realism)", () => {
  it("factories return textures with size ≥ 64", () => {
    clearProceduralMapCache();
    assert.ok(proceduralMapSize("brushed_normal") >= 64);
    assert.ok(proceduralMapSize("fr4_roughness") >= 64);
    assert.ok(proceduralMapSize("pvc_normal") >= 64);
    assert.ok(proceduralMapSize("copper_normal") >= 64);
    // Singletons cache
    assert.equal(makeBrushedMetalNormal(), makeBrushedMetalNormal());
    assert.equal(makeFr4Roughness(), makeFr4Roughness());
    assert.equal(makePvcNormal(), makePvcNormal());
    assert.equal(makeCopperPadNormal(), makeCopperPadNormal());
    assert.ok(getProceduralMap("brushed_normal"));
  });

  it("brass vs pcb_green presets are metal/plastic split", () => {
    const brass = getMaterialPreset("brass");
    const pcb = getMaterialPreset("pcb_green");
    assert.ok(brass.metalness >= 0.9, `brass metalness ${brass.metalness}`);
    assert.ok(brass.roughness <= 0.22, `brass roughness ${brass.roughness}`);
    assert.ok((brass.envMapIntensity ?? 0) >= 1.5);
    assert.ok(pcb.metalness <= 0.1, `pcb metalness ${pcb.metalness}`);
    assert.ok(pcb.roughness >= 0.55, `pcb roughness ${pcb.roughness}`);
    assert.ok(brass.metalness > pcb.metalness);
    assert.ok(brass.roughness < pcb.roughness);
  });

  it("oled_glass has transmission + high clearcoat", () => {
    const g = getMaterialPreset("oled_glass");
    assert.ok((g.transmission ?? 0) >= 0.15);
    assert.equal(g.clearcoat, 1);
    assert.ok((g.clearcoatRoughness ?? 1) <= 0.08);
  });
});
