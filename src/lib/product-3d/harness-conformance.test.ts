import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel } from "@/lib/electrical/types";
import { applyTrustPipeline } from "@/lib/trust";
import type { WireRoute3D } from "./harness";
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

test("integration: the demo's rendered harness exposes teaching-default tubes", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const r = auditPlanHarness(plan);
  assert.equal(r.available, true, "the demo builds a harness to audit");
  assert.equal(r.backedTubes + r.decorativeTubes, r.totalTubes, "every tube is classified");
  // The whole point: the hand-authored power/GND tubes are NOT netlist-derived,
  // so the honest audit finds decorative tubes the table audit can't see.
  assert.ok(r.decorativeTubes >= 1, `found ${r.decorativeTubes}/${r.totalTubes} teaching-default tubes`);
});
