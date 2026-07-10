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
import { wireRouteForNodes } from "./micro-wire-bridge";

const route = (over: Partial<WireRoute3D>): WireRoute3D => ({
  id: "r",
  netName: "SDA",
  netClass: "i2c",
  color: "#2563eb",
  fromNodeId: "brain",
  toNodeId: "face",
  fromAnchor: "SDA",
  toAnchor: "SDA",
  path: [],
  gauge: 0.8,
  insulation: "pvc",
  label: "SDA",
  awg: 26,
  ...over,
});

test("bridge: matches on the node pair, either orientation; null when missing", () => {
  const routes = [
    route({ id: "sda", fromNodeId: "brain", toNodeId: "face" }),
    route({ id: "gnd", fromNodeId: "brain", toNodeId: "battery", netName: "GND" }),
  ];
  assert.equal(wireRouteForNodes(routes, "brain", "face")?.id, "sda");
  assert.equal(wireRouteForNodes(routes, "face", "brain")?.id, "sda", "order-independent");
  assert.equal(wireRouteForNodes(routes, "brain", "sensor"), null, "no route for that pair");
  assert.equal(wireRouteForNodes(routes, "brain", undefined), null, "unresolved node → null, not a crash");
});

// Load-bearing: micro-step part ids → scene node ids → a real harness wire.
test("integration: signal wires resolve to real harness routes (node-pair)", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const scene = buildProductScene3D(plan);
  const recipe = getRecipeForTemplate(scene.templateId)!;
  const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
  const nodes = applyFrameToNodes(scene.nodes, recipe, frame, 0);
  const harnesses = buildHarnesses({ ...scene, nodes }, plan, recipe, {
    presentNodeIds: frame.presentNodeIds,
  });
  const p2n = new Map(scene.nodes.filter((n) => n.partId).map((n) => [n.partId!, n.id]));

  const micro = plan.steps.find((s) => s.stepNumber === 6)!.compiled!.microSteps!;
  const resolve = (m: (typeof micro)[number]) =>
    wireRouteForNodes(harnesses, p2n.get(m.fromPartId!), p2n.get(m.toPartId!));

  const matched = micro.filter(resolve).length;
  // The ESP→peripheral signal + direct power legs resolve; GND star-legs the
  // harness routes through the charger, and parts absent from the 3D, don't.
  assert.ok(matched >= micro.length / 2, `most wires resolve (${matched}/${micro.length})`);

  const sda = micro.find((m) => /sda/i.test(m.netName))!;
  assert.ok(sda.fromPartId && sda.toPartId, "micro-step carries part ids");
  assert.ok(resolve(sda), "the SDA wire (the beginner's job) resolves to a route");
});
