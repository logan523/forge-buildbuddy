"use client";

/**
 * Hands-free kitchen-table mode (E5): the current action, huge, read aloud —
 * the phone becomes a bench instrument. Knuckle-sized Back / Done buttons;
 * checking the last action of the last step lands on the finish state.
 * Speech is enhancement-only (feature-detected); Back/Esc closes (F4);
 * advancing cancels speech and reads the new action (V6 wrapper).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildPlan, BuildStep, StepAction } from "@/lib/types";
import { resolveActions } from "@/lib/steps/instruction";
import { loadActionChecks, saveActionChecks } from "@/lib/storage";
import { isSpeechAvailable, speakLine, stopSpeech } from "@/lib/speech";
import { diagLog } from "@/lib/diag";

export function HandsFreeMode({
  plan,
  steps,
  stepIndex,
  completed,
  onGoStep,
  onToggleComplete,
  onClose,
}: {
  plan: BuildPlan;
  steps: BuildStep[];
  stepIndex: number;
  completed: Set<number>;
  onGoStep: (index: number) => void;
  onToggleComplete: (stepNumber: number) => void;
  onClose: () => void;
}) {
  const step = steps[stepIndex];
  // Wiring steps: resolveActions deliberately returns [] (the pin table owns
  // the checklist), which used to leave hands-free with NOTHING to speak on
  // exactly the steps where hands are full of flux (Slice 1 fix). Speak the
  // compiled per-wire actions instead — the same netlist truth the workbench
  // shows. Checking wires here doesn't write wirechecks storage; hands-free
  // is a speech layer, the workbench stays the source of record.
  const actions = useMemo(() => {
    if (!step) return [];
    const micro = step.compiled?.microSteps ?? [];
    if (micro.length > 0) {
      const wireActions: StepAction[] = micro.map((m, i) => ({ n: i + 1, text: m.action }));
      return wireActions;
    }
    return resolveActions(step);
  }, [step]);
  const [checked, setChecked] = useState<Set<number>>(() =>
    step ? loadActionChecks(plan.id, step.stepNumber) : new Set()
  );
  const speechOn = isSpeechAvailable();

  useEffect(() => {
    if (step) setChecked(loadActionChecks(plan.id, step.stepNumber));
  }, [plan.id, step]);

  const currentIdx = useMemo(() => {
    const firstUnchecked = actions.findIndex((a) => !checked.has(a.n));
    return firstUnchecked === -1 ? Math.max(0, actions.length - 1) : firstUnchecked;
  }, [actions, checked]);
  const current = actions[currentIdx];
  const allDone = actions.length > 0 && actions.every((a) => checked.has(a.n));

  const line = current
    ? `Step ${stepIndex + 1}. ${current.text}`
    : step
      ? `Step ${stepIndex + 1}. ${step.title}`
      : "";

  // Read the current action aloud; re-announce when the tab returns to the
  // foreground (background tabs pause speech — V6).
  const lineRef = useRef(line);
  lineRef.current = line;
  useEffect(() => {
    const cancel = speakLine(line);
    const onVisible = () => {
      if (document.visibilityState === "visible") speakLine(lineRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [line]);

  // Esc closes; unmount stops speech.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopSpeech();
    };
  }, [onClose]);

  const advance = useCallback(() => {
    if (!step) return;
    if (current) {
      const next = new Set(checked);
      next.add(current.n);
      setChecked(next);
      saveActionChecks(plan.id, step.stepNumber, next);
      const nowAllDone = actions.every((a) => next.has(a.n));
      if (nowAllDone) {
        if (!completed.has(step.stepNumber)) {
          diagLog("step_complete", `step ${step.stepNumber} completed hands-free`);
          onToggleComplete(step.stepNumber);
        }
        if (stepIndex < steps.length - 1) onGoStep(stepIndex + 1);
        return;
      }
      return; // next unchecked action recomputes via currentIdx
    }
    // Step without actions: complete + advance.
    if (!completed.has(step.stepNumber)) onToggleComplete(step.stepNumber);
    if (stepIndex < steps.length - 1) onGoStep(stepIndex + 1);
  }, [step, current, checked, actions, completed, plan.id, stepIndex, steps.length, onGoStep, onToggleComplete]);

  const back = useCallback(() => {
    if (currentIdx > 0 && current) {
      // Uncheck the previous action to step backwards within the step —
      // this never un-completes the STEP itself (F4).
      const prev = actions[currentIdx - 1];
      const next = new Set(checked);
      next.delete(prev.n);
      setChecked(next);
      if (step) saveActionChecks(plan.id, step.stepNumber, next);
      return;
    }
    if (stepIndex > 0) onGoStep(stepIndex - 1);
  }, [currentIdx, current, actions, checked, step, plan.id, stepIndex, onGoStep]);

  const isLastEverything =
    stepIndex === steps.length - 1 && (allDone || actions.length === 0);

  return (
    <div className="fixed inset-0 z-[70] bg-[#171c26] text-[#eef4f8] flex flex-col p-6 sm:p-10">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 font-semibold">
          Step {stepIndex + 1} of {steps.length}
          {actions.length > 0 && ` · Action ${Math.min(currentIdx + 1, actions.length)} of ${actions.length}`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-w-11 min-h-11 px-3 rounded-lg bg-white/10 border border-white/15 text-sm cursor-pointer"
        >
          Exit
        </button>
      </div>

      <div className="flex-1 flex items-center min-h-0 py-6">
        <p className="text-[clamp(1.5rem,4.5vw,2.4rem)] leading-snug font-bold max-w-3xl">
          {isLastEverything ? (
            <>🎉 That was the last step. Your build is done.</>
          ) : (
            (current?.text ?? step?.title ?? "")
          )}
        </p>
      </div>

      {current?.caution && !isLastEverything && (
        <p className="text-sm text-amber-300/90 mb-4">⚠ {current.caution}</p>
      )}

      <p className="text-xs text-white/35 mb-4">
        {speechOn
          ? "Reading aloud — advancing reads the next action."
          : "Speech isn't available in this browser — large-type mode."}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={back}
          className="h-[72px] rounded-2xl bg-white/10 text-white/75 text-lg font-bold cursor-pointer border border-white/10"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={isLastEverything ? onClose : advance}
          className="h-[72px] rounded-2xl bg-accent text-white text-lg font-bold cursor-pointer"
        >
          {isLastEverything ? "Finish" : "Done — next"}
        </button>
      </div>
    </div>
  );
}
