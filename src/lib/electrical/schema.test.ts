import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStructuredNets, sanitizeStructuredNets, StructuredNetSchema } from "./schema";

describe("structuredNets Zod schema", () => {
  it("accepts canonical nets", () => {
    const r = parseStructuredNets([
      {
        name: "GND",
        netClass: "gnd",
        members: [
          { ref: "U1", pin: "GND" },
          { ref: "U2", pin: "GND" },
        ],
      },
    ]);
    assert.equal(r.nets.length, 1);
    assert.equal(r.nets[0].name, "GND");
    assert.equal(r.nets[0].members.length, 2);
    assert.equal(r.rejectedAll, false);
  });

  it("coerces designator/pad aliases and netClass synonyms", () => {
    const r = parseStructuredNets([
      {
        name: "3V3",
        netClass: "vcc",
        members: [
          { designator: "U1", pad: "3V3" },
          { component: "U2", pinName: "VCC" },
        ],
      },
    ]);
    assert.equal(r.nets.length, 1);
    assert.equal(r.nets[0].netClass, "power");
    assert.deepEqual(
      r.nets[0].members.map((m) => `${m.ref}.${m.pin}`),
      ["U1.3V3", "U2.VCC"]
    );
  });

  it("drops bad members, keeps valid ones", () => {
    const r = parseStructuredNets([
      {
        name: "SDA",
        members: [
          { ref: "U1", pin: "GPIO4" },
          { ref: "", pin: "SDA" },
          { ref: "U2" },
          null,
          { ref: "U3", pin: "SDA" },
        ],
      },
    ]);
    assert.equal(r.nets.length, 1);
    assert.equal(r.nets[0].members.length, 2);
    assert.ok(r.issues.length >= 2);
  });

  it("rejects all-junk input → sanitize clears structuredNets", () => {
    const r = sanitizeStructuredNets([
      { name: "X", members: [{ foo: 1 }] },
      "not-a-net",
      null,
    ]);
    assert.equal(r.structuredNets, undefined);
    assert.ok(r.parseIssues.length > 0);
  });

  it("rejects non-array", () => {
    const r = parseStructuredNets({ name: "GND" });
    assert.equal(r.rejectedAll, true);
    assert.equal(r.nets.length, 0);
  });

  it("dedupes duplicate ref.pin within a net", () => {
    const r = parseStructuredNets([
      {
        name: "GND",
        members: [
          { ref: "U1", pin: "GND" },
          { ref: "u1", pin: "gnd" },
          { ref: "U2", pin: "GND" },
        ],
      },
    ]);
    assert.equal(r.nets[0].members.length, 2);
  });

  it("StructuredNetSchema strict-fails empty members", () => {
    const r = StructuredNetSchema.safeParse({ name: "GND", members: [] });
    assert.equal(r.success, false);
  });

  it("null/undefined input is empty not rejected", () => {
    assert.deepEqual(parseStructuredNets(null).nets, []);
    assert.equal(parseStructuredNets(undefined).rejectedAll, false);
    assert.equal(sanitizeStructuredNets(undefined).structuredNets, undefined);
  });
});
