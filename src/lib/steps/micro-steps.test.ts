import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildMicroSteps } from "./micro-steps";

const demo = () => applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);

test("golden: step 6 fans its connections into one micro-step per wire", () => {
  const plan = demo();
  const s6 = plan.steps.find((s) => s.stepNumber === 6)!;
  const micro = s6.compiled?.microSteps ?? [];
  const conns = s6.compiled?.connections ?? [];

  assert.equal(micro.length, conns.length, "one micro-step per wire leg");
  assert.ok(micro.length >= 10, "step 6 has many wire legs, not 5 coarse actions");

  micro.forEach((m, i) => {
    assert.equal(m.index, i + 1, "1-based index");
    assert.equal(m.total, micro.length);
    assert.match(m.action, /^Solder the /, "verb-first action");
    // silkscreen labels only — never a physical position
    assert.ok(!/leftmost|rightmost|top pin|bottom pin/i.test(m.action));
    assert.ok(m.verify.tug.length > 0 && m.verify.continuity.includes(m.fromPin), "per-wire continuity names the pins");
  });
});

test("golden: grounds are wired first, then power, then signal", () => {
  const plan = demo();
  const micro = plan.steps.find((s) => s.stepNumber === 6)!.compiled!.microSteps!;
  const rankOf = (c: string) => ({ gnd: 0, ground: 0, power: 1, i2c: 2, signal: 3 }[c.toLowerCase()] ?? 4);
  for (let i = 1; i < micro.length; i++) {
    assert.ok(
      rankOf(micro[i - 1].netClass) <= rankOf(micro[i].netClass),
      `ordering: ${micro[i - 1].netClass} before ${micro[i].netClass}`
    );
  }
  assert.match(micro[0].netClass, /gnd|ground/i, "first wire is a ground");
});

test("golden: colors + voltage — SDA blue, SCL yellow, voltage only on power wires", () => {
  const plan = demo();
  const micro = plan.steps.find((s) => s.stepNumber === 6)!.compiled!.microSteps!;
  for (const m of micro) {
    if (/sda/i.test(m.action)) assert.equal(m.colorName, "blue");
    if (/scl/i.test(m.action)) assert.equal(m.colorName, "yellow");
    // voltage guidance appears only on power wires
    if (m.verify.voltage) assert.match(m.netClass, /power/i);
  }
  assert.ok(micro.some((m) => m.verify.voltage), "at least one power wire carries a voltage band");
});

test("stable + unique ids; first wire shows the technique; rescue is mapped", () => {
  const plan = demo();
  const micro = plan.steps.find((s) => s.stepNumber === 6)!.compiled!.microSteps!;
  const ids = new Set(micro.map((m) => m.id));
  assert.equal(ids.size, micro.length, "ids are unique per wire");
  assert.equal(micro.filter((m) => m.showTechnique).length, 1, "exactly one technique card");
  assert.ok(micro[0].showTechnique, "the first wire shows it");
  assert.ok(micro.some((m) => m.rescueSymptomId), "wires deep-link an inline rescue");
});

test("buildMicroSteps is pure — empty in, empty out", () => {
  assert.deepEqual(buildMicroSteps([], []), []);
});
