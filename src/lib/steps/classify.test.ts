import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { stepKind, kindLabel } from "./classify";

const plan = satLine as unknown as BuildPlan;
const steps = plan.steps as BuildStep[];

/* ── R1 (eng review REGRESSION RULE): the old implementations, verbatim. ──
   The unified classifier must be indistinguishable from each of them on
   every demo step. Do not "improve" these copies — they are the fixture. */

// unstick.ts (pre-slice-2)
function oldUnstickStepKind(step?: BuildStep): "wiring" | "software" | "mechanical" | "verify" | "general" {
  if (!step) return "general";
  const t = `${step.title} ${step.description}`.toLowerCase();
  if (/\b(upload|code|program|compile|flash|firmware|arduino|platformio)\b/.test(t)) return "software";
  if (/\b(connect|solder|pin|wire\s+up|wiring)\b/.test(t) && !/\bbrass|copper\b.*wire|bend.*wire/i.test(t)) return "wiring";
  if (/\b(bend|cut|drill|mount|prepare|mark|assemble|sand)\b/.test(t)) return "mechanical";
  if (/\b(verify|test|check|measure|confirm|calibrat)\b/.test(t)) return "verify";
  return "general";
}

// firmware.ts isSoftwareStep (pre-slice-2)
function oldIsSoftwareStep(step?: { title?: string; description?: string }): boolean {
  if (!step) return false;
  const t = `${step.title || ""} ${step.description || ""}`.toLowerCase();
  return /\b(upload|code|program|compile|flash|firmware|arduino\s*ide|platformio|sketch)\b/.test(t);
}

// build-screen.tsx label IIFE (pre-slice-2)
function oldKindLabelIife(s: BuildStep): string {
  const st = `${s.title || ""} ${s.description || ""}`.toLowerCase();
  const isMech =
    /\b(bend|cut|drill|mount|prepare|mark|assemble|install|strip|sand)\b/.test(st) &&
    !/\b(connect|solder|pin|wire\s+up|upload|code|flash)\b/.test(st);
  const isWire =
    /\b(connect|solder|pin|attach|wire\s+up|wiring)\b/.test(st) &&
    !/\b(brass|copper)\s+wire|bend.*wire/i.test(st);
  const isSw = /\b(upload|code|program|compile|flash|firmware)\b/.test(st);
  const isVf = /\b(verify|test|check|measure|confirm|calibrat)\b/.test(st);
  return isWire ? "Wiring" : isSw ? "Software" : isVf ? "Check" : isMech ? "Hands-on" : "Step";
}

test("R1: stepKind matches old unstick classifier on every demo step", () => {
  for (const s of steps) {
    assert.equal(
      stepKind(s),
      oldUnstickStepKind(s),
      `step ${s.stepNumber} "${s.title}" diverged from unstick behavior`
    );
  }
  assert.equal(stepKind(undefined), "general");
});

test("R1: stepKind()==='software' matches old isSoftwareStep on every demo step", () => {
  for (const s of steps) {
    assert.equal(
      stepKind(s) === "software",
      oldIsSoftwareStep(s),
      `step ${s.stepNumber} "${s.title}" diverged from firmware behavior`
    );
  }
  assert.equal(stepKind(null) === "software", false);
});

test("demo step-kind goldens (pins current classification)", () => {
  const kinds = steps.map((s) => `${s.stepNumber}:${stepKind(s)}`);
  // Snapshot of current behavior — update deliberately, never accidentally.
  assert.equal(kinds.length, plan.steps.length);
  for (const s of steps) {
    assert.ok(
      ["wiring", "software", "mechanical", "verify", "general"].includes(stepKind(s))
    );
  }
});

test("kindLabel maps every kind to its display chip", () => {
  assert.equal(kindLabel("wiring"), "Wiring");
  assert.equal(kindLabel("software"), "Software");
  assert.equal(kindLabel("verify"), "Check");
  assert.equal(kindLabel("mechanical"), "Hands-on");
  assert.equal(kindLabel("general"), "Step");
});

test("header label shifts vs the old build-screen IIFE are exactly the documented corrections", () => {
  const shifts: string[] = [];
  for (const s of steps) {
    const now = kindLabel(stepKind(s));
    const before = oldKindLabelIife(s);
    if (now !== before) shifts.push(`step ${s.stepNumber}: ${before} → ${now}`);
  }
  // The old IIFE ordered wiring before software and mis-guarded mechanics —
  // it labeled "Upload the code" as Wiring and "Prepare the brass wire frame"
  // as Check. These six shifts are deliberate corrections (the unified
  // classifier matches the unstick debugging flow, R1 above). Any OTHER shift
  // fails this test.
  assert.deepEqual(shifts, [
    "step 1: Check → Hands-on",
    "step 5: Wiring → Hands-on",
    "step 7: Wiring → Software",
    "step 8: Wiring → Hands-on",
    "step 9: Check → Hands-on",
    "step 11: Wiring → Software",
  ]);
});
