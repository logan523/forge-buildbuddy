import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildActionCursor } from "@/lib/actions/cursor";
import { prePowerGate, acknowledgeOverride } from "./pre-power";
import { emptyReality, setJointState, setFormFactor, sortEndpoints } from "./reality";
import { checkBreadboard } from "@/lib/breadboard/erc";
import { BOARD_SPECS } from "@/lib/breadboard/spec";
import { declareHole, type Declarations } from "@/lib/breadboard/declarations";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const plan = () =>
  applyTrustPipeline(JSON.parse(readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8")) as BuildPlan);
const CAP = { webSerial: true };

function realityAllPowerMade(p: BuildPlan) {
  let r = emptyReality(p.id);
  for (const a of buildActionCursor(p).actions) {
    if (a.connection.netClass !== "power" && a.connection.netClass !== "gnd") continue;
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
  return r;
}

test("fail-closed: not-hydrated reality is UNKNOWN, never safe (E1/row 18)", () => {
  const v = prePowerGate(plan(), undefined, CAP);
  assert.notEqual(v.status, "safe");
  assert.equal(v.rows[0].state, "unknown");
});

test("soft gate: made (asserted) power joints satisfy the checklist; live check stays optional", () => {
  const p = plan();
  const v = prePowerGate(p, realityAllPowerMade(p), CAP);
  const powerRow = v.rows.find((r) => r.id === "power-joints")!;
  assert.equal(powerRow.state, "pass");
  assert.equal(v.status, "safe", "no live check required for the soft gate");
});

test("pending power joints name the human reason — never a raw net name", () => {
  const p = plan();
  const v = prePowerGate(p, emptyReality(p.id), CAP);
  assert.equal(v.status, "almost");
  assert.ok(v.blockers[0].includes("power/ground wires"));
  for (const b of v.blockers) assert.ok(!/[A-Z0-9_]+:U\d/.test(b), "no raw ids in blocker copy");
});

test("breadboard mode: an ERC short BLOCKS with the violation's own title; clean passes; undeclared = unknown", () => {
  const p = plan();
  let r = setFormFactor(realityAllPowerMade(p), "breadboard");
  const board = BOARD_SPECS["half-400"];
  let d: Declarations = {};
  d = declareHole(d, { key: "a", netName: "GND", netClass: "gnd", label: "brown", hole: { kind: "hole", row: "A", column: 1 } });
  d = declareHole(d, { key: "b", netName: "3V3", netClass: "power", label: "red", hole: { kind: "hole", row: "B", column: 1 } });
  const short = checkBreadboard(board, d);
  const blocked = prePowerGate(p, r, CAP, short);
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.some((b) => /touching|joined/i.test(b)));

  const unknown = prePowerGate(p, r, CAP, checkBreadboard(board, {}, ["k1", "k2"]));
  assert.equal(unknown.status, "almost");
  assert.ok(unknown.rows.find((x) => x.id === "board-check")!.state === "unknown");
});

test("no Web Serial: live-check row is UNAVAILABLE — informative, never a blocker (D1/3d)", () => {
  const p = plan();
  const v = prePowerGate(p, realityAllPowerMade(p), { webSerial: false });
  const live = v.rows.find((r) => r.id === "live-check")!;
  assert.equal(live.state, "unavailable");
  assert.match(live.detail, /Chrome|Edge/);
  assert.equal(v.status, "safe", "missing capability never blocks");
});

test("override is logged forever as a gate-override event (E12)", () => {
  const p = plan();
  const r = acknowledgeOverride(emptyReality(p.id), "powered on without checks from the gate card");
  assert.equal(r.events[r.events.length - 1].kind, "gate-override");
  assert.equal(r.revision, 1);
});
