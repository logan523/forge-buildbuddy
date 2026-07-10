"use client";

/**
 * Isolation Walk — the dead-board detective, as a finite Yes/No game. Every
 * path ends with a certain answer, which for a beginner sure they bricked an
 * $8 board is the biggest confidence restorer there is.
 */

import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { buildIsolationWalk, isolationCulprit } from "@/lib/isolation-walk";

export function IsolationWalkPanel({ plan }: { plan: BuildPlan }) {
  const walk = useMemo(() => buildIsolationWalk(plan.parts), [plan.parts]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(-1); // -1 = brain-alone Blink test; 0.. = adding each part
  const [verdict, setVerdict] = useState<string | null>(null);

  if (!walk) return null;

  const reset = () => {
    setStarted(false);
    setIndex(-1);
    setVerdict(null);
  };

  const answer = (works: boolean) => {
    if (index === -1) {
      if (!works) {
        setVerdict(
          `Then the trouble is the ${walk.brainLabel} itself or its power — reflow its pins, try a different USB cable and port, and re-upload Blink. Nothing else is to blame yet.`
        );
      } else if (walk.addOrder.length === 0) {
        setVerdict(`The ${walk.brainLabel} is healthy and it's the only active part — the issue is in your code. Head to the code steps.`);
      } else {
        setIndex(0);
      }
      return;
    }
    if (!works) {
      setVerdict(
        `Found it. It broke the moment you added the ${isolationCulprit(walk, index)}. That part — or the wiring to it — is the culprit. Recheck its connections against the wiring step, or swap the part.`
      );
    } else if (index >= walk.addOrder.length - 1) {
      setVerdict(
        `Everything works with all parts connected. The fault is intermittent (a loose wire) or in your code — wiggle each wire gently, then try the code steps.`
      );
    } else {
      setIndex(index + 1);
    }
  };

  const prompt =
    index === -1
      ? `Unplug everything except the ${walk.brainLabel}. Upload Blink (it's in the code package). Does the little light blink?`
      : `Good. Now reconnect the ${walk.addOrder[index]} and power up again. Is it still working?`;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3">
      {!started ? (
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="w-full text-left cursor-pointer"
        >
          <p className="text-sm font-medium text-text flex items-center gap-2">
            <span aria-hidden>🔎</span> Board completely dead? Run the detective
          </p>
          <p className="text-xs text-text-muted mt-1 ml-6">
            A few Yes/No questions that always end by naming the exact culprit.
          </p>
        </button>
      ) : verdict ? (
        <div className="space-y-2">
          <p className="text-sm text-text leading-relaxed">{verdict}</p>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-accent underline cursor-pointer min-h-[24px]"
          >
            Start over
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            {index === -1 ? "Test the brain alone" : `Reconnecting part ${index + 1} of ${walk.addOrder.length}`}
          </p>
          <p className="text-sm text-text leading-relaxed">{prompt}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => answer(true)}
              className="flex-1 min-h-11 rounded-xl bg-success-soft text-success border border-success/30 text-sm font-medium cursor-pointer"
            >
              Yes, it works
            </button>
            <button
              type="button"
              onClick={() => answer(false)}
              className="flex-1 min-h-11 rounded-xl bg-warning-soft text-warning border border-warning/30 text-sm font-medium cursor-pointer"
            >
              No / it died
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
