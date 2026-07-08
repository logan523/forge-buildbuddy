import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildStep } from "@/lib/types";
import { inferStepMediaKind, resolveStepMedia } from "./resolve";

describe("step media", () => {
  it("step 2 is oled_desolder with pad labels in SVG", () => {
    const step = (demo.steps as BuildStep[]).find((s) => s.stepNumber === 2)!;
    assert.equal(inferStepMediaKind(step), "oled_desolder");
    const m = resolveStepMedia(step);
    assert.equal(m.kind, "oled_desolder");
    assert.match(m.svg, /VCC|GND|SCL|SDA/);
    assert.match(m.svg, /header|Iron|pin/i);
  });

  it("step 1 is wire bend frame", () => {
    const step = (demo.steps as BuildStep[]).find((s) => s.stepNumber === 1)!;
    assert.equal(inferStepMediaKind(step), "wire_bend_frame");
    const m = resolveStepMedia(step);
    assert.match(m.svg, /8 cm|90|rectangle|brass/i);
  });

  it("step 6 is i2c wiring with colors", () => {
    const step = (demo.steps as BuildStep[]).find((s) => s.stepNumber === 6)!;
    assert.equal(inferStepMediaKind(step), "i2c_wiring");
    const m = resolveStepMedia(step);
    assert.match(m.svg, /SDA|SCL|3V3|5V/);
  });

  it("infers from title when mediaKind missing", () => {
    const k = inferStepMediaKind({
      stepNumber: 1,
      title: "Prepare the OLED display",
      description: "Remove header pins with iron",
    });
    assert.equal(k, "oled_desolder");
  });
});
