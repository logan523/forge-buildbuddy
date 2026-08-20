import type { BuildStep, StepAction, CustomFirmwareSource } from "@/lib/types";
import type { FirmwarePackage } from "@/lib/firmware";
import { doneWhenForSoftwareStep } from "@/lib/firmware";
import { stepKind } from "./classify";

/** Soft cap for a kitchen-table goal — longer copy is LLM wall-of-text. */
const SHORT_GOAL_MAX = 110;

/**
 * One-line goal derived from compiled connections. Used when the author/LLM
 * goal is missing or a long prose dump — wiring steps lead with pins, not essays.
 */
export function goalFromConnections(step: BuildStep): string | null {
  const conns = step.compiled?.connections;
  if (!conns?.length) return null;
  const parts = new Set<string>();
  for (const c of conns) {
    if (c.fromLabel) parts.add(c.fromLabel);
    if (c.toLabel) parts.add(c.toLabel);
  }
  const labels = [...parts].slice(0, 3).join(" + ");
  const n = conns.length;
  return `Wire ${n} connection${n === 1 ? "" : "s"}${labels ? ` · ${labels}` : ""}.`;
}

/** True when the compiler attached real connection facts (stronger than title regex). */
function hasCompiledWiring(step: BuildStep): boolean {
  return (step.compiled?.connections?.length ?? 0) > 0;
}

/** Derive beginner actions from free-text when structured actions missing. */
export function resolveActions(step: BuildStep): StepAction[] {
  // Compiled wiring facts: GuidedSteps / ConnectionsTable own the work.
  // Returning empty stops LLM description sentences from becoming a second,
  // disagreeable checklist next to the pin table. Key off connections (not
  // title regex) — "Wire the OLED" does not match the classify WIRING pattern.
  if (hasCompiledWiring(step) || (step.compiled?.microSteps?.length ?? 0) > 0) {
    return [];
  }
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
  const compiledGoal = goalFromConnections(step);

  // Compiled wiring: prefer a short authored goal; otherwise use compiled
  // one-liner. Never fall through to a multi-sentence description when we
  // have nets — kitchen-table diet.
  if (compiledGoal) {
    const authored = (step.goal || step.quickSummary || "").trim();
    if (authored && authored.length <= SHORT_GOAL_MAX) return authored;
    return compiledGoal;
  }

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
 * (software steps only) when the plan ships its own hand-authored firmware
 * (`customFirmware`), name its real entry file rather than guessing against
 * a fixed template set that doesn't apply → otherwise, when a generated
 * firmware package is available, a check derived from the actual sketch to
 * upload → `afterState` → a leftover `verification.description` → an
 * honest "nothing generated" fallback that never claims a check exists when
 * none was produced (A4).
 */
export function resolveDoneWhen(
  step: BuildStep,
  firmware?: FirmwarePackage | null,
  customFirmware?: CustomFirmwareSource | null
): string {
  if (step.doneWhen?.trim()) return step.doneWhen.trim();
  if (customFirmware && stepKind(step) === "software") {
    return `Upload ${customFirmware.entryFile} — this is your own firmware, not a Forge template. Watch Serial Monitor at 115200 baud for what it actually does.`;
  }
  if (firmware && stepKind(step) === "software") {
    const derived = doneWhenForSoftwareStep(step, firmware);
    if (derived) return derived;
  }
  if (step.afterState?.trim()) return step.afterState.trim();
  if (step.verification?.description) return step.verification.description;
  return "No specific check was generated for this step — look it over against the photo/goal before moving on.";
}
