import { test } from "node:test";
import assert from "node:assert/strict";
import { startConfirm, applyLine, applyTimeout } from "./build-confirm";
import type { ScannerLine } from "./line-parser";

test("startConfirm: seeds a waiting state with the expected buildId", () => {
  assert.deepEqual(startConfirm("a3f9c1c2"), { expected: "a3f9c1c2", status: "waiting" });
});

test("applyLine: a matching build-id line confirms", () => {
  const state = startConfirm("a3f9c1c2");
  const line: ScannerLine = { kind: "build-id", buildId: "a3f9c1c2" };
  assert.deepEqual(applyLine(state, line), { expected: "a3f9c1c2", status: "confirmed", got: "a3f9c1c2" });
});

test("applyLine: a mismatched build-id line flags a stale flash", () => {
  const state = startConfirm("a3f9c1c2");
  const line: ScannerLine = { kind: "build-id", buildId: "71b0aa9d" };
  assert.deepEqual(applyLine(state, line), { expected: "a3f9c1c2", status: "mismatch", got: "71b0aa9d" });
});

test("applyLine: non-build-id lines (i2c-found, boot, plain) don't affect a pending confirm", () => {
  const state = startConfirm("a3f9c1c2");
  assert.deepEqual(applyLine(state, { kind: "i2c-found", address: 0x3c }), state);
  assert.deepEqual(applyLine(state, { kind: "boot" }), state);
  assert.deepEqual(applyLine(state, { kind: "plain" }), state);
});

test("applyLine: null state (nothing pending) stays null regardless of the line", () => {
  assert.equal(applyLine(null, { kind: "build-id", buildId: "a3f9c1c2" }), null);
});

test("applyLine: a settled state (already confirmed) is never overwritten by a later build-id line", () => {
  const confirmed = applyLine(startConfirm("a3f9c1c2"), { kind: "build-id", buildId: "a3f9c1c2" });
  const laterLine: ScannerLine = { kind: "build-id", buildId: "71b0aa9d" };
  assert.deepEqual(applyLine(confirmed, laterLine), confirmed, "a result that already landed must not change");
});

test("applyLine: a settled mismatch is also never overwritten by a later build-id line", () => {
  const mismatched = applyLine(startConfirm("a3f9c1c2"), { kind: "build-id", buildId: "71b0aa9d" });
  const laterLine: ScannerLine = { kind: "build-id", buildId: "a3f9c1c2" };
  assert.deepEqual(applyLine(mismatched, laterLine), mismatched);
});

test("applyTimeout: a still-waiting state times out", () => {
  assert.deepEqual(applyTimeout(startConfirm("a3f9c1c2")), { expected: "a3f9c1c2", status: "timeout" });
});

test("applyTimeout: a confirmed state is unaffected by a late timeout firing", () => {
  const confirmed = applyLine(startConfirm("a3f9c1c2"), { kind: "build-id", buildId: "a3f9c1c2" });
  assert.deepEqual(applyTimeout(confirmed), confirmed);
});

test("applyTimeout: null state (nothing pending) stays null", () => {
  assert.equal(applyTimeout(null), null);
});
