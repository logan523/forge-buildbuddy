import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel, ElectricalComponent, ElectricalNet } from "./types";
import { applyTrustPipeline } from "@/lib/trust";
import { solveOperatingPoint } from "./operating-point";

const comp = (ref: string, catalogId: string, extra: Partial<ElectricalComponent> = {}): ElectricalComponent =>
  ({ ref, partId: ref, name: ref, catalogId, pinoutGrade: "derived", pins: [], ...extra }) as ElectricalComponent;

const powerNet = (name: string, v: number, refs: string[]): ElectricalNet =>
  ({ name, netClass: "power", grade: "derived", members: refs.map((ref) => ({ ref, pin: "V", role: "power", domainV: v })) }) as ElectricalNet;

const model = (components: ElectricalComponent[], nets: ElectricalNet[]): ElectricalModel =>
  ({ components, nets, unboundEdges: [], erc: {} as never, builtAt: "" }) as ElectricalModel;

test("a loaded rail delivers LESS than nominal — steady, and a deeper peak dip", () => {
  const m = model(
    [comp("U1", "esp32_c3"), comp("U2", "oled_096")],
    [powerNet("3V3", 3.3, ["U1", "U2"])]
  );
  const r = solveOperatingPoint(m).rails[0]!;
  assert.equal(r.nominalV, 3.3);
  assert.equal(r.loadMa, 95, "80mA MCU + 15mA OLED");
  assert.equal(r.peakMa, 365, "the ESP's 350mA TX burst dominates the peak");
  assert.ok(r.deliveredV < 3.3, "the rail sags under steady load");
  assert.ok(r.deliveredPeakV < r.deliveredV, "and dips deeper during a WiFi burst");
  assert.equal(r.grade, "assumed", "an estimate, never claimed as measured");
});

test("more load → more sag; a genuinely overloaded battery rail browns out on the peak", () => {
  const light = solveOperatingPoint(model([comp("U2", "oled_096")], [powerNet("3V3", 3.3, ["U2"])])).rails[0]!;
  // ESP + 6 peripherals daisy-chained off a Li-ion cell: the WiFi burst dips it below the LDO floor.
  const loads = ["G1", "G2", "G3", "G4", "G5", "G6"].map((r) => comp(r, "generic_pcb"));
  const heavy = solveOperatingPoint(
    model(
      [comp("B1", "cell_16340", { isLithiumCell: true }), comp("U1", "esp32_c3"), ...loads],
      [powerNet("BAT", 3.7, ["B1", "U1", "G1", "G2", "G3", "G4", "G5", "G6"])]
    )
  ).rails[0]!;
  assert.ok(heavy.sagMv > light.sagMv, "heavier load sags more");
  assert.equal(heavy.status, "brownout", "the peak dip crosses the 3.3V LDO floor");
});

test("a healthy regulated rail stays OK even with the MCU's burst", () => {
  const r = solveOperatingPoint(model([comp("U1", "esp32_c3")], [powerNet("3V3", 3.3, ["U1"])])).rails[0]!;
  assert.equal(r.status, "ok", "a stiff single-load 3.3V rail holds through the burst — honest good news");
});

test("battery-direct rails are softer (higher series R) than regulated ones", () => {
  const batt = solveOperatingPoint(
    model([comp("B1", "cell_16340", { isLithiumCell: true }), comp("U1", "esp32_c3")], [powerNet("BAT", 3.7, ["B1", "U1"])])
  ).rails[0]!;
  assert.equal(batt.seriesOhm, 0.5, "cell internal + wiring base is higher than a regulated rail");
});

test("a no-load rail (source only) produces no operating point", () => {
  const r = solveOperatingPoint(model([comp("B1", "cell_16340", { isLithiumCell: true })], [powerNet("BAT", 3.7, ["B1"])]));
  assert.equal(r.rails.length, 0);
});

test("no model → honestly unavailable, worst = none", () => {
  const r = solveOperatingPoint(null);
  assert.equal(r.available, false);
  assert.equal(r.worst, "none");
});

test("integration: the real demo solves to sane, sagged rails", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const op = solveOperatingPoint(plan.electrical);
  assert.equal(op.available, true);
  assert.ok(op.rails.length >= 1, "the demo has at least one loaded power rail");
  for (const r of op.rails) {
    assert.ok(r.deliveredV > 0 && r.deliveredV <= r.nominalV, `${r.netName} delivers a sane voltage`);
    assert.ok(["ok", "marginal", "brownout"].includes(r.status));
  }
});
