"use client";

/**
 * A3 — the full step list, reachable from the footer's "Step N of M ⌄"
 * trigger. Replaces "which of these anonymous dots am I on" with a real
 * list: number, title, kind chip + time estimate (the same stepKind/
 * TIME_BY_KIND the persistent sub-header already renders from, so labels
 * can never disagree), and status (done / current / todo). One tap jumps to
 * that step and closes the sheet — this is pure navigation, not a new
 * source of truth (stepIndex/completed still live in useBuildState).
 */

import type { BuildStep } from "@/lib/types";
import { DrawerShell } from "@/components/ui";
import { TIME_BY_KIND } from "@/components/instruction-card";
import { stepKind, kindLabel } from "@/lib/steps/classify";

export interface StepListSheetProps {
  steps: BuildStep[];
  /** Steps quick mode filtered out — Slice 1 (Track 0.3): skips render, never vanish. */
  skipped?: BuildStep[];
  /** Include everything (switch to full mode) — fired from a skipped row. */
  onIncludeSkipped?: () => void;
  stepIndex: number;
  completed: Set<number>;
  onGoStep: (index: number) => void;
  onClose: () => void;
}

function minutesForStep(step: BuildStep): number {
  const digits = /(\d+)/.exec(TIME_BY_KIND[stepKind(step)]);
  return digits ? parseInt(digits[1], 10) : 0;
}

/** "~45 min left" under an hour; "~1h 20m left" (or "~2h left") past it. */
function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function StepListSheet({
  steps,
  skipped = [],
  onIncludeSkipped,
  stepIndex,
  completed,
  onGoStep,
  onClose,
}: StepListSheetProps) {
  // One list in real stepNumber order: visible steps are buttons, skipped
  // steps are ghost rows that say so and offer the full build. The footer's
  // "Step N of M" counts real numbers, so this list must show every N.
  const skippedSet = new Set(skipped.map((s) => s.stepNumber));
  const allRows = [...steps, ...skipped].sort((a, b) => a.stepNumber - b.stepNumber);
  const doneCount = steps.filter((s) => completed.has(s.stepNumber)).length;
  const remainingMinutes = steps
    .filter((s) => !completed.has(s.stepNumber))
    .reduce((sum, s) => sum + minutesForStep(s), 0);

  return (
    <DrawerShell title={`Steps (${steps.length})`} onClose={onClose} width="sm">
      <p className="text-xs text-text-muted">
        {doneCount} of {steps.length} complete · ~{formatMinutes(remainingMinutes)} left
      </p>
      <div className="space-y-1">
        {allRows.map((st) => {
          if (skippedSet.has(st.stepNumber)) {
            return (
              <div
                key={st.stepNumber}
                className="w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-dashed border-border-subtle opacity-70"
              >
                <span aria-hidden className="shrink-0 w-4 text-center text-xs text-text-muted">–</span>
                <span className="shrink-0 w-5 text-xs font-mono text-text-muted">{st.stepNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate text-text-muted">{st.title}</span>
                  <span className="text-[10px] text-text-muted">skipped in quick mode</span>
                </span>
                {onIncludeSkipped && (
                  <button
                    type="button"
                    onClick={onIncludeSkipped}
                    className="shrink-0 text-[11px] font-semibold text-accent cursor-pointer min-h-11 px-2 hover:underline"
                  >
                    Include
                  </button>
                )}
              </div>
            );
          }
          const i = steps.indexOf(st);
          const isDone = completed.has(st.stepNumber);
          const isCurrent = i === stepIndex;
          return (
            <button
              key={st.stepNumber}
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => {
                onGoStep(i);
                onClose();
              }}
              className={`w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left cursor-pointer transition-colors ${
                isCurrent
                  ? "bg-accent/10 border border-accent/40"
                  : "border border-transparent hover:bg-surface-overlay"
              }`}
            >
              <span
                aria-hidden
                className={`shrink-0 w-4 text-center text-xs ${
                  isDone ? "text-success" : isCurrent ? "text-accent" : "text-text-muted"
                }`}
              >
                {isDone ? "✓" : "○"}
              </span>
              <span className="shrink-0 w-5 text-xs font-mono text-text-muted">{st.stepNumber}</span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm truncate ${isCurrent ? "font-semibold text-text" : "text-text"}`}
                >
                  {st.title}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                    {kindLabel(stepKind(st))}
                  </span>
                  <span className="text-[10px] text-text-muted">{TIME_BY_KIND[stepKind(st)]}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}
