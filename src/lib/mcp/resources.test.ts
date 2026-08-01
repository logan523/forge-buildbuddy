import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listForgeResources, readForgeResource } from "./resources";

describe("mcp resources", () => {
  it("lists core authorities", () => {
    const list = listForgeResources();
    assert.ok(list.length >= 4);
    assert.ok(list.some((r) => r.uri === "forge://wire-color-authority"));
    assert.ok(list.some((r) => r.uri === "forge://li-ion-rules"));
  });

  it("SDA/SCL documented as blue/yellow", () => {
    const r = readForgeResource("forge://wire-color-authority");
    assert.ok(r);
    assert.match(r!.text, /SDA → blue/i);
    assert.match(r!.text, /SCL → yellow/i);
  });

  it("unknown uri returns null", () => {
    assert.equal(readForgeResource("forge://nope"), null);
  });
});
