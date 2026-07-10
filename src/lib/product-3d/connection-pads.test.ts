import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildProductScene3D } from "./build-scene";
import { getRecipeForTemplate } from "./sat-clock-recipe";
import { resolveAssemblyFrame, applyFrameToNodes } from "./assembly-recipe";
import { buildHarnesses } from "./harness";
import type { WireRoute3D } from "./harness";
import { connectionPads } from "./connection-pads";

const route = (over: Partial<WireRoute3D>): WireRoute3D => ({
  id: "r",
  netName: "SDA",
  netClass: "i2c",
  color: "#2563eb",
  fromNodeId: "brain",
  toNodeId: "face",
  fromAnchor: "SDA",
  toAnchor: "SDA",
  path: [
    [0, 0, 0],
    [5, 5, 5],
    [10, 10, 10],
  ],
  gauge: 0.8,
  insulation: "pvc",
  label: "SDA",
  awg: 26,
  ...over,
});

test("pad = wire endpoint: position is the path's first/last point, colored by net", () => {
  const pads = connectionPads([route({})]);
  assert.equal(pads.length, 2, "one wire → two pads (both ends)");
  const from = pads.find((p) => p.nodeId === "brain")!;
  const to = pads.find((p) => p.nodeId === "face")!;
  assert.deepEqual(from.posMm, [0, 0, 0], "from pad sits on path[0]");
  assert.deepEqual(to.posMm, [10, 10, 10], "to pad sits on the last path point");
  assert.equal(from.color, "#2563eb", "pad carries the net color");
  assert.equal(from.pin, "SDA");
});

test("a shared pin shows ONE pad (dedupe by node+pin), not one per wire", () => {
  const pads = connectionPads([
    route({ id: "a", fromNodeId: "brain", fromAnchor: "GND", toNodeId: "face", toAnchor: "GND" }),
    route({ id: "b", fromNodeId: "brain", fromAnchor: "GND", toNodeId: "charger", toAnchor: "GND" }),
  ]);
  const brainGnd = pads.filter((p) => p.nodeId === "brain" && p.pin === "GND");
  assert.equal(brainGnd.length, 1, "the shared brain GND is a single pad");
});

test("degenerate paths never crash (skips wires with <2 points)", () => {
  const pads = connectionPads([route({ path: [] }), route({ id: "ok" })]);
  assert.equal(pads.length, 2, "the empty-path wire is skipped; the real one still yields pads");
});

// Integration: real demo harness → every pad lands on a wire endpoint, and the
// beginner's SDA connection is marked.
test("integration: demo wiring produces labeled pads on real endpoints", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const scene = buildProductScene3D(plan);
  const recipe = getRecipeForTemplate(scene.templateId)!;
  const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
  const nodes = applyFrameToNodes(scene.nodes, recipe, frame, 0.7); // spread like map mode
  const harnesses = buildHarnesses({ ...scene, nodes }, plan, recipe, {
    presentNodeIds: frame.presentNodeIds,
  });
  const pads = connectionPads(harnesses);

  assert.ok(pads.length >= harnesses.length, "at least one pad per wire end (deduped)");
  // Every pad sits on some harness path endpoint.
  const endpoints = new Set(
    harnesses.flatMap((h) => [
      h.path[0]!.join(","),
      h.path[h.path.length - 1]!.join(","),
    ])
  );
  for (const p of pads) {
    assert.ok(endpoints.has(p.posMm.join(",")), `pad ${p.nodeId}:${p.pin} sits on a wire endpoint`);
  }
  assert.ok(pads.some((p) => /sda/i.test(p.pin)), "the SDA connection point is marked");
});
