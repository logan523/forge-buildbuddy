import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuildPlan } from "@/lib/types";
import { buildProductScene3D, resolveAssemblyFrame } from "@/lib/product-3d";
import { deriveAssemblyRecipe } from "./derive-recipe";
import { ghostTargetsForFrame } from "./ghost-target";

// Same minimal weather-station fixture as derive-recipe.test.ts, reconstructed
// here so this file stands alone. Lands on a non-sat template (robustness
// over brittleness — we only assert it's NOT the hand-authored sat_clock).
const nonSatPlan: BuildPlan = {
  id: "test-weather-station",
  title: "Solar weather mast station",
  description:
    "An outdoor weather station on a mast that reports temperature and humidity.",
  difficulty: "beginner",
  estimatedTime: "1-2 hours",
  estimatedCost: "$20-30",
  parts: [
    { id: "esp32-board", name: "ESP32 board", specification: "ESP32 dev board", quantity: 1 },
    {
      id: "bme280-sensor",
      name: "BME280 sensor",
      specification: "BME280 temp/humidity/pressure I2C sensor",
      quantity: 1,
    },
    {
      id: "battery-18650",
      name: "18650 battery",
      specification: "3.7V Li-ion 18650 cell",
      quantity: 1,
    },
  ],
  tools: [],
  steps: [
    { stepNumber: 1, title: "Mount the mast", description: "Set up the outdoor mast base." },
    {
      stepNumber: 2,
      title: "Attach the sensor head",
      description: "Attach the BME280 sensor to the mast head.",
    },
    {
      stepNumber: 3,
      title: "Wire the ESP32 board",
      description: "Wire the ESP32 board to the sensor.",
    },
    {
      stepNumber: 4,
      title: "Install the battery",
      description: "Install the 18650 battery for power.",
    },
  ],
  wiringConnections: [],
  warnings: [],
};

const scene = buildProductScene3D(nonSatPlan);
const recipe = deriveAssemblyRecipe(scene, nonSatPlan, undefined);

describe("ghostTargetsForFrame", () => {
  it("fixture sanity: derived (non-sat) template with multiple phases", () => {
    assert.notEqual(scene.templateId, "sat_clock");
    assert.ok(recipe.phases.length >= 2);
  });

  it("at integer scrub (phase 0): one ghost per phase-1 arrival with a joint, approach distance == explodeDistance", () => {
    const frame = resolveAssemblyFrame(recipe, 0);
    assert.equal(frame.phaseIndex, 0);

    const ghosts = ghostTargetsForFrame(scene, recipe, frame);

    const arrivingNext = recipe.phases[frame.phaseIndex + 1]!.addsParts;
    const jointByChild = new Map(recipe.joints.map((j) => [j.childPartId, j]));
    const expectedIds = arrivingNext.filter((id) => jointByChild.has(id));
    assert.ok(expectedIds.length >= 1, "fixture should have at least one arriving part with a joint");
    assert.equal(ghosts.length, expectedIds.length);

    for (const g of ghosts) {
      // ghost nodeIds must belong to phase 1's addsParts.
      assert.ok(arrivingNext.includes(g.nodeId), `ghost ${g.nodeId} is not in phase 1's addsParts`);

      const joint = jointByChild.get(g.nodeId)!;
      const dx = g.approachFrom[0] - g.approachTo[0];
      const dy = g.approachFrom[1] - g.approachTo[1];
      const dz = g.approachFrom[2] - g.approachTo[2];
      const dist = Math.hypot(dx, dy, dz);
      assert.ok(
        Math.abs(dist - joint.explodeDistance) < 1e-6,
        `approach distance ${dist} != joint explodeDistance ${joint.explodeDistance}`
      );
    }
  });

  it("at the final phase: no ghosts (fully assembled)", () => {
    const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
    const ghosts = ghostTargetsForFrame(scene, recipe, frame);
    assert.deepEqual(ghosts, []);
  });

  it("mid-fraction scrub (0.5): parts already flying in are excluded from ghosts", () => {
    const frame = resolveAssemblyFrame(recipe, 0.5);
    const ghosts = ghostTargetsForFrame(scene, recipe, frame);
    const present = new Set(frame.presentNodeIds);
    for (const g of ghosts) {
      assert.ok(!present.has(g.nodeId), `ghost ${g.nodeId} is already in presentNodeIds`);
    }
    // Fractional scrub eases the NEXT phase's joints in immediately (see
    // resolveAssemblyFrame's frac>0 branch), so those parts are marked
    // present a beat before they're fully seated — nothing left to ghost.
    assert.equal(ghosts.length, 0);
  });
});
