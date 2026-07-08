"use client";

import type { BuildStep } from "@/lib/types";
import {
  resolveActions,
  resolveDoneWhen,
  resolveGoal,
  resolveYouNeed,
} from "@/lib/steps/instruction";

export function InstructionCard({
  step,
  stepIndex,
  totalSteps,
  kindLabel,
  detailLevel = "standard",
}: {
  step: BuildStep;
  stepIndex: number;
  totalSteps: number;
  kindLabel: string;
  detailLevel?: "quick" | "standard" | "deep";
}) {
  const goal = resolveGoal(step);
  const youNeed = resolveYouNeed(step);
  const actions = resolveActions(step);
  const doneWhen = resolveDoneWhen(step);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-text-muted font-mono mb-1">
          Step {stepIndex + 1} of {totalSteps}
          {kindLabel ? ` · ${kindLabel}` : ""}
        </p>
        <h2 className="text-xl font-bold text-text font-serif mb-1">{step.title}</h2>
        <p className="text-sm text-text leading-relaxed">{goal}</p>
      </div>

      {youNeed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            You need
          </p>
          <div className="flex flex-wrap gap-1.5">
            {youNeed.map((item) => (
              <span
                key={item}
                className="text-xs px-2.5 py-1 rounded-lg bg-surface-overlay border border-border-subtle text-text-secondary"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Do this
          </p>
          <ol className="space-y-2.5">
            {actions.map((a) => (
              <li key={a.n} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">
                  {a.n}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm text-text leading-relaxed">{a.text}</p>
                  {a.caution && (
                    <p className="text-xs text-warning mt-1">⚠ {a.caution}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="p-3 rounded-xl bg-success-soft/60 border border-success/20">
        <p className="text-[10px] font-semibold text-success uppercase tracking-wider mb-1">
          Done when
        </p>
        <p className="text-sm text-text-secondary leading-relaxed">{doneWhen}</p>
      </div>

      {detailLevel === "quick" && !step.actions?.length && step.quickSummary && (
        <p className="text-xs text-text-muted">{step.quickSummary}</p>
      )}

      {detailLevel !== "quick" && (
        <>
          {step.whyThisWorks && (
            <details className="group">
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1">
                Why this matters
              </summary>
              <p className="text-xs text-text-secondary leading-relaxed mt-1 pl-2 border-l-2 border-info/30">
                {step.whyThisWorks}
              </p>
            </details>
          )}

          {(step.commonMistakes?.length ?? 0) > 0 && (
            <details className="group">
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1">
                Common mistakes
              </summary>
              <div className="mt-2 space-y-2">
                {(step.commonMistakes || []).slice(0, 4).map((cm, i) => (
                  <div key={i} className="pl-2 border-l-2 border-warning/25">
                    <p className="text-xs font-medium text-warning">{cm.symptom}</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      <span className="font-medium">Fix:</span> {cm.fix}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {detailLevel === "deep" && step.description && (
            <details>
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1">
                Full notes
              </summary>
              <p className="text-xs text-text-secondary leading-relaxed mt-1 whitespace-pre-wrap">
                {step.description}
              </p>
            </details>
          )}

          {step.safetyNotes?.map((n, i) => (
            <p key={i} className="text-xs text-warning">
              {n}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
