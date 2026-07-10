import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { attachCompiledFacts, stripDerived, edgesFromModel } from "./compile";
import { validateStepContent } from "./validate";
import { WIRE_NAME_HEX } from "@/lib/wire-colors";

const demo = () => applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);

test("golden: demo compiles clean — status ok, every net assigned to a step", () => {
  const plan = demo();
  assert.equal(plan.compiledFacts?.status, "ok");
  assert.deepEqual(
    plan.compiledFacts?.unassigned.map((e) => e.netName),
    [],
    "the wedge demo must have zero uncovered nets"
  );
});

test("golden: step 6 derives the I2C bus with authority colors", () => {
  const plan = demo();
  const s6 = plan.steps.find((s) => s.stepNumber === 6);
  assert.ok(s6?.compiled, "wiring step has compiled facts");
  const conns = s6!.compiled!.connections;

  const sda = conns.filter((c) => /sda/i.test(c.netName));
  assert.ok(sda.length >= 2, "SDA reaches both OLED and SHT31");
  for (const c of sda) {
    assert.equal(c.colorName, "blue", `SDA leg ${c.toRef} is blue`);
    assert.equal(c.colorHex, WIRE_NAME_HEX.blue);
  }

  const scl = conns.filter((c) => /scl/i.test(c.netName));
  assert.ok(scl.length >= 2);
  for (const c of scl) assert.equal(c.colorName, "yellow", `SCL leg ${c.toRef} is yellow`);

  // The demo's old green-vs-blue contradiction can never render again:
  assert.ok(!conns.some((c) => c.colorName === "green" && /sda/i.test(c.netName)));

  // Silkscreen labels only — no physical positions anywhere in derived facts.
  for (const c of conns) {
    assert.ok(!/leftmost|rightmost|top pin|bottom pin/i.test(`${c.fromPin} ${c.toPin}`));
  }
});

test("golden: multi-member GND net renders as derived star legs", () => {
  const plan = demo();
  const all = plan.steps.flatMap((s) => s.compiled?.connections || []);
  const gnd = all.filter((c) => c.netName === "GND");
  assert.ok(gnd.length >= 3, "shared ground fans out to several parts");
  for (const c of gnd) {
    assert.equal(c.grade, "derived", "3+-member nets are honest about star topology");
    assert.equal(c.colorName, "black");
  }
  // 2-member nets stay "consistent"
  assert.ok(all.some((c) => c.grade === "consistent"));
});

test("golden: power steps get multimeter checks with real voltage bands", () => {
  const plan = demo();
  const checks = plan.steps.flatMap((s) => s.compiled?.checks || []);
  assert.ok(checks.length > 0, "at least one derived check exists");
  for (const c of checks) {
    assert.equal(c.kind, "multimeter");
    assert.match(c.expected, /\d\.\d–\d\.\d V/, "expected value is a measurable band");
  }
});

test("validator: pristine (fixed) demo has zero issues — the wedge validates clean", () => {
  const plan = demo();
  assert.deepEqual(plan.compiledFacts?.issues, []);
});

test("validator: re-injecting the two historical demo bugs is caught", () => {
  const raw = JSON.parse(JSON.stringify(satLine)) as BuildPlan;
  // Historical bug 1: battery step instructed peeling the Li-ion wrap.
  const s4 = raw.steps.find((s) => s.stepNumber === 4)!;
  s4.description += " Carefully score the shrink-wrap casing and peel the casing off entirely.";
  // Historical bug 2: prose color that fights the derived net color.
  const s6 = raw.steps.find((s) => s.stepNumber === 6)!;
  s6.description += " Use a white wire for SDA.";

  const plan = applyTrustPipeline(raw);
  const ids = (plan.compiledFacts?.issues || []).map((i) => i.id);
  assert.ok(ids.includes("STEP_SAFETY_CONTRADICTION"), "wrap-peel is flagged");
  assert.ok(ids.includes("STEP_COLOR_MISMATCH"), "rogue prose color is flagged");

  // Channel discipline (Tension A): the safety contradiction reaches the
  // safety report as critical; the color issue does NOT.
  const findingIds = plan.safetyReport?.findings.map((f) => f.id) || [];
  assert.ok(findingIds.some((id) => id.startsWith("step-safety-")));
  assert.ok(!findingIds.some((id) => id.includes("COLOR")));
});

