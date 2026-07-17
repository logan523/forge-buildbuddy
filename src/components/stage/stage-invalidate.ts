/**
 * Stage invalidate bus — the one hand on the render throttle.
 *
 * The Stage Canvas runs frameloop="demand": nothing renders unless someone asks.
 * Anything that changes visible state — the OLED clock tick, a camera glide, a
 * scrub, damped part motion — calls invalidateStage(). Code inside the Canvas
 * can use R3F's own invalidate; this bus exists so code OUTSIDE the Canvas
 * (interval timers, scrubber UI, mode switches) can request frames too.
 */
import { useEffect } from "react";

let invalidator: (() => void) | null = null;

/** Bound once by StageCanvas onCreated. Returns an unbind for unmount. */
export function bindStageInvalidate(fn: () => void): () => void {
  invalidator = fn;
  return () => {
    if (invalidator === fn) invalidator = null;
  };
}

/** Request a frame. Safe to call any time (no-op when no Stage is mounted). */
export function invalidateStage(): void {
  invalidator?.();
}

/**
 * Post-commit frame request. In demand mode, a suspended subtree (HDRI, GLB)
 * resolving and committing does NOT schedule a frame by itself — the scene
 * stays invisible until something asks. Call this hook inside any component
 * that lives in a Suspense scope: its effect can only run once that scope has
 * actually committed, so the request lands exactly when content appears.
 */
export function useInvalidateOnCommit(): void {
  // No dep array on purpose: after every commit of the host component.
  // Renders of these hosts are rare (mount, prop change), so this is cheap.
  useEffect(() => {
    invalidateStage();
  });
}

/** Drop-in sibling for JSX trees: pings a frame whenever its scope commits. */
export function CommitPing(): null {
  useInvalidateOnCommit();
  return null;
}
