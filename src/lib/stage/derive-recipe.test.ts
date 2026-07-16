import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import {
  buildProductScene3D,
  resolveAssemblyFrame,
  SAT_CLOCK_RECIPE,
} from "@/lib/product-3d";
import type {
  JointDef,
  PhaseDef,
  ProductScene3D,
  SceneNode3D,
} from "@/lib/product-3d";
import {
  deriveAssemblyRecipe,
  deriveJoints,
  deriveParts,
  derivePhases,
  resolveAssemblyRecipe,
} from "./derive-recipe";

// --- Fixture A: the shipped sat_clock demo (hand-authored recipe exists). ---
const satPlan = applyTrustPipeline(demo as unknown as BuildPlan);
const satScene = buildProductScene3D(satPlan);

// --- Fixture B: a minimal weather-station plan whose BOM/title/steps land on
// a NON-sat template (see src/lib/product-visual/formspec/match.ts scoring).
// No hand-authored recipe exists for this template, so every assertion here
// exercises the pure derivation path end to end.
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
const nonSatScene = buildProductScene3D(nonSatPlan);

// Robustness over brittleness: don't assert *which* template won, only that
// it's not the hand-authored one (that's the whole point of this fixture).
assert.notEqual(nonSatScene.templateId, "sat_clock", "fixture must resolve to a derived template");

const satParts = deriveParts(satScene);
const satJoints = deriveJoints(satScene.nodes);
const { phases: satPhases, stepToPhase: satStepToPhase } = derivePhases(
  satScene,
  satPlan,
  satParts,
  satJoints,
  satPlan.electrical
);

const nonSatParts = deriveParts(nonSatScene);
const nonSatJoints = deriveJoints(nonSatScene.nodes);
const { phases: nonSatPhases } = derivePhases(
  nonSatScene,
  nonSatPlan,
  nonSatParts,
  nonSatJoints,
  nonSatPlan.electrical
);

describe("deriveParts", () => {
  it("sat scene: one PartDef per node, every nodeId real, brain has >=3 anchors", () => {
    assert.equal(satParts.length, satScene.nodes.length);
    const nodeIds = new Set(satScene.nodes.map((n) => n.id));
    for (const p of satParts) {
      assert.ok(nodeIds.has(p.nodeId), `part ${p.id} points at unknown node ${p.nodeId}`);
    }
    const brain = satParts.find((p) => p.nodeId === "brain");
    assert.ok(brain, "brain part present");
    assert.ok((brain!.anchors?.length ?? 0) >= 3, `expected >=3 anchors, got ${brain!.anchors?.length}`);
  });

  it("non-sat scene: one PartDef per node, every nodeId real", () => {
    assert.equal(nonSatParts.length, nonSatScene.nodes.length);
    const nodeIds = new Set(nonSatScene.nodes.map((n) => n.id));
    for (const p of nonSatParts) {
      assert.ok(nodeIds.has(p.nodeId), `part ${p.id} points at unknown node ${p.nodeId}`);
    }
  });
});

/** Shared joint-tree invariants: nodes.length-1 joints, exactly one root, no
 * cycles, every explode distance craft-clamped. Generic — no hardcoded ids. */
function assertJointTreeInvariants(nodes: SceneNode3D[], joints: JointDef[]): void {
  assert.equal(joints.length, nodes.length - 1);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const parentByChild = new Map<string, string>();
  for (const j of joints) {
    assert.ok(nodeIds.has(j.parentPartId), `parent ${j.parentPartId} is not a real node`);
    assert.ok(nodeIds.has(j.childPartId), `child ${j.childPartId} is not a real node`);
    assert.ok(
      j.explodeDistance >= 18 && j.explodeDistance <= 60,
      `explodeDistance ${j.explodeDistance} outside [18, 60] for ${j.id}`
    );
    parentByChild.set(j.childPartId, j.parentPartId);
  }
  const childIds = new Set(joints.map((j) => j.childPartId));
  const roots = nodes.filter((n) => !childIds.has(n.id));
  assert.equal(roots.length, 1, `expected exactly one root, got [${roots.map((r) => r.id).join(", ")}]`);
  const root = roots[0]!.id;
  // Walk the parent chain from every node; it must reach root within
  // nodes.length hops (a cycle would never terminate / would overrun this).
  for (const n of nodes) {
    let cur = n.id;
    let hops = 0;
    while (cur !== root) {
      const parent = parentByChild.get(cur);
      assert.ok(parent, `chain from ${n.id} broke at ${cur} (no parent recorded)`);
      cur = parent!;
      hops++;
      assert.ok(hops <= nodes.length, `cycle detected walking up from ${n.id}`);
    }
  }
}

describe("deriveJoints", () => {
  it("sat scene: valid insertion tree", () => {
    assertJointTreeInvariants(satScene.nodes, satJoints);
  });

  it("non-sat scene: valid insertion tree", () => {
    assertJointTreeInvariants(nonSatScene.nodes, nonSatJoints);
  });
});

/** Every scene node placed in exactly one phase; trailing "complete" beat is
 * empty + wildcard; every cameraHint is finite; at least 2 phases total. */
