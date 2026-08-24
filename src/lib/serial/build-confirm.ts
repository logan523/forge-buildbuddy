/**
 * Post-flash build-identity confirmation — pure, Track A3 (rebuild cycle).
 *
 * Before this existed, the flash flow (flash-flow.tsx) called
 * `loader.after("hard_reset")` and blindly assumed success — no version
 * readback, no re-scan-and-compare. A stale binary could get reflashed
 * repeatedly with every "compile" reporting a plausible size, and the only
 * way to catch it was comparing file mtimes by hand after hours of
 * unexplained device symptoms. This module is the fix: every sketch
 * compiled through scripts/compile-firmware.mjs prints a FORGE_BUILD_ID
 * line as the first thing in setup() (see build_id.h), and the app itself
 * watches for it after a flash and says, plainly, whether the device is
 * actually running what was just flashed.
 *
 * No I/O, no timers, no React — same shape as verify.ts's pure reducer;
 * flash-console.tsx supplies the actual serial lines and the timeout.
 */

import type { ScannerLine } from "./line-parser";

export type ConfirmStatus = "waiting" | "confirmed" | "mismatch" | "timeout";

export interface ConfirmState {
  /** The buildId of the manifest entry that was just flashed. */
  expected: string;
  status: ConfirmStatus;
  /** The buildId actually reported by the device, once a build-id line arrives. */
  got?: string;
}

/** Start watching for confirmation right after a flash completes. */
export function startConfirm(expected: string): ConfirmState {
  return { expected, status: "waiting" };
}

/**
 * Feed one classified serial line in. Only ever transitions a "waiting"
 * confirm out of that state once — a later, unrelated build-id line (e.g.
 * from a totally different sketch someone flashes by hand afterward) can't
 * overwrite a result that already landed. Any state but "waiting" — or no
 * state at all (nothing pending) — passes through unchanged.
 */
export function applyLine(state: ConfirmState | null, line: ScannerLine): ConfirmState | null {
  if (!state || state.status !== "waiting" || line.kind !== "build-id") return state;
  return { ...state, status: state.expected === line.buildId ? "confirmed" : "mismatch", got: line.buildId };
}

/** Called when the confirm window elapses with nothing having arrived. */
export function applyTimeout(state: ConfirmState | null): ConfirmState | null {
  if (!state || state.status !== "waiting") return state;
  return { ...state, status: "timeout" };
}
