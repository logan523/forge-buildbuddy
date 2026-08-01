import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchSkills, skillsDigest } from "./match";
import { SKILLS, skillById } from "./catalog";

describe("skills match", () => {
  it("catalog has exactly the v0 six skills", () => {
    assert.equal(SKILLS.length, 6);
    for (const id of [
      "part-identify",
      "wire-one-net",
      "i2c-ssd1306",
      "esp32c3-flash",
      "step-isolate",
      "isolation-walk",
    ]) {
      assert.ok(skillById(id), id);
    }
  });

  it("wiring + i2c nets load i2c and wire-one (capped ≤3)", () => {
    const hit = matchSkills({
      stepKind: "wiring",
      netClasses: ["i2c", "gnd"],
      stepBlob: "solder sda scl to oled",
    });
    const ids = hit.map((s) => s.id);
    assert.ok(ids.includes("i2c-ssd1306"), ids.join(","));
    assert.ok(ids.includes("wire-one-net"), ids.join(","));
    assert.ok(hit.length <= 3);
  });

  it("blank_display symptom loads isolation-walk and i2c skill", () => {
    const hit = matchSkills({
      symptom: "blank_display",
      stepBlob: "display is blank",
    });
    const ids = hit.map((s) => s.id);
    assert.ok(ids.includes("isolation-walk"));
    assert.ok(ids.includes("i2c-ssd1306"));
  });

  it("software flash keywords load esp32c3-flash", () => {
    const hit = matchSkills({
      stepKind: "software",
      stepBlob: "upload firmware flash the board",
    });
    assert.ok(hit.some((s) => s.id === "esp32c3-flash"));
  });

  it("unrelated context returns empty (no skill spam)", () => {
    assert.deepEqual(matchSkills({ stepBlob: "xyzzy" }), []);
  });

  it("digest is non-empty for matched skills", () => {
    const hit = matchSkills({ stepKind: "wiring", netClasses: ["i2c"] });
    assert.ok(skillsDigest(hit).includes("i2c-ssd1306") || skillsDigest(hit).includes("SDA"));
  });
});
