import { test } from "node:test";
import assert from "node:assert/strict";
import { matchingRocks, preemptiveRock, ROCKS } from "./friction";

test("rocks match by step kind + net classes present", () => {
  const i2c = matchingRocks({ kind: "wiring", netClasses: ["i2c", "gnd"] });
  assert.ok(i2c.some((r) => r.id === "i2c-sda-scl-swap"), "an I2C wiring step gets the SDA/SCL rock");
  assert.ok(i2c.some((r) => r.id === "gnd-forgotten"), "and the ground rock");
  assert.equal(matchingRocks({ kind: "software", netClasses: [] }).length, 0, "a code step has no wiring rocks");
});

test("preemptiveRock only fires once the builder has tripped here before", () => {
  const ctx = { kind: "wiring", netClasses: ["i2c"] };
  assert.equal(preemptiveRock(ctx, () => 0), null, "first encounter — no scary pre-empt");
  const hit = preemptiveRock(ctx, (id) => (id === "i2c-sda-scl-swap" ? 2 : 0));
  assert.equal(hit?.rock.id, "i2c-sda-scl-swap", "after tripping, the callout appears");
  assert.equal(hit?.count, 2);
});

test("every rock has a non-empty, specific callout", () => {
  for (const r of ROCKS) {
    assert.ok(r.callout.length > 20, `${r.id} has a real callout`);
    assert.ok(r.id.length > 0);
  }
});
