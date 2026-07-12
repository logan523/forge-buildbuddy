import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PART_MODELS,
  normalizeModelId,
  unitToMm,
  partModelFor,
} from "./part-models";

describe("part-models open registry", () => {
  it("normalizeModelId collapses hyphen / underscore / case / edges", () => {
    assert.equal(normalizeModelId("esp32-c3"), "esp32_c3");
    assert.equal(normalizeModelId("ESP32_C3"), "esp32_c3");
    assert.equal(normalizeModelId("  esp32 c3 "), "esp32_c3");
    assert.equal(normalizeModelId("-esp32--c3-"), "esp32_c3");
  });

  it("unitToMm scales source units to millimetres", () => {
    assert.equal(unitToMm("mm"), 1);
    assert.equal(unitToMm("cm"), 10);
    assert.equal(unitToMm("m"), 1000);
    assert.equal(unitToMm(undefined), 1); // default mm
  });

  it("partModelFor resolves the ESP32-C3 model from either id-space", () => {
    const a = partModelFor("esp32_c3");
    const b = partModelFor("esp32-c3"); // hyphen (logical catalog id-space)
    assert.ok(a, "underscore id resolves");
    assert.ok(b, "hyphen id resolves to the same model");
    assert.equal(a!.url, "/models/parts/esp32_c3.glb");
    assert.equal(b!.url, a!.url);
  });

  it("partModelFor returns null for unknown / not-ready / empty ids (parametric fallback)", () => {
    assert.equal(partModelFor(null), null);
    assert.equal(partModelFor(undefined), null);
    assert.equal(partModelFor(""), null);
    assert.equal(partModelFor("totally_made_up_part"), null);
  });

  it("only glbReady models resolve — a false entry stays on the parametric fallback", () => {
    // Contract guard: flipping glbReady:false must hide a model even if its url is set.
    const key = "probe9"; // survives normalizeModelId unchanged
    const probe = { url: "/models/parts/probe9.glb", glbReady: false };
    const saved = PART_MODELS[key];
    PART_MODELS[key] = probe;
    try {
      assert.equal(partModelFor(key), null);
      PART_MODELS[key] = { ...probe, glbReady: true };
      assert.ok(partModelFor(key));
    } finally {
      if (saved === undefined) delete PART_MODELS[key];
      else PART_MODELS[key] = saved;
    }
  });

  it("the authored ESP32-C3 entry is identity-normalized (authored in Forge's pin frame)", () => {
    const m = PART_MODELS.esp32_c3;
    assert.ok(m);
    assert.equal(m.unit, "mm");
    assert.equal(m.centerToBbox, false); // recentering would slide the pin overlay off
    assert.equal(m.rotationDeg, undefined); // already board-in-XY / +Z up
  });
});
