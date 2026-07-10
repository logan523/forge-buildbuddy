import { test } from "node:test";
import assert from "node:assert/strict";
import { diagLog, diagRead, diagClear, diagCopyText } from "./diag";

test("diag is a safe no-op without a DOM (SSR path)", () => {
  // No jsdom bootstrap in this file on purpose: this is the server environment
  // applyTrustPipeline runs in (pipeline/run.ts) — every call must be inert.
  assert.doesNotThrow(() => diagLog("compile_error", "boom"));
  assert.deepEqual(diagRead(), []);
  assert.equal(diagCopyText(), "");
  assert.doesNotThrow(() => diagClear());
});