function assertPhaseInvariants(scene: ProductScene3D, phases: PhaseDef[]): void {
  assert.ok(phases.length >= 2, `expected >=2 phases, got ${phases.length}`);
  const placedIds = phases.flatMap((p) => p.addsParts);
  assert.equal(new Set(placedIds).size, placedIds.length, "a node was placed in more than one phase");
  assert.deepEqual(
    [...placedIds].sort(),
    [...scene.nodes.map((n) => n.id)].sort(),
    "every scene node must appear exactly once across all phases"
  );

  const last = phases[phases.length - 1]!;
  assert.equal(last.id, "complete");
  assert.deepEqual(last.addsParts, []);
  assert.deepEqual(last.addsNets, ["*"]);

  for (const p of phases) {
    assert.ok(p.cameraHint, `phase ${p.id} missing cameraHint`);
    for (const v of [...p.cameraHint!.position, ...p.cameraHint!.target]) {
      assert.ok(Number.isFinite(v), `phase ${p.id} cameraHint has a non-finite value`);
    }
  }
}

describe("derivePhases", () => {
  it("sat scene: placement + trailing-phase + cameraHint invariants", () => {
    assertPhaseInvariants(satScene, satPhases);
  });

  it("non-sat scene: placement + trailing-phase + cameraHint invariants", () => {
    assertPhaseInvariants(nonSatScene, nonSatPhases);
  });

  it("sat plan: stepToPhase maps only steps that carry a mediaKind, indexes in range", () => {
    const steps = satPlan.steps ?? [];
    const withMediaKind = steps.filter((s) => s.mediaKind);
    assert.ok(withMediaKind.length > 0, "expected the sat demo to have steps with mediaKind");

    for (const s of withMediaKind) {
      const idx = satStepToPhase[s.mediaKind as string];
      assert.ok(idx !== undefined, `no phase mapped for mediaKind ${s.mediaKind}`);
      assert.ok(idx < satPhases.length, `phase index ${idx} out of range (${satPhases.length} phases)`);
    }

    const mediaKinds = new Set(withMediaKind.map((s) => String(s.mediaKind)));
    for (const key of Object.keys(satStepToPhase)) {
      assert.ok(mediaKinds.has(key), `stepToPhase key ${key} does not correspond to any step's mediaKind`);
    }
  });
});

describe("resolveAssemblyRecipe", () => {
  it("sat scene: returns the hand-authored SAT_CLOCK_RECIPE unchanged", () => {
    const resolved = resolveAssemblyRecipe(satScene, satPlan);
    assert.equal(resolved, SAT_CLOCK_RECIPE, "expected the exact hand-authored recipe object");
    assert.equal(resolved.templateId, "sat_clock");
    assert.equal(resolved.parts.length, SAT_CLOCK_RECIPE.parts.length);
  });

  it("non-sat scene: returns a derived recipe, never null", () => {
    const resolved = resolveAssemblyRecipe(nonSatScene, nonSatPlan);
    assert.notEqual(resolved, SAT_CLOCK_RECIPE);
    assert.equal(resolved.templateId, nonSatScene.templateId);
    assert.ok(resolved.phases.length >= 2);
  });
});

describe("integration with resolveAssemblyFrame", () => {
  const recipe = deriveAssemblyRecipe(nonSatScene, nonSatPlan, undefined);

  it("frame 0: presentPartIds is a non-empty subset of every part id", () => {
    const frame = resolveAssemblyFrame(recipe, 0);
    const allIds = new Set(recipe.parts.map((p) => p.id));
    assert.ok(frame.presentPartIds.length >= 1);
    for (const id of frame.presentPartIds) {
      assert.ok(allIds.has(id), `presentPartIds contains unknown id ${id}`);
    }
  });

  it("final phase: every part is present", () => {
    const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
    assert.equal(frame.presentPartIds.length, recipe.parts.length);
  });

  it("scrub is pure: 0.5 then back to 0 matches the original 0 call", () => {
    const first = resolveAssemblyFrame(recipe, 0);
    resolveAssemblyFrame(recipe, 0.5); // scrub elsewhere first
    const again = resolveAssemblyFrame(recipe, 0);
    assert.deepEqual([...again.presentPartIds].sort(), [...first.presentPartIds].sort());
  });
});

describe("derived nets (sat plan has an electrical model)", () => {
  it("every non-wildcard addsNets entry is a real net name; at least 3 nets placed", () => {
    assert.ok(satPlan.electrical, "sat demo plan should carry an electrical model");
    const recipe = deriveAssemblyRecipe(satScene, satPlan, satPlan.electrical);
    const validNames = new Set(satPlan.electrical!.nets.map((n) => n.name.toLowerCase()));
    const placed = recipe.phases.flatMap((p) => p.addsNets).filter((n) => n !== "*");
    for (const n of placed) {
      assert.ok(validNames.has(n), `net "${n}" is not a real net name from the electrical model`);
    }
    assert.ok(placed.length >= 3, `expected at least 3 nets placed, got ${placed.length}`);
  });
});
