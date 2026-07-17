import { test } from "node:test";
import assert from "node:assert/strict";
import { flashFlowReducer, initialFlashFlowState, classifyFlashError, type FlashFlowState } from "./flash-flow";

// --- reducer: happy path -------------------------------------------------

test("reducer: boot-guidance -> connecting on beginFlash", () => {
  const s = flashFlowReducer(initialFlashFlowState, { type: "beginFlash" });
  assert.equal(s.phase, "connecting");
});

test("reducer: connecting -> flashing on connected, progress reset to 0", () => {
  const connecting: FlashFlowState = { ...initialFlashFlowState, phase: "connecting" };
  const s = flashFlowReducer(connecting, { type: "connected" });
  assert.equal(s.phase, "flashing");
  assert.equal(s.progressPercent, 0);
});

test("reducer: progress updates percent while flashing, clamped and rounded", () => {
  const flashing: FlashFlowState = { ...initialFlashFlowState, phase: "flashing", progressPercent: 0 };
  assert.equal(flashFlowReducer(flashing, { type: "progress", percent: 42.6 }).progressPercent, 43);
  assert.equal(flashFlowReducer(flashing, { type: "progress", percent: -5 }).progressPercent, 0);
  assert.equal(flashFlowReducer(flashing, { type: "progress", percent: 150 }).progressPercent, 100);
  assert.equal(flashFlowReducer(flashing, { type: "progress", percent: NaN }).progressPercent, 0);
});

test("reducer: flashing -> resetting on flashComplete, percent pinned to 100", () => {
  const flashing: FlashFlowState = { ...initialFlashFlowState, phase: "flashing", progressPercent: 61 };
  const s = flashFlowReducer(flashing, { type: "flashComplete" });
  assert.equal(s.phase, "resetting");
  assert.equal(s.progressPercent, 100);
});

test("reducer: resetting -> done on resetComplete", () => {
  const resetting: FlashFlowState = { ...initialFlashFlowState, phase: "resetting", progressPercent: 100 };
  const s = flashFlowReducer(resetting, { type: "resetComplete" });
  assert.equal(s.phase, "done");
});

// --- reducer: guarded / stale transitions are no-ops ---------------------

test("reducer: progress is ignored outside the flashing phase", () => {
  const errored: FlashFlowState = { phase: "error", progressPercent: 0, errorMessage: "x", errorKind: "generic" };
  const s = flashFlowReducer(errored, { type: "progress", percent: 50 });
  assert.deepEqual(s, errored, "a stale progress callback after failure must not resurrect the flashing UI");
});

test("reducer: connected is ignored unless currently connecting", () => {
  const s = flashFlowReducer(initialFlashFlowState, { type: "connected" }); // still boot-guidance
  assert.equal(s.phase, "boot-guidance");
});

test("reducer: flashComplete is ignored unless currently flashing", () => {
  const connecting: FlashFlowState = { ...initialFlashFlowState, phase: "connecting" };
  const s = flashFlowReducer(connecting, { type: "flashComplete" });
  assert.equal(s.phase, "connecting");
});

test("reducer: resetComplete is ignored unless currently resetting", () => {
  const s = flashFlowReducer(initialFlashFlowState, { type: "resetComplete" });
  assert.equal(s.phase, "boot-guidance");
});

test("reducer: beginFlash mid-attempt (connecting/flashing/resetting) is ignored — no restart mid-attempt", () => {
  for (const phase of ["connecting", "flashing", "resetting"] as const) {
    const mid: FlashFlowState = { ...initialFlashFlowState, phase };
    const s = flashFlowReducer(mid, { type: "beginFlash" });
    assert.equal(s.phase, phase, `beginFlash during ${phase} must not restart the attempt`);
  }
});

test("reducer: beginFlash from error or done starts a fully-reset fresh attempt", () => {
  const errored: FlashFlowState = { phase: "error", progressPercent: 61, errorMessage: "x", errorKind: "generic" };
  const s = flashFlowReducer(errored, { type: "beginFlash" });
  assert.deepEqual(s, { ...initialFlashFlowState, phase: "connecting" });

  const done: FlashFlowState = { phase: "done", progressPercent: 100, errorMessage: null, errorKind: null };
  assert.deepEqual(flashFlowReducer(done, { type: "beginFlash" }), { ...initialFlashFlowState, phase: "connecting" });
});

// --- reducer: failed / restart work from anywhere -------------------------

test("reducer: failed wins from every phase, carrying message + kind", () => {
  for (const phase of ["boot-guidance", "connecting", "flashing", "resetting", "done"] as const) {
    const s = flashFlowReducer(
      { ...initialFlashFlowState, phase },
      { type: "failed", message: "boom", kind: "wrong-mode" }
    );
    assert.equal(s.phase, "error");
    assert.equal(s.errorMessage, "boom");
    assert.equal(s.errorKind, "wrong-mode");
  }
});

test("reducer: restart returns to the exact initial state from anywhere, including mid-error", () => {
  const errored: FlashFlowState = { phase: "error", progressPercent: 30, errorMessage: "x", errorKind: "port-busy" };
  assert.deepEqual(flashFlowReducer(errored, { type: "restart" }), initialFlashFlowState);
});

// --- classifyFlashError ----------------------------------------------------

test("classifyFlashError: DOMException NetworkError -> port-busy", () => {
  const c = classifyFlashError(new DOMException("port locked", "NetworkError"));
  assert.equal(c.kind, "port-busy");
  assert.match(c.message, /unplug/i);
});

test("classifyFlashError: DOMException InvalidStateError -> port-busy", () => {
  const c = classifyFlashError(new DOMException("bad state", "InvalidStateError"));
  assert.equal(c.kind, "port-busy");
});

test("classifyFlashError: other DOMException names fall through to generic, keeping their own message", () => {
  const c = classifyFlashError(new DOMException("cancelled", "AbortError"));
  assert.equal(c.kind, "generic");
  assert.equal(c.message, "cancelled");
});

test("classifyFlashError: esptool-js's exact sync-failure message -> wrong-mode", () => {
  const c = classifyFlashError(new Error("Failed to connect with the device"));
  assert.equal(c.kind, "wrong-mode");
  assert.match(c.message, /boot/i);
});

test("classifyFlashError: sync-failure match is case-insensitive", () => {
  const c = classifyFlashError(new Error("FAILED TO CONNECT WITH THE DEVICE"));
  assert.equal(c.kind, "wrong-mode");
});

test("classifyFlashError: an unrelated Error message is generic and keeps its own text", () => {
  const c = classifyFlashError(new Error("Couldn't load /firmware/esp32c3/diag.bin (HTTP 404)."));
  assert.equal(c.kind, "generic");
  assert.equal(c.message, "Couldn't load /firmware/esp32c3/diag.bin (HTTP 404).");
});

test("classifyFlashError: a thrown string is used directly as the message", () => {
  const c = classifyFlashError("weird");
  assert.equal(c.kind, "generic");
  assert.equal(c.message, "weird");
});

test("classifyFlashError: a thrown non-Error, non-string value falls back to a calm generic message", () => {
  const c = classifyFlashError(undefined);
  assert.equal(c.kind, "generic");
  assert.match(c.message, /unplug and replug/i);
});
