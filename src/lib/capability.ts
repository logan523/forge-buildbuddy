/**
 * Bench capability matrix (Slice 3, D1). Web Serial exists only in desktop
 * Chromium — not Safari, not any iOS/Android browser — and a phone propped
 * on the workbench is the realistic bench posture. Every serial-dependent
 * surface must degrade HONESTLY by capability, never present a wall: the
 * evidence menu shrinks, the copy says why, and nothing pretends.
 */

import { serialSupported } from "./serial/session";

export interface BenchCapability {
  webSerial: boolean;
}

export function detectCapability(): BenchCapability {
  return { webSerial: serialSupported() };
}

/** Honest one-liner for surfaces that lose their instrument tier. */
export function capabilityNote(cap: BenchCapability): string | null {
  if (cap.webSerial) return null;
  return "This browser can't talk to the board over USB (works in desktop Chrome or Edge) — tug and photo checks still work here; plug into a laptop for the live check.";
}
