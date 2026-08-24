import type { BuildPlan, BuildStep } from "./types";

export type BuildMode = "quick" | "full";

/**
 * Quick mode: shorter path for first power-on.
 * Keeps smoke/wiring/software/verify; soft-filters long mechanical polish steps
 * when a fuller set exists. Never drops below 4 steps.
 */
export function filterStepsForMode(plan: BuildPlan, mode: BuildMode): BuildStep[] {
  const steps = plan.steps || [];
  if (mode === "full" || steps.length <= 5) return steps;

  const scored = steps.map((s) => {
    const t = `${s.title} ${s.description}`.toLowerCase();
    let keep = 0;
    if (/\b(wire|connect|solder|i2c|pin)\b/.test(t)) keep += 3;
    if (/\b(upload|code|flash|firmware|program)\b/.test(t)) keep += 3;
    if (/\b(power|battery|charge|test|verify|calibrat)\b/.test(t)) keep += 2;
    if (/\b(oled|display|sensor|touch)\b/.test(t) && /\b(prepare|install)\b/.test(t)) keep += 2;
    if (/\b(bamboo|brass|frame|drill|coaster|solar panel|mount|aesthetic)\b/.test(t)) keep -= 1;
    if (/\b(final|calibration|everything on the base)\b/.test(t)) keep += 2;
    return { s, keep };
  });

  const quick = scored
    .filter((x) => x.keep >= 2)
    .map((x) => x.s);

  // Always include first and last for narrative closure
  const byNum = new Map(steps.map((s) => [s.stepNumber, s]));
  const first = steps[0];
  const last = steps[steps.length - 1];
  const set = new Map<number, BuildStep>();
  for (const s of quick) set.set(s.stepNumber, s);
  if (first) set.set(first.stepNumber, first);
  if (last) set.set(last.stepNumber, last);

  const result = [...set.values()].sort((a, b) => a.stepNumber - b.stepNumber);
  return result.length >= 4 ? result : steps;
}

/**
 * The steps quick mode HID — Slice 1 (Track 0.3): skipping must be visible,
 * never silent. The real build's "moved me to step 6 automatically" came from
 * this filter dropping steps while the footer counted the filtered list.
 */
export function skippedStepsForMode(plan: BuildPlan, mode: BuildMode): BuildStep[] {
  if (mode === "full") return [];
  const kept = new Set(filterStepsForMode(plan, mode).map((s) => s.stepNumber));
  return (plan.steps || []).filter((s) => !kept.has(s.stepNumber));
}

export function modeLabel(mode: BuildMode): string {
  return mode === "quick" ? "Quick test" : "Full build";
}
