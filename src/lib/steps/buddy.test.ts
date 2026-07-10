import { test } from "node:test";
import assert from "node:assert/strict";
import { encouragement } from "./buddy";

test("struggling beats everything — a hand on the shoulder", () => {
  const line = encouragement({ current: 2, total: 8, doneCount: 2, netClass: "i2c", struggling: true });
  assert.match(line ?? "", /breathe|forgiving/i);
});

test("first wire greets; ground gets its 'quiet hero' intro", () => {
  assert.match(encouragement({ current: 0, total: 8, doneCount: 0, netClass: "gnd" }) ?? "", /ground/i);
  assert.match(encouragement({ current: 0, total: 8, doneCount: 0, netClass: "i2c" }) ?? "", /one wire at a time/i);
});

test("last wire points at the payoff", () => {
  assert.match(encouragement({ current: 7, total: 8, doneCount: 7, netClass: "i2c" }) ?? "", /last one/i);
});

test("halfway gives a sense of pace, but only on a longer step", () => {
  assert.match(encouragement({ current: 4, total: 8, doneCount: 4, netClass: "i2c" }) ?? "", /halfway/i);
  // A 3-wire step: the middle wire is neither first nor last and too short for halfway chatter.
  assert.equal(encouragement({ current: 1, total: 3, doneCount: 1, netClass: "i2c" }), null, "short step skips halfway chatter");
});

test("stays quiet on the in-between wires — warmth is sparse, not naggy", () => {
  assert.equal(encouragement({ current: 3, total: 8, doneCount: 3, netClass: "i2c" }), null);
});