test("validator: unknown pin claims are flagged (GPIO99 / physical positions)", () => {
  const raw = JSON.parse(JSON.stringify(satLine)) as BuildPlan;
  const s6 = raw.steps.find((s) => s.stepNumber === 6)!;
  s6.description += " Connect GPIO99 to the display. Solder to pin 27 on the board.";
  const plan = applyTrustPipeline(raw);
  const pinIssues = (plan.compiledFacts?.issues || []).filter((i) => i.id === "STEP_UNKNOWN_PIN");
  assert.ok(pinIssues.some((i) => i.detail.includes("gpio99")));
  assert.ok(pinIssues.some((i) => i.detail.includes("27")));
});

test("F1: compiler failure degrades, never blocks plan load", () => {
  // Malformed nets (garbage members) must be skipped defensively…
  const raw = JSON.parse(JSON.stringify(satLine)) as BuildPlan;
  (raw as unknown as { structuredNets: unknown }).structuredNets = [
    { name: "JUNK", members: [{ ref: null, pin: 42 }, "garbage"] },
  ];
  assert.doesNotThrow(() => applyTrustPipeline(raw));

  // …and a plan with no electrical model reports "unavailable", not a crash.
  const bare = { id: "x", title: "x", steps: [] } as unknown as BuildPlan;
  const facts = attachCompiledFacts(bare);
  assert.equal(facts.compiledFacts?.status, "unavailable");
});

test("1A: stripDerived removes every derived byte before share/persist", () => {
  const plan = demo();
  assert.ok(plan.steps.some((s) => s.compiled), "precondition: facts attached");
  const stripped = stripDerived(plan);
  assert.ok(stripped.steps.every((s) => !("compiled" in s)));
  assert.ok(!("compiledFacts" in stripped));
  const json = JSON.stringify(stripped);
  assert.ok(!json.includes('"compiled"') && !json.includes('"compiledFacts"'));

  // Round-trip: a shared→imported plan recompiles identically.
  const recompiled = applyTrustPipeline(JSON.parse(json) as BuildPlan);
  assert.equal(recompiled.compiledFacts?.status, "ok");
  assert.equal(
    recompiled.steps.find((s) => s.stepNumber === 6)?.compiled?.connections.length,
    plan.steps.find((s) => s.stepNumber === 6)?.compiled?.connections.length
  );
});

test("edgesFromModel skips malformed nets without throwing", () => {
  const model = {
    components: [{ ref: "U1", name: "Thing One", pins: [] }],
    nets: [
      { name: "OK", netClass: "power", members: [{ ref: "U1", pin: "VCC" }, { ref: "U2", pin: "VIN" }] },
      { name: "BAD", netClass: "gnd", members: [{ ref: null, pin: null }] },
      { name: "LONELY", netClass: "gnd", members: [{ ref: "U1", pin: "GND" }] },
    ],
    unboundEdges: [],
    erc: { clean: true },
    builtAt: "",
  };
  const edges = edgesFromModel({ structuredNets: [] } as unknown as BuildPlan, model as never);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].netName, "OK");
});

test("quick vs deep detail levels will render different fact sets (contract)", () => {
  // The render contract for slice 4: quick shows compiled facts + doneWhen;
  // deep additionally shows toolTechnique/why. This pins that compiled facts
  // exist independently of prose so the quick level has real content.
  const plan = demo();
  const s6 = plan.steps.find((s) => s.stepNumber === 6)!;
  assert.ok(s6.compiled!.connections.length >= 4);
  assert.ok(s6.whyThisWorks, "deep-level prose still present alongside facts");
});
