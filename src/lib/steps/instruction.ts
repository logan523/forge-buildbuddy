import type { BuildStep, StepAction } from "@/lib/types";
import type { FirmwarePackage } from "@/lib/firmware";
import { doneWhenForSoftwareStep } from "@/lib/firmware";
import { stepKind } from "./classify";

/** Derive beginner actions from free-text when structured actions missing. */
export function resolveActions(step: BuildStep): StepAction[] {
  if (Array.isArray(step.actions) && step.actions.length > 0) {
    return step.actions
      .map((a, i) => ({
        n: typeof a.n === "number" ? a.n : i + 1,
        text: String(a.text || "").trim(),
        caution: a.caution ? String(a.caution).trim() : undefined,
      }))
      .filter((a) => a.text.length > 0);
  }
  // Split description into sentence bullets (max 6)
  const raw = (step.description || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 200);
  return raw.slice(0, 6).map((text, i) => ({ n: i + 1, text }));
}

export function resolveGoal(step: BuildStep): string {
  if (step.goal?.trim()) return step.goal.trim();
  if (step.quickSummary?.trim()) return step.quickSummary.trim();
  const first = (step.description || "").split(/[.!?]/)[0]?.trim();
  return first || step.title;
}

export function resolveYouNeed(step: BuildStep): string[] {
  if (Array.isArray(step.youNeed) && step.youNeed.length > 0) {
    return step.youNeed.map((s) => String(s).trim()).filter(Boolean);
  }
  return [];
}

/**
 * Success-criteria copy for a step. Priority: explicit author `doneWhen` →
 * (software steps only, when a firmware package is available) a check
 * derived from the actual sketch to upload → `afterState` → a leftover
 * `verification.description` → an honest "nothing generated" fallback that
 * never claims a check exists when none was produced (A4).
 */
export function resolveDoneWhen(step: BuildStep, firmware?: FirmwarePackage | null): string {
  if (step.doneWhen?.trim()) return step.doneWhen.trim();
  if (firmware && stepKind(step) === "software") {
    const derived = doneWhenForSoftwareStep(step, firmware);
    if (derived) return derived;
  }
  if (step.afterState?.trim()) return step.afterState.trim();
  if (step.verification?.description) return step.verification.description;
  return "No specific check was generated for this step — look it over against the photo/goal before moving on.";
}
