import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";
import { diagnose } from "@/lib/unstick";
import { expectedI2cAddresses, type ExpectedDevice } from "./expected-devices";
import { createVerifyState, feedLine, deviceVerdicts, type DeviceVerdict } from "./verify";
import { busProofForMissingDevice, describeBusProof, filterDiagnosesByProof } from "./bus-proof";

// Same demo fixture + applyTrustPipeline pattern every other serial test in
// this codebase uses (verify.test.ts references it; expected-devices.test.ts
// confirms this plan yields exactly OLED (ssd1306-i2c, 0x3C/0x3D) + SHT31
// (sht31d, 0x44/0x45), wired on the same shared SDA/SCL/GND/power nets —
// the real daisy-chain-on-4-wires scenario this module reasons about.
const plan = applyTrustPipeline(demo as unknown as BuildPlan);
const expected = expectedI2cAddresses(plan);
const oled = expected.find((d) => d.catalogId === "ssd1306-i2c")!;
const sensor = expected.find((d) => d.catalogId === "sht31d")!;

/** Verdicts as of well past MISSING_AFTER_MS, with only `foundCatalogIds` answering. */
function verdictsWith(foundCatalogIds: string[]): DeviceVerdict[] {
  let state = createVerifyState(0);
  for (const d of expected) {
    if (foundCatalogIds.includes(d.catalogId)) {
      state = feedLine(state, { kind: "i2c-found", address: d.addresses[0] }, 10);
    }
  }
  return deviceVerdicts(state, expected, 100_000);
}

describe("busProofForMissingDevice", () => {
  it("OLED missing, sensor found: every shared net is proven, fullyProven true", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith(["sht31d"]));
    assert.ok(proof);
    assert.ok(proof!.nets.length > 0, "OLED and the sensor should share at least one net");
    assert.ok(
      proof!.nets.every((n) => n.proven),
      "every shared net should be proven by the sensor answering"
    );
    assert.equal(proof!.fullyProven, true);
  });

  it("focusPartIds/highlightWireIds/doneWireIds are all non-empty, and highlight/done are disjoint", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith(["sht31d"]))!;
    assert.ok(proof.focusPartIds.length > 0);
    assert.ok(proof.highlightWireIds.length > 0);
    assert.ok(proof.doneWireIds.length > 0);
    const overlap = proof.highlightWireIds.filter((id) => proof.doneWireIds.includes(id));
    assert.deepEqual(overlap, [], "the failed device's own wires and a proven sibling's wires must be distinct sets");
  });

  it("both OLED and sensor missing: nothing is proven", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith([]))!;
    assert.ok(proof.nets.length > 0);
    assert.equal(proof.fullyProven, false);
    assert.ok(proof.nets.every((n) => !n.proven));
    assert.ok(proof.nets.every((n) => n.siblings.every((s) => !s.found)));
  });

  it("plan.electrical undefined returns null, never crashes", () => {
    const bare: BuildPlan = { ...plan, electrical: undefined };
    assert.equal(busProofForMissingDevice(bare, oled, verdictsWith(["sht31d"])), null);
  });

  it("a device whose catalogId matches no electrical component returns null", () => {
    const fake: ExpectedDevice = { ...oled, catalogId: "not-a-real-catalog-id" };
    assert.equal(busProofForMissingDevice(plan, fake, verdictsWith(["sht31d"])), null);
  });
});

describe("describeBusProof", () => {
  it("fully proven: headline says so, detail names the proving sibling", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith(["sht31d"]))!;
    const summary = describeBusProof(oled.label, proof)!;
    assert.ok(summary);
    assert.match(summary.headline, /already proven/i);
    assert.match(summary.detail, /temp\/humidity sensor/i);
  });

  it("nothing proven: honest framing, never false reassurance", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith([]))!;
    const summary = describeBusProof(oled.label, proof)!;
    assert.ok(summary);
    assert.doesNotMatch(summary.headline, /good news/i);
  });

  it("empty nets returns null — nothing shared to reason about", () => {
    assert.equal(
      describeBusProof("Thing", { nets: [], fullyProven: false, focusPartIds: [], highlightWireIds: [], doneWireIds: [] }),
      null
    );
  });
});

describe("filterDiagnosesByProof", () => {
  it("fully proven: oled-sda-scl-swap sorts last (fully trimmed), oled-i2c-address leads instead", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith(["sht31d"]))!;
    const diagnoses = diagnose(plan, "blank_display");
    const filtered = filterDiagnosesByProof(diagnoses, proof);

    const swapIdx = filtered.findIndex((d) => d.id === "oled-sda-scl-swap");
    const addrIdx = filtered.findIndex((d) => d.id === "oled-i2c-address");
    assert.ok(swapIdx >= 0 && addrIdx >= 0);
    assert.ok(addrIdx < swapIdx, "the address-config diagnosis should lead once a sibling rules out a bus-wide swap");

    const swap = filtered.find((d) => d.id === "oled-sda-scl-swap")!;
    assert.equal(swap.actions.length, 2, "a fully-trimmed diagnosis keeps ALL its actions — never an empty checklist");
    assert.deepEqual(swap.actions.map((a) => a.order), [1, 2], "orders stay contiguous after restore");
  });

  it("nothing proven: diagnoses come back deep-equal, in the same order", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith([]))!;
    const diagnoses = diagnose(plan, "blank_display");
    const filtered = filterDiagnosesByProof(diagnoses, proof);
    assert.deepEqual(filtered.map((d) => d.id), diagnoses.map((d) => d.id));
    assert.deepEqual(filtered, diagnoses);
  });

  it("never empties a diagnosis's action list even when every action on it is proven", () => {
    const proof = busProofForMissingDevice(plan, oled, verdictsWith(["sht31d"]))!;
    const diagnoses = diagnose(plan, "blank_display");
    const filtered = filterDiagnosesByProof(diagnoses, proof);
    assert.ok(filtered.every((d) => d.actions.length > 0));
  });
});
