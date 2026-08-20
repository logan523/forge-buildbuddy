import { test } from "node:test";
import assert from "node:assert/strict";
import { filterDiagnosesByReality, type Diagnosis } from "./unstick";
import { emptyReality, setJointState } from "./build-reality/reality";

const diag = (id: string, actions: { order: number; action: string; expect: string; netHint?: string[] }[]): Diagnosis =>
  ({ id, title: id, likelihood: "likely", score: 1, cause: "c", actions, source: "generic" }) as Diagnosis;

const jointOn = (net: string, id: string) => ({
  connectionId: id,
  netName: net,
  netClass: "i2c",
  endpoints: [
    { ref: "U2", pin: "GPIO4" },
    { ref: "U7", pin: "SDA" },
  ] as [{ ref: string; pin: string }, { ref: string; pin: string }],
});

test("V2: actions on fully-verified nets are trimmed; checklist never empties; trimmed sort last", () => {
  let r = emptyReality("p");
  r = setJointState(r, jointOn("SDA", "SDA:U7:SDA"), "made");
  r = setJointState(r, jointOn("SDA", "SDA:U7:SDA"), "verified", { source: "i2c-scan" });
  const ds = [
    diag("wire-swap", [
      { order: 1, action: "check SDA wire", expect: "beep", netHint: ["sda"] },
      { order: 2, action: "set library address", expect: "boots" },
    ]),
    diag("only-wires", [{ order: 1, action: "reflow SDA", expect: "beep", netHint: ["sda"] }]),
  ];
  const out = filterDiagnosesByReality(ds, r);
  // BOTH diagnoses were trimmed → stable input order preserved within the group.
  assert.equal(out[0].id, "wire-swap");
  assert.equal(out[0].actions.length, 1, "proven-wire action dropped");
  assert.equal(out[0].actions[0].action, "set library address");
  assert.equal(out[1].id, "only-wires");
  assert.equal(out[1].actions.length, 1, "never emptied — original restored");
  assert.equal(out[1].actions[0].action, "reflow SDA");
});

test("V2: self-report evidence (tug) does NOT count as proof; undefined reality is a no-op", () => {
  let r = emptyReality("p");
  r = setJointState(r, jointOn("SDA", "SDA:U7:SDA"), "made");
  r = setJointState(r, jointOn("SDA", "SDA:U7:SDA"), "verified", { source: "tug" });
  const ds = [diag("d", [{ order: 1, action: "check SDA", expect: "beep", netHint: ["sda"] }])];
  assert.equal(filterDiagnosesByReality(ds, r)[0].actions.length, 1, "tug proves nothing");
  assert.equal(filterDiagnosesByReality(ds, undefined)[0].actions.length, 1);
});
