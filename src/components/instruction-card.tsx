"use client";

/**
 * One step's instruction column. EXTENDED (not replaced) in the overhaul:
 * derived fact blocks (ConnectionsTable / CheckYourWorkCard) render from
 * step.compiled, actions become a persisted checklist, safety notes show at
 * EVERY detail level, and the levels finally differ for real:
 *
 *   quick    — goal · safety · connections · check-your-work
 *   standard — + you-need · action checklist · common mistakes
 *   deep     — + why this works · tool technique · full notes
 */

import type { BuildPlan, BuildStep, MicroStep } from "@/lib/types";
import {
  resolveActions,
  resolveGoal,
  resolveYouNeed,
} from "@/lib/steps/instruction";
import { stepKind } from "@/lib/steps/classify";
import {
  ActionChecklist,
  CheckYourWorkCard,
  ConnectionsTable,
  GlossaryText,
} from "@/components/step-facts";
import { PhotoCheck } from "@/components/build/photo-check";
import { GuidedSteps } from "@/components/build/guided-steps";

export const TIME_BY_KIND: Record<ReturnType<typeof stepKind>, string> = {
  wiring: "≈15 min",
  mechanical: "≈10 min",
  software: "≈10 min",
  verify: "≈5 min",
  general: "≈5 min",
};

export function InstructionCard({
  step,
  detailLevel = "standard",
  planId,
  plan,
  stepCompleted = false,
  onAutoComplete,
  onActiveWire,
}: {
  step: BuildStep;
  detailLevel?: "quick" | "standard" | "deep";
  planId?: string;
  plan?: BuildPlan;
  stepCompleted?: boolean;
  onAutoComplete?: () => void;
  onActiveWire?: (m: MicroStep | null) => void;
}) {
  const goal = resolveGoal(step);
  const youNeed = resolveYouNeed(step);
  const actions = resolveActions(step);
  const kind = stepKind(step);
  // Wiring steps with compiled micro-steps get the guided one-wire-at-a-time
  // experience (hand-holding) in place of the coarse checklist + separate table.
  const guided =
    kind === "wiring" &&
    !!plan &&
    !!planId &&
    !!onAutoComplete &&
    (step.compiled?.microSteps?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Step N of M / title / kind chip / time now render once in
          BuildScreen's persistent sub-header (Slice A1) — this column
          starts at the goal. */}
      <GlossaryText text={goal} className="text-sm text-text leading-relaxed block" />

      {/* Safety renders at EVERY detail level — quick mode must never hide it. */}
      {(step.safetyNotes?.length ?? 0) > 0 && (
        <div className="flex gap-2 items-start p-3 rounded-xl bg-warning-soft border border-warning/25">
          <span aria-hidden className="text-sm leading-none pt-0.5">⚠</span>
          <div className="min-w-0 space-y-1">
            {step.safetyNotes!.map((n, i) => (
              <p key={i} className="text-xs text-text leading-relaxed">{n}</p>
            ))}
          </div>
        </div>
      )}

      {detailLevel !== "quick" && youNeed.length > 0 && (
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

      {guided ? (
        <GuidedSteps
          step={step}
          plan={plan!}
          planId={planId!}
          stepCompleted={stepCompleted}
          onAutoComplete={onAutoComplete}
          onActiveWire={onActiveWire}
        />
      ) : (
        <>
          {detailLevel !== "quick" &&
            (planId && onAutoComplete ? (
              <ActionChecklist
                planId={planId}
                stepNumber={step.stepNumber}
                actions={actions}
                stepCompleted={stepCompleted}
                onAutoComplete={onAutoComplete}
              />
            ) : (
              actions.length > 0 && (
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
                          {a.caution && <p className="text-xs text-warning mt-1">⚠ {a.caution}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )
            ))}

          {step.compiled && <ConnectionsTable compiled={step.compiled} />}
        </>
      )}

      <CheckYourWorkCard step={step} />

      {/* Eval-gated (self-hides unless public/photo-check.pass.json + a
          reference photo for this step both exist — see Tension C). */}
      {planId && <PhotoCheck step={step} planId={planId} />}

      {detailLevel === "quick" && !step.actions?.length && step.quickSummary && (
        <p className="text-xs text-text-muted">{step.quickSummary}</p>
      )}

      {detailLevel !== "quick" && (step.commonMistakes?.length ?? 0) > 0 && (
        <details className="group">
          <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1.5 min-h-11">
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

      {detailLevel === "deep" && (
        <>
          {step.whyThisWorks && (
            <details className="group">
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1.5 min-h-11">
                Why this matters
              </summary>
              <p className="text-xs text-text-secondary leading-relaxed mt-1 pl-2 border-l-2 border-info/30">
                {step.whyThisWorks}
              </p>
            </details>
          )}

          {step.toolTechnique && (
            <details className="group">
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1.5 min-h-11">
                Tool technique — {step.toolTechnique.tool}
              </summary>
              <div className="mt-1 pl-2 border-l-2 border-accent/30 space-y-1">
                <p className="text-xs text-text-secondary leading-relaxed">
                  {step.toolTechnique.usage}
                </p>
                {step.toolTechnique.safety && (
                  <p className="text-xs text-warning">⚠ {step.toolTechnique.safety}</p>
                )}
                {step.toolTechnique.mistake && (
                  <p className="text-xs text-text-secondary">
                    <span className="font-medium">Avoid:</span> {step.toolTechnique.mistake}
                  </p>
                )}
              </div>
            </details>
          )}

          {step.description && (
            <details>
              <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer py-1.5 min-h-11">
                Full notes
              </summary>
              <p className="text-xs text-text-secondary leading-relaxed mt-1 whitespace-pre-wrap">
                {step.description}
              </p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
