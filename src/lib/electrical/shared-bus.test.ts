import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sharedNetsForRef } from "./shared-bus";
import type { ElectricalModel, ElectricalNet } from "./types";

function net(
  name: string,
  members: { ref: string; pin: string }[],
  netClass: ElectricalNet["netClass"] = "signal"
): ElectricalNet {
  return {
    name,
    netClass,
    grade: "derived",
    members: members.map((m) => ({ ref: m.ref, pin: m.pin, role: "unknown" })),
  };
}

function model(nets: ElectricalNet[]): ElectricalModel {
  return {
    components: [],
    nets,
    unboundEdges: [],
    erc: { errors: [], warnings: [], infos: [], clean: true, canExportPcb: true, canPublishKit: true, summary: "" },
    builtAt: "",
  };
}

describe("sharedNetsForRef", () => {
  it("ref not on any net returns []", () => {
    const m = model([net("GND", [{ ref: "U1", pin: "GND" }, { ref: "U2", pin: "GND" }])]);
    assert.deepEqual(sharedNetsForRef(m, "U9"), []);
  });

  it("ref alone on a net (no siblings) excludes that net — nothing to prove from an unshared wire", () => {
    const m = model([net("GND", [{ ref: "U1", pin: "GND" }])]);
    assert.deepEqual(sharedNetsForRef(m, "U1"), []);
  });

  it("ref on a 2-member net returns one entry with the other member as the sibling", () => {
    const gnd = net("GND", [{ ref: "U1", pin: "GND" }, { ref: "U2", pin: "GND" }]);
    const m = model([gnd]);
    const result = sharedNetsForRef(m, "U1");
    assert.equal(result.length, 1);
    assert.equal(result[0].net, gnd);
    assert.deepEqual(result[0].self, { ref: "U1", pin: "GND", role: "unknown" });
    assert.deepEqual(result[0].siblings, [{ ref: "U2", pin: "GND", role: "unknown" }]);
  });

  it("ref on a 3+-member net returns every other member as a sibling", () => {
    const sda = net(
      "SDA",
      [{ ref: "U1", pin: "SDA" }, { ref: "U2", pin: "SDA" }, { ref: "U3", pin: "SDA" }],
      "i2c"
    );
    const m = model([sda]);
    const result = sharedNetsForRef(m, "U1");
    assert.equal(result.length, 1);
    assert.equal(result[0].siblings.length, 2);
    assert.deepEqual(result[0].siblings.map((s) => s.ref).sort(), ["U2", "U3"]);
  });

  it("ref present on multiple nets returns multiple entries", () => {
    const gnd = net("GND", [{ ref: "U1", pin: "GND" }, { ref: "U2", pin: "GND" }]);
    const sda = net("SDA", [{ ref: "U1", pin: "SDA" }, { ref: "U2", pin: "SDA" }], "i2c");
    const m = model([gnd, sda]);
    const result = sharedNetsForRef(m, "U1");
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((r) => r.net.name).sort(), ["GND", "SDA"]);
  });

  it("malformed members (missing ref or pin) are filtered — never appear as siblings, never crash", () => {
    const messy = net("GND", [
      { ref: "U1", pin: "GND" },
      { ref: "", pin: "GND" },
      { ref: "U2", pin: "" },
      { ref: "U3", pin: "GND" },
    ]);
    const m = model([messy]);
    const result = sharedNetsForRef(m, "U1");
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].siblings.map((s) => s.ref), ["U3"]);
  });
});
