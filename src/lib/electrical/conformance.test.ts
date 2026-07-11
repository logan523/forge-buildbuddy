import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan, CompiledConnection } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { auditConformance } from "./conformance";

const conn = (netName: string, over: Partial<CompiledConnection> = {}): CompiledConnection => ({
  id: `${netName}-x`,
  netName,
  netClass: "power",
  fromRef: "U1",
  fromPin: "A",
  fromLabel: "ESP32",
  toRef: "U2",
  toPin: "B",
  toLabel: "OLED",
  colorHex: "#000",
  colorName: "black",
  grade: "consistent",
  ...over,
});

const net = (name: string, memberCount: number) => ({
  name,
  netClass: "power",
  grade: "consistent",
  members: Array.from({ length: memberCount }, (_, i) => ({ ref: `U${i}`, pin: "P", role: "power" })),
});

const planWith = (nets: ReturnType<typeof net>[], rendered: CompiledConnection[], unassigned: CompiledConnection[] = []): BuildPlan =>
  ({
    id: "p",
    steps: [{ stepNumber: 1, title: "Wire", description: "", compiled: { connections: rendered, checks: [] } }],
    electrical: { nets, components: [] },
    compiledFacts: { status: "ok", unassigned, issues: [] },
  }) as unknown as BuildPlan;

test("a fully-rendered plan is 100% traced — the seal a technician trusts", () => {
  // Two 2-member nets → 1 leg each; both rendered.
  const r = auditConformance(planWith([net("3V3", 2), net("SDA", 2)], [conn("3V3"), conn("SDA")]));
  assert.equal(r.available, true);
  assert.equal(r.traced, true);
  assert.equal(r.pct, 100);
  assert.equal(r.issues.length, 0);
});

test("a decorative wire (no backing net) is caught by name", () => {
  const r = auditConformance(planWith([net("3V3", 2)], [conn("3V3"), conn("OLED_VCC")]));
  assert.equal(r.traced, false);
  assert.equal(r.decorativeCount, 1);
  assert.ok(r.issues.some((i) => i.kind === "decorative" && /OLED_VCC/.test(i.detail)));
});

test("an under-rendered star net names how many legs are missing", () => {
  // 4-member GND → 3 legs expected, only 1 rendered.
  const r = auditConformance(planWith([net("SYS_GND", 4)], [conn("SYS_GND")]));
  assert.equal(r.traced, false);
  const iss = r.issues.find((i) => i.kind === "under-rendered")!;
  assert.match(iss.detail, /4 members but only 1 of 3/);
});

test("an orphan net (zero wires) is flagged distinctly", () => {
  const r = auditConformance(planWith([net("HIDDEN", 2)], []));
  assert.ok(r.issues.some((i) => i.kind === "orphan-net" && /HIDDEN/.test(i.detail)));
  assert.equal(r.pct, 0);
});

test("unassigned connections still count as rendered (never-dropped)", () => {
  const r = auditConformance(planWith([net("3V3", 2)], [], [conn("3V3")]));
  assert.equal(r.traced, true, "a leg parked in unassigned is still on screen somewhere");
});

test("no electrical model → conformance is honestly 'not checkable', not a false 100%", () => {
  const r = auditConformance({ id: "p", steps: [] } as unknown as BuildPlan);
  assert.equal(r.available, false);
  assert.equal(r.traced, false);
});

test("integration: the real demo plan is conformant by construction (compiler derives from the model)", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const r = auditConformance(plan);
  assert.equal(r.available, true);
  assert.ok(r.pct >= 90, `demo renders ${r.pct}% of its nets (${r.coveredNets}/${r.renderableNets})`);
  assert.equal(r.decorativeCount, 0, "the demo draws no wire the model doesn't back");
});
