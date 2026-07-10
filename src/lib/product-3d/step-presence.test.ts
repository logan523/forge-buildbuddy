import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuildPlan, BuildStep } from "@/lib/types";
import type { SceneNode3D } from "./types";
import { deriveStepPresence } from "./step-presence";

const node = (id: string, label: string, partId?: string): SceneNode3D =>
  ({
    id,
    layer: "body",
    label,
    partId,
    geom: { kind: "box" },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: {},
  }) as unknown as SceneNode3D;

const step = (n: number, title: string, description = "", youNeed: string[] = []): BuildStep =>
  ({ stepNumber: n, title, description, youNeed }) as BuildStep;

const plan = {
  parts: [
    { id: "p-mast", name: "Aluminum Mast Pole" },
    { id: "p-sensor", name: "SHT31 Temperature Sensor" },
    { id: "p-solar", name: "Solar Panel 5V" },
  ],
} as unknown as BuildPlan;

const nodes = [
  node("mast", "Mast", "p-mast"),
  node("sensor-head", "Sensor Head", "p-sensor"),
  node("solar", "Solar Panel", "p-solar"),
  node("base", "Ground Stake"), // never mentioned → structural, always present
];

test("presence accumulates: parts arrive when first mentioned, then stay", () => {
  const steps = [
    step(1, "Plant the mast", "Drive the aluminum mast into position"),
    step(2, "Mount the sensor head", "Attach the temperature sensor to the mast"),
    step(3, "Add solar power", "", ["Solar Panel 5V"]),
  ];
  const presence = deriveStepPresence(plan, steps, nodes);
  assert.ok(presence, "3/3 steps match — derivation trusted");

  const s0 = presence!.presentByStep.get(0)!;
  assert.ok(s0.has("mast"));
  assert.ok(!s0.has("sensor-head"), "sensor has not arrived on step 1");
  assert.ok(!s0.has("solar"), "never the finished product on step 1");
  assert.ok(s0.has("base"), "unmentioned structural nodes are always present");

  const s1 = presence!.presentByStep.get(1)!;
  assert.ok(s1.has("mast") && s1.has("sensor-head"));
  assert.deepEqual([...presence!.arrivedByStep.get(1)!], ["sensor-head"]);

  const s2 = presence!.presentByStep.get(2)!;
  assert.ok(s2.has("solar"), "youNeed mentions count as arrival");
  assert.equal(s2.size, 4, "everything present by the final step");
});

test("guard: weak matching (<60% of steps) returns null — never wrongly hide", () => {
  const steps = [
    step(1, "Do a thing"),
    step(2, "Do another thing"),
    step(3, "Mount the sensor head"),
  ];
  assert.equal(deriveStepPresence(plan, steps, nodes), null);
});

test("empty inputs never throw", () => {
  assert.equal(deriveStepPresence(plan, [], nodes), null);
  assert.equal(deriveStepPresence(plan, [step(1, "x")], []), null);
});
