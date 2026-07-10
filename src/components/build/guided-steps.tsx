"use client";

/**
 * Guided micro-steps — walks a wiring step's connections ONE WIRE AT A TIME
 * (find → do → verify), the hand-holding mode for total beginners. Each card
 * is derived from a MicroStep (compiler output), so the pins/colors can't
 * drift from the connection truth. "Show all" reveals the full table for people
 * who don't need the hand-holding. Progress keys on the stable wire id.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildPlan, BuildStep, MicroStep } from "@/lib/types";
import { GlossaryText, ConnectionsTable } from "@/components/step-facts";
import { WireAndPartsIdentity } from "@/components/build/part-identity-card";
import { WireDoubleCheck } from "@/components/build/wire-double-check";
import { diagnose, type SymptomId } from "@/lib/unstick";
import { loadWireChecks, saveWireChecks } from "@/lib/storage";

export function GuidedSteps({
  step,
  plan,
  planId,
  stepCompleted = false,
  onAutoComplete,
  onActiveWire,
}: {
  step: BuildStep;
  plan: BuildPlan;
  planId: string;
  stepCompleted?: boolean;
  onAutoComplete?: () => void;
  /** Slice 3: the parent highlights this wire's pins in the 3D view. */
  onActiveWire?: (m: MicroStep | null) => void;
}) {
  const micro = step.compiled?.microSteps ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const autoFired = useRef(false);

  useEffect(() => {
    const c = loadWireChecks(planId, step.stepNumber);
    setChecked(c);
    autoFired.current = false;
    const firstUnchecked = micro.findIndex((m) => !c.has(m.id));
    setCurrent(firstUnchecked >= 0 ? firstUnchecked : 0);
    setShowAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, step.stepNumber]);

  const cur = micro[current];

  useEffect(() => {
    onActiveWire?.(showAll ? null : cur ?? null);
    return () => onActiveWire?.(null);
  }, [cur, showAll, onActiveWire]);

  const rescue = useMemo(() => {
    if (!cur?.rescueSymptomId) return null;
    return diagnose(plan, cur.rescueSymptomId as SymptomId, step)[0] ?? null;
  }, [cur, plan, step]);

  if (!micro.length) return null;

  const doneCount = micro.filter((m) => checked.has(m.id)).length;

  const toggle = (m: MicroStep) => {
    const next = new Set(checked);
    if (next.has(m.id)) next.delete(m.id);
    else next.add(m.id);
    setChecked(next);
    saveWireChecks(planId, step.stepNumber, next);
    if (next.has(m.id)) {
      const nextUnchecked = micro.findIndex((x, i) => i > current && !next.has(x.id));
      if (nextUnchecked >= 0) setCurrent(nextUnchecked);
    }
    // F4: completing the last wire auto-completes the step; unchecking never un-completes.
    if (next.size === micro.length && !autoFired.current && !stepCompleted) {
      autoFired.current = true;
      onAutoComplete?.();
    }
  };

  if (showAll) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-accent underline cursor-pointer"
        >
          ← Back to guided, one wire at a time
        </button>
        {step.compiled && <ConnectionsTable compiled={step.compiled} />}
      </div>
    );
  }

  const isDone = checked.has(cur.id);

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-text-muted">
          Wire {current + 1} of {micro.length}
          {doneCount > 0 && <span className="text-success ml-2">· {doneCount} done</span>}
        </p>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-text-muted underline cursor-pointer hover:text-text-secondary"
        >
          Show all {micro.length}
        </button>
      </div>
      <div className="flex gap-1">
        {micro.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Wire ${i + 1}`}
            onClick={() => setCurrent(i)}
            className={`h-1.5 flex-1 rounded-full ${
              checked.has(m.id) ? "bg-success" : i === current ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* The wire card: find → do → verify */}
      <div className="p-4 rounded-2xl border border-border bg-surface space-y-3">
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 mt-1 w-5 h-5 rounded-full border border-black/10"
            style={{ background: cur.colorHex }}
            aria-hidden
          />
          <GlossaryText text={cur.action} className="text-base font-medium text-text leading-snug block" />
        </div>

        {/* Find it */}
        <div className="text-sm text-text-secondary bg-surface-overlay rounded-xl p-3">
          <span className="font-semibold text-text">Find it: </span>
          the pin printed <span className="font-mono font-semibold text-text">{cur.fromPin}</span> on the{" "}
          {cur.fromLabel}, and <span className="font-mono font-semibold text-text">{cur.toPin}</span> on the{" "}
          {cur.toLabel}. <span className="text-text-muted">Trust the printed label, not the position.</span>
          <span className="mt-1.5 flex items-center gap-1.5 text-xs text-accent">
            <span
              aria-hidden
              className="w-2.5 h-2.5 rounded-full border border-black/10"
              style={{ background: cur.colorHex }}
            />
            This wire is lit up in the 3D — zoomed to where it lands.
          </span>
        </div>

        {/* "Is this the part I'm holding?" — wire + both parts, on demand */}
        <details className="group">
          <summary className="text-xs font-medium text-accent cursor-pointer py-1 min-h-[24px]">
            What am I connecting? See both parts
          </summary>
          <div className="mt-2">
            <WireAndPartsIdentity micro={cur} plan={plan} />
          </div>
        </details>

        {step.compiled && <WireDoubleCheck compiled={step.compiled} />}

        {/* Verify it */}
        <div className="rounded-xl bg-success-soft/50 border border-success/25 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-success uppercase tracking-wider">Make sure it's right</p>
          <p className="text-sm text-text leading-relaxed">{cur.verify.tug}</p>
          <p className="text-sm text-text leading-relaxed">{cur.verify.continuity}</p>
          {cur.verify.voltage && <p className="text-sm text-text leading-relaxed">{cur.verify.voltage}</p>}
        </div>

        {/* Inline rescue */}
        {rescue && (
          <details className="group">
            <summary className="text-xs font-medium text-warning cursor-pointer py-1">
              Doesn&apos;t look right?
            </summary>
            <div className="mt-1.5 pl-2 border-l-2 border-warning/30 space-y-1">
              <p className="text-xs font-medium text-text">{rescue.title}</p>
              <p className="text-xs text-text-secondary">{rescue.cause}</p>
              {rescue.actions.slice(0, 2).map((a) => (
                <p key={a.order} className="text-xs text-text-secondary">
                  <span className="font-medium">{a.order}.</span> {a.action} <span className="text-text-muted">→ {a.expect}</span>
                </p>
              ))}
            </div>
          </details>
        )}

        {/* Done checkbox */}
        <button
          type="button"
          onClick={() => toggle(cur)}
          className={`w-full min-h-11 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
            isDone
              ? "bg-success-soft text-success border border-success/30"
              : "bg-accent text-white hover:bg-accent/90"
          }`}
        >
          {isDone ? "✓ Done — tap to undo" : "I soldered this wire ✓"}
        </button>
      </div>

      {/* Prev / next */}
      <div className="flex justify-between text-xs">
        <button
          type="button"
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          className="text-text-muted disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          ← Previous wire
        </button>
        <button
          type="button"
          disabled={current >= micro.length - 1}
          onClick={() => setCurrent((c) => Math.min(micro.length - 1, c + 1))}
          className="text-text-muted disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          Next wire →
        </button>
      </div>
    </div>
  );
}
