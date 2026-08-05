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

  it("brass vs pcb_green presets are matte with distinct color identity", () => {
    const brass = getMaterialPreset("brass");
    const pcb = getMaterialPreset("pcb_green");
    // Technical-light contract: everything is matte (metalness 0, roughness
    // high) — per-part color identity carries the distinction, not specular
    // response. Brass reads slightly smoother than the PCB.
    assert.equal(brass.metalness, 0, `brass metalness ${brass.metalness}`);
    assert.ok(brass.roughness >= 0.8, `brass roughness ${brass.roughness}`);
    assert.equal(pcb.metalness, 0, `pcb metalness ${pcb.metalness}`);
    assert.ok(pcb.roughness >= 0.9, `pcb roughness ${pcb.roughness}`);
    assert.ok(brass.roughness < pcb.roughness, "brass smoother than plastic PCB");
    assert.notEqual(brass.color, pcb.color, "color identity stays distinct");
  });

  it("oled_glass is matte (screen glow comes from emissive, not clearcoat)", () => {
    const g = getMaterialPreset("oled_glass");
    assert.ok(!("transmission" in g), "no transmission in the matte pipeline");
    assert.ok(!("clearcoat" in g), "no clearcoat in the matte pipeline");
    assert.ok(g.emissive != null, "the display face stays emissive");
  });
});
