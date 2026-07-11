import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel } from "@/lib/electrical/types";
import { applyTrustPipeline } from "@/lib/trust";
import type { WireRoute3D } from "./harness";
import { buildHarnesses } from "./harness";
import { buildProductScene3D } from "./build-scene";
import { getRecipeForTemplate } from "./sat-clock-recipe";
import { resolveAssemblyFrame, applyFrameToNodes } from "./assembly-recipe";
import { mapRefToNodeId } from "./connection-spars";
import { pickHub } from "@/lib/electrical/hub";
import { auditHarnessRoutes, auditPlanHarness } from "./harness-conformance";

const route = (netName: string, over: Partial<WireRoute3D> = {}): WireRoute3D => ({
  id: `${netName}-r`,
  netName,
  netClass: "power",
  color: "#000",
  fromNodeId: "brain",
  toNodeId: "face",
  fromAnchor: "A",
  toAnchor: "B",
  path: [[0, 0, 0], [1, 1, 1]],
  gauge: 0.8,
  insulation: "pvc",
  label: netName,
  awg: 26,
  ...over,
});

const model = (netNames: string[]): ElectricalModel =>
  ({
    components: [],
    nets: netNames.map((name) => ({ name, netClass: "power", grade: "derived", members: [] })),
    unboundEdges: [],
    erc: {} as never,
    builtAt: "",
  }) as ElectricalModel;

test("a tube backed by a real net passes; a teaching default is decorative", () => {
  const r = auditHarnessRoutes([route("3V3"), route("OLED_VCC")], model(["3V3", "GND"]));
  assert.equal(r.available, true);
  assert.equal(r.totalTubes, 2);
  assert.equal(r.backedTubes, 1, "3V3 traces to a net");
  assert.equal(r.decorativeTubes, 1, "OLED_VCC does not");
  assert.equal(r.traced, false);
  assert.match(r.issues[0]!.detail, /OLED_VCC/);
});

test("all tubes backed → traced true", () => {
  const r = auditHarnessRoutes([route("3V3"), route("GND")], model(["3V3", "GND"]));
  assert.equal(r.traced, true);
  assert.equal(r.decorativeTubes, 0);
});

test("no model → honestly unavailable", () => {
  assert.equal(auditHarnessRoutes([route("3V3")], null).available, false);
});

/** Build the demo's fully-assembled harness routes. */
function demoRoutes(): WireRoute3D[] {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const scene = buildProductScene3D(plan);
  const recipe = getRecipeForTemplate(scene.templateId)!;
  const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
  const nodes = applyFrameToNodes(scene.nodes, recipe, frame, 0);
  return buildHarnesses({ ...scene, nodes }, plan, recipe, { presentNodeIds: frame.presentNodeIds });
}

test("a multi-member net renders as a hub-and-spoke star named for the real net", () => {
  const gnd = demoRoutes().filter((r) => r.netName === "GND");
  assert.ok(gnd.length >= 3, `GND (10 members) fans into a star, got ${gnd.length} tubes`);
  // Hub-and-spoke: every leg leaves the same hub node.
  const hubs = new Set(gnd.map((r) => r.fromNodeId));
  assert.equal(hubs.size, 1, "all GND legs share one hub node");
});

test("the harness picks the SAME hub as the instruction compiler (Show-me alignment)", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const scene = buildProductScene3D(plan);
  const gndNet = plan.electrical!.nets.find((n) => n.name === "GND")!;
  const compilerHubNode = mapRefToNodeId(pickHub(gndNet.members).ref, scene.nodes, plan);
  const harnessHub = [...new Set(demoRoutes().filter((r) => r.netName === "GND").map((r) => r.fromNodeId))][0];
  assert.equal(harnessHub, compilerHubNode, "3D tube hub === compiled step hub, so the glow can't miss");
});

test("integration: the demo's rendered harness is now netlist-derived (was 2/18)", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const r = auditPlanHarness(plan);
  assert.equal(r.available, true, "the demo builds a harness to audit");
  assert.equal(r.backedTubes + r.decorativeTubes, r.totalTubes, "every tube is classified");
  // The refactor: power/GND/bus tubes are generated from the multi-member nets,
  // so the vast majority now trace to the model (was 2 of 18).
  assert.ok(r.backedTubes >= 15, `most tubes are netlist-backed (${r.backedTubes}/${r.totalTubes})`);
  // The ONLY honest residual is solar-r — the model folds both panels into
  // solar-l, so solar-r's two tubes have no backing net (documented TODO).
  assert.ok(r.decorativeTubes <= 3, `few decorative residuals (${r.decorativeTubes})`);
  for (const iss of r.issues) {
    assert.equal(iss.fromNodeId, "solar-r", `only solar-r is decorative, got ${iss.netName} on ${iss.fromNodeId}`);
  }
});
