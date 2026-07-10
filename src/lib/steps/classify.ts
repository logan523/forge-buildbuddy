/**
 * THE step-kind classifier — replaces four live copies (unstick.ts,
 * firmware.isSoftwareStep, build-screen's inline label IIFE, plus the dead
 * StepVisual copy deleted earlier) with one implementation.
 *
 * Regexes are the union of the previous copies; order matches unstick.ts
 * (software → wiring → mechanical → verify), whose behavior drives the
 * user-facing debugging flow. R1 regression goldens in classify.test.ts
 * assert equivalence with the old implementations on every demo step.
 */

export type StepKind = "wiring" | "software" | "mechanical" | "verify" | "general";

const SOFTWARE =
  /\b(upload|code|program|compile|flash|firmware|arduino(?:\s*ide)?|platformio|sketch)\b/;
const WIRING = /\b(connect|solder|pin|attach|wire\s+up|wiring)\b/;
// Structural wire work (brass frame bending) is NOT electrical wiring.
const WIRING_GUARD = /\bbrass|copper\b.*wire|bend.*wire/i;
const MECHANICAL = /\b(bend|cut|drill|mount|prepare|mark|assemble|install|strip|sand)\b/;
const VERIFY = /\b(verify|test|check|measure|confirm|calibrat)\b/;

export function stepKind(step?: {
  title?: string;
  description?: string;
} | null): StepKind {
  if (!step) return "general";
  const t = `${step.title || ""} ${step.description || ""}`.toLowerCase();
  if (SOFTWARE.test(t)) return "software";
  if (WIRING.test(t) && !WIRING_GUARD.test(t)) return "wiring";
  if (MECHANICAL.test(t)) return "mechanical";
  if (VERIFY.test(t)) return "verify";
  return "general";
}

/** Display label for the step header chip. */
export function kindLabel(kind: StepKind): string {
  switch (kind) {
    case "wiring":
      return "Wiring";
    case "software":
      return "Software";
    case "verify":
      return "Check";
    case "mechanical":
      return "Hands-on";
    default:
      return "Step";
  }
}
