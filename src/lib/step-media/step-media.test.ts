import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildStep } from "@/lib/types";
import { inferStepMediaKind, resolveStepMedia, isValidMediaKind } from "./resolve";
import { normalizeSvgForHtml } from "./svg-util";

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

  it("rejects invalid mediaKind without crashing", () => {
    assert.equal(isValidMediaKind("not_a_real_kind"), false);
    const m = resolveStepMedia({
      stepNumber: 99,
      title: "Mystery step",
      description: "do the thing",
      mediaKind: "garbage_kind" as never,
    });
    assert.ok(m.svg.includes("<svg"));
    assert.ok(!m.svg.includes("<?xml"));
    assert.ok(!m.svg.includes('height="100%"'));
  });

  it("normalizeSvgForHtml strips prolog and forces width 100% with no height", () => {
    const raw = `<?xml version="1.0"?><svg viewBox="0 0 10 10" width="100%" height="100%"><rect/></svg>`;
    const n = normalizeSvgForHtml(raw);
    assert.ok(!n.includes("<?xml"));
    assert.match(n, /width="100%"/);
    // height is intentionally omitted so viewBox drives the aspect ratio
    // (height="auto" is an invalid SVG length and spams console errors).
    assert.ok(!/height=/.test(n), "no height attribute");
  });

  it("every sat-line step resolves a non-empty diagram", () => {
    for (const s of demo.steps as BuildStep[]) {
      const m = resolveStepMedia(s);
      assert.ok(m.svg.length > 200, `step ${s.stepNumber} empty`);
      assert.ok(m.svg.includes("viewBox"), `step ${s.stepNumber} no viewBox`);
    }
  });

  it("generic checklist escapes quotes in title", () => {
    const m = resolveStepMedia({
      stepNumber: 1,
      title: 'Foo "bar" <baz>',
      description: "nothing matching",
    });
    assert.ok(!m.svg.includes('aria-label="Foo "bar"'));
    assert.ok(m.svg.includes("&quot;") || m.svg.includes("&#39;") || m.svg.includes("Foo"));
  });
});
