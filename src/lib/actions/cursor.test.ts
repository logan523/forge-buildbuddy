import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildActionCursor } from "./cursor";
import { emptyReality, setJointState, declareColor, sortEndpoints } from "@/lib/build-reality/reality";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const plan = () =>
  applyTrustPipeline(JSON.parse(readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8")) as BuildPlan);

test("property: every compiled wiring connection appears exactly once", () => {
  const p = plan();
  const cursor = buildActionCursor(p);
  const allConnIds = p.steps.flatMap((s) => (s.compiled?.connections ?? []).map((c) => c.id)).sort();
  const cursorIds = cursor.actions.map((a) => a.id).sort();
  assert.deepEqual(cursorIds, allConnIds);
  assert.equal(new Set(cursorIds).size, cursorIds.length, "no duplicates");
});

test("ordering is monotonic and stable under reality updates — only the position moves", () => {
  const p = plan();
  const before = buildActionCursor(p);
  const first = before.current!;
  let r = emptyReality(p.id);
  r = setJointState(
    r,
    {
      connectionId: first.id,
      netName: first.connection.netName,
      netClass: first.connection.netClass,
      endpoints: sortEndpoints(
        { ref: first.connection.fromRef, pin: first.connection.fromPin },
        { ref: first.connection.toRef, pin: first.connection.toPin }
      ),
    },
    "made"
  );
  const after = buildActionCursor(p, r);
  assert.deepEqual(after.actions.map((a) => a.id), before.actions.map((a) => a.id), "order identical");
  assert.equal(after.current!.id, before.actions[1].id, "cursor advanced to the next action");
  assert.equal(after.madeCount, 1);
});

test("safest-first inside a chapter: gnd before power before i2c", () => {
  const cursor = buildActionCursor(plan());
  const inStep = cursor.actions.filter((a) => a.stepNumber === cursor.actions[0].stepNumber);
  const ranks = inStep.map((a) => ["gnd", "power", "i2c"].indexOf(a.connection.netClass)).filter((x) => x >= 0);
  assert.deepEqual([...ranks], [...ranks].sort((a, b) => a - b));
});

test("declaring a color changes nothing about cursor order or position (it is not progress)", () => {
  const p = plan();
  const before = buildActionCursor(p);
  const r = declareColor(emptyReality(p.id), { hex: "#92400e", name: "brown", netName: "GND" });
  const after = buildActionCursor(applyTrustPipeline(JSON.parse(readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8")) as BuildPlan, r), r);
  assert.deepEqual(after.actions.map((a) => a.id), before.actions.map((a) => a.id));
  assert.equal(after.current!.id, before.current!.id);
});

test("all-done: current is null, counts are honest", () => {
  const p = plan();
  let r = emptyReality(p.id);
  for (const a of buildActionCursor(p).actions) {
    r = setJointState(
      r,
      {
        connectionId: a.id,
        netName: a.connection.netName,
        netClass: a.connection.netClass,
        endpoints: sortEndpoints(
          { ref: a.connection.fromRef, pin: a.connection.fromPin },
          { ref: a.connection.toRef, pin: a.connection.toPin }
        ),
      },
      "made"
    );
  }
  const done = buildActionCursor(p, r);
  assert.equal(done.current, null);
  assert.equal(done.madeCount, done.actions.length);
  assert.equal(done.verifiedCount, 0, "made is not verified — the dual encoding stays honest");
});
