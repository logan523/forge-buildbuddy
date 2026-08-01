/**
 * Live wiring verification — pure, C3. Aggregates classified serial lines
 * (line-parser.ts's parseScannerLine) into a per-expected-device verdict, so
 * the "Wiring check" card (flash-console.tsx) can tell a builder whether
 * their board actually answered on the I2C bus, not just whether the wiring
 * *should* work on paper. No I/O, no timers, no React — every timestamp is a
 * plain `now: number` the caller supplies (Date.now() in the real UI, fixed
 * literals in tests), so this is exercised deterministically without fake
 * timers, the same shape as flash-flow.ts's pure reducer.
 *
 * ── Missing-detection heuristic: elapsed time, not a scan-boundary line ──
 *
 * The obvious-looking options don't actually exist in this stream:
 *
 *   - The diag firmware this console watches (scripts/firmware-src/diag/
 *     diag.ino) prints NO scan-boundary marker at all. Its loop() emits only
 *     zero-or-more "Found device at 0x.." lines per scan, or "No I2C
 *     devices..." when a scan is empty — nothing marks where one scan ends
 *     and the next begins. (The generated code-package scanner sketch,
 *     src/lib/firmware.ts's sketchI2cScanner, DOES print "--- scan ---" and
 *     "Total: N" — but that is a different sketch this console never flashes
 *     or watches, so it's not a signal available here.)
 *   - diag.ino's one unique banner, "FORGE-DIAG v1 sda=.. scl=..", prints
 *     EXACTLY ONCE, in setup() — never again in loop(). "wait for the next
 *     boot line" fires for the first scan and then never again, so it can't
 *     mark later scan boundaries either.
 *
 * That leaves elapsed wall-clock time as the only deterministic signal this
 * stream actually carries: diag.ino scans every SCAN_INTERVAL_MS (3000ms,
 * matching its own SCAN_INTERVAL_MS constant), and — because setup() spends
 * up to ~800ms waiting for the USB host plus up to CONFIG_WINDOW_MS (2000ms)
 * listening for the optional pin-config line before its first loop() ever
 * runs — a fresh boot's FIRST scan can itself land close to one full
 * SCAN_INTERVAL_MS after the monitor starts watching. Worst case, the
 * monitor instead attaches to an already-running board right after a scan
 * just fired, so the next one is up to one more SCAN_INTERVAL_MS away.
 * MISSING_AFTER_MS covers both worst cases (two full intervals) plus a flat
 * margin for serial/scheduling jitter, so a device is only ever called
 * "missing" after at least one full, honestly-observed scan cycle — never
 * while a slow-but-honest first scan is still in flight.
 */

import type { ScannerLine } from "./line-parser";
import type { ExpectedDevice } from "./expected-devices";

/** diag.ino's SCAN_INTERVAL_MS (scripts/firmware-src/diag/diag.ino) — the wall-clock cadence between I2C scans once the board is running. */
export const SCAN_INTERVAL_MS = 3000;

/**
 * A device is marked "missing" once this many ms have elapsed since
 * monitoring began without its address appearing — two full scan intervals
 * (worst-case first-scan latency, plus one more full cycle of headroom) and
 * a flat 1s margin. See the file header for the full reasoning.
 */
export const MISSING_AFTER_MS = SCAN_INTERVAL_MS * 2 + 1000; // 7000ms

export type DeviceStatus = "waiting" | "found" | "missing";

export interface DeviceVerdict {
  device: ExpectedDevice;
  status: DeviceStatus;
  /** Set only when status === "found" — which of device.addresses actually answered (may be the alt, not the primary). */
  foundAddress?: number;
}

/** A found address that doesn't belong to any expected device — surfaced as an info row, never a failure. */
export interface UnexpectedDevice {
  address: number;
  /** ms timestamp (caller's clock) it was first seen. */
  firstSeenAt: number;
}

export interface VerifyState {
  /** ms timestamp (caller's clock) monitoring began — the missing-detection clock's zero point. */
  startedAt: number;
  /** address -> ms timestamp it was first seen. */
  foundAt: Map<number, number>;
}

/** Start a fresh aggregator. Call this once per connect (a new monitor session resets what's been seen). */
export function createVerifyState(startedAt: number): VerifyState {
  return { startedAt, foundAt: new Map() };
}

/**
 * Feed one classified serial line (line-parser.ts's parseScannerLine
 * output) plus the current wall-clock ms. Only "i2c-found" lines carry any
 * information this aggregator cares about; anything else (boot noise, plain
 * text) is a no-op that returns the SAME state reference, so callers using
 * this inside a React setState updater never trigger a needless re-render
 * for lines that couldn't have changed a verdict.
 */
export function feedLine(state: VerifyState, line: ScannerLine, now: number): VerifyState {
  if (line.kind !== "i2c-found") return state;
  if (state.foundAt.has(line.address)) return state; // already known — first-seen time doesn't change
  const foundAt = new Map(state.foundAt);
  foundAt.set(line.address, now);
  return { ...state, foundAt };
}

/**
 * Per-expected-device verdicts as of `now`. A device already found stays
 * "found" forever (once answered, always answered — elapsed time no longer
 * matters); otherwise it's "waiting" until MISSING_AFTER_MS has elapsed
 * since `state.startedAt`, then "missing".
 */
export function deviceVerdicts(state: VerifyState, expected: ExpectedDevice[], now: number): DeviceVerdict[] {
  return expected.map((device) => {
    const foundAddress = device.addresses.find((addr) => state.foundAt.has(addr));
    if (foundAddress != null) {
      return { device, status: "found", foundAddress };
    }
    const elapsed = now - state.startedAt;
    return { device, status: elapsed >= MISSING_AFTER_MS ? "missing" : "waiting" };
  });
}

/** Found addresses that don't belong to any expected device, sorted ascending by address for a stable display order. */
export function unexpectedDevices(state: VerifyState, expected: ExpectedDevice[]): UnexpectedDevice[] {
  const known = new Set(expected.flatMap((d) => d.addresses));
  return Array.from(state.foundAt.entries())
    .filter(([address]) => !known.has(address))
    .map(([address, firstSeenAt]) => ({ address, firstSeenAt }))
    .sort((a, b) => a.address - b.address);
}

/**
 * P1.3/P2: true when every expected device answered (status === "found").
 * Empty expected list is NOT a pass — nothing to verify.
 */
export function allExpectedFound(verdicts: DeviceVerdict[]): boolean {
  return verdicts.length > 0 && verdicts.every((v) => v.status === "found");
}
