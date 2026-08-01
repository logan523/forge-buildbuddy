"use client";

/**
 * Guided micro-steps — walks a wiring step's connections ONE WIRE AT A TIME
 * (find → do → verify), the hand-holding mode for total beginners. Each card
 * is derived from a MicroStep (compiler output), so the pins/colors can't
 * drift from the connection truth. "Show all" reveals the full table for people
 * who don't need the hand-holding. Progress keys on the stable wire id.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BuildPlan, BuildStep, MicroStep } from "@/lib/types";
import { GlossaryText, ConnectionsTable } from "@/components/step-facts";
import { WireAndPartsIdentity } from "@/components/build/part-identity-card";
import { WireDoubleCheck } from "@/components/build/wire-double-check";
import { diagnose, type SymptomId } from "@/lib/unstick";
import { encouragement } from "@/lib/steps/buddy";
import { recordStruggle, preemptiveRock, frictionCount, type Rock } from "@/lib/steps/friction";
import {
  loadWireChecks,
  saveWireChecks,
} from "@/lib/storage";
import { PinConnectionDiagram } from "./pin-connection-diagram";

/** The current wire's toggle, shaped for BuildScreen's primary action bar. */
export interface GuidedActionState {
  label: string;
  done: boolean;
  onToggle: () => void;
}

/**
 * A2: mirrors the current wire's toggle onto BuildScreen's primary action
 * bar. InstructionCard sits between GuidedSteps and BuildScreen and has no
 * reason to know about "guided action state" — Context skips it instead of
 * adding a prop InstructionCard would only ever forward untouched.
 * BuildScreen provides the setter around InstructionCard; every other
 * render path (including every existing test below, which mounts
 * GuidedSteps directly with no provider) gets the default `null`, a safe
 * no-op. See also the `onGuidedState` prop — same data, for direct callers.
 */
export const GuidedActionContext = createContext<
  ((state: GuidedActionState | null) => void) | null
>(null);

export function GuidedSteps({
  step,
  plan,
  planId,
  stepCompleted = false,
  onAutoComplete,
  onActiveWire,
  onGuidedState,
}: {
  step: BuildStep;
  plan: BuildPlan;
  planId: string;
  stepCompleted?: boolean;
  onAutoComplete?: () => void;
  /** Slice 3: the parent highlights this wire's pins in the 3D view. */
  onActiveWire?: (m: MicroStep | null) => void;
  /**
   * Slice A2: same pattern as onActiveWire — additive, optional, driven from
   * an effect, null when the guided flow is showing the full table or has
   * no wires at all. Lets a direct parent mirror the current wire's toggle
   * onto its own UI without reaching into GuidedSteps' internals.
   */
  onGuidedState?: (s: GuidedActionState | null) => void;
}) {
  const micro = step.compiled?.microSteps ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [rescueOpens, setRescueOpens] = useState(0);
  const autoFired = useRef(false);
  const setGuidedAction = useContext(GuidedActionContext);

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

  // Moved above the `if (!micro.length) return null` guard (was declared
  // further down, after the guard) so the A2 mirror effect below — which
  // must run unconditionally, before any early return, same as every hook —
  // can reference it. Depends only on state/props already available here.
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

  // Reset the "struggling" signal whenever the builder moves to a new wire.
  useEffect(() => setRescueOpens(0), [current]);

  // The Rock: net classes in this step, and the pre-empt callout if this builder
  // has tripped on a matching rock before (computed post-mount to avoid a
  // hydration mismatch — the ledger is client-only localStorage).
  const stepNetClasses = useMemo(
    () => [...new Set((step.compiled?.connections ?? []).map((c) => c.netClass))],
    [step.compiled]
  );
  const [preempt, setPreempt] = useState<{ rock: Rock; count: number } | null>(null);
  useEffect(() => {
    setPreempt(preemptiveRock({ kind: "wiring", netClasses: stepNetClasses }, frictionCount));
  }, [stepNetClasses, step.stepNumber]);
  // Opening the rescue a second time on one wire = struggling → record it, so the
  // callout is there next time this kind of step comes up.
  useEffect(() => {
    if (rescueOpens === 2) recordStruggle({ kind: "wiring", netClasses: stepNetClasses });
  }, [rescueOpens, stepNetClasses]);

  useEffect(() => {
    onActiveWire?.(showAll ? null : cur ?? null);
    return () => onActiveWire?.(null);
  }, [cur, showAll, onActiveWire]);

  // A2: mirror the current wire's own toggle onto BuildScreen's primary
  // action bar — two sinks, the explicit prop (direct callers/tests) and
  // GuidedActionContext (the production path from BuildScreen). done+label
  // track checked state, not just which wire is current, so re-visiting an
  // already-soldered wire (progress dots, Previous wire) mirrors correctly.
  useEffect(() => {
    let state: GuidedActionState | null = null;
    if (!showAll && cur) {
      const wire = cur;
      const isDoneNow = checked.has(wire.id);
      state = {
        label: isDoneNow ? "✓ Done — tap to undo" : "I soldered this wire ✓",
        done: isDoneNow,
        onToggle: () => toggle(wire),
      };
    }
    onGuidedState?.(state);
    setGuidedAction?.(state);
    return () => {
      onGuidedState?.(null);
      setGuidedAction?.(null);
    };
    // toggle is intentionally omitted: it's a fresh closure every render that
    // already closes over the latest `checked`/`current`, both of which ARE
    // in the deps below (same shape as the exhaustive-deps opt-out above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, showAll, checked, onGuidedState, setGuidedAction]);

  const rescue = useMemo(() => {
    if (!cur?.rescueSymptomId) return null;
    return diagnose(plan, cur.rescueSymptomId as SymptomId, step)[0] ?? null;
  }, [cur, plan, step]);

  if (!micro.length) return null;

  const doneCount = micro.filter((m) => checked.has(m.id)).length;
  const buddyLine = encouragement({
    current,
    total: micro.length,
    doneCount,
    netClass: cur.netClass,
    struggling: rescueOpens > 1,
  });

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
      {/* Progress + wire picker FIRST — drives the Stage pad map immediately */}
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
          Show all {micro.length} wires
        </button>
      </div>
      <div className="flex gap-1">
        {micro.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Wire ${i + 1}: ${m.fromPin} to ${m.toPin}`}
            title={`${m.fromPin} → ${m.toPin}`}
            onClick={() => setCurrent(i)}
            className="flex-1 min-w-11 min-h-11 flex items-center justify-center cursor-pointer"
          >
            <span
              aria-hidden
              className={`h-2 w-full rounded-full ${
                checked.has(m.id) ? "bg-success" : i === current ? "bg-accent" : "bg-border"
              }`}
              style={i === current && !checked.has(m.id) ? { background: m.colorHex } : undefined}
            />
          </button>
        ))}
      </div>

      {/* Compact pin callout — Stage shows the big SVG; this is the always-visible text truth */}
      <div className="p-3 rounded-xl border-2 border-accent/30 bg-accent/5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">
          Solder this wire
        </p>
        <p className="text-base font-bold text-text leading-snug">
          <span className="font-mono text-accent">{cur.fromPin}</span>
          <span className="text-text-muted mx-1.5">→</span>
          <span className="font-mono text-accent">{cur.toPin}</span>
        </p>
        <p className="text-xs text-text-secondary mt-1">
          {cur.fromLabel} · {cur.toLabel} ·{" "}
          <span className="font-semibold" style={{ color: cur.colorHex }}>
            {cur.colorName} wire
          </span>
        </p>
      </div>

      {/* Desktop: diagram already in Stage. Mobile sticky is in BuildScreen.
          Keep one compact map in the flow for "show all" path consistency. */}
      <div className="hidden sm:block lg:hidden">
        <PinConnectionDiagram micro={cur} />
      </div>

      {preempt && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2">
          <span aria-hidden className="mt-0.5">⚑</span>
          <p className="text-xs text-text leading-relaxed">
            <span className="font-semibold">Heads up — you hit this last time.</span>{" "}
            {preempt.rock.callout}
          </p>
        </div>
      )}

      {buddyLine && (
        <p
          className="flex items-start gap-2 text-xs text-text-secondary bg-accent/5 border border-accent/15 rounded-xl px-3 py-2"
          role="status"
        >
          <span aria-hidden>💬</span>
          <span>{buddyLine}</span>
        </p>
      )}

      <details className="group">
        <summary className="text-xs font-medium text-accent cursor-pointer py-2 min-h-11">
          Soldering technique (optional)
        </summary>
        <div className="mt-1 p-3 rounded-xl border border-accent/25 bg-accent/5 space-y-1.5">
          {step.toolTechnique ? (
            <>
              <p className="text-xs font-semibold text-text">{step.toolTechnique.tool}</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {step.toolTechnique.usage}
              </p>
              {step.toolTechnique.safety && (
                <p className="text-xs text-warning">⚠ {step.toolTechnique.safety}</p>
              )}
            </>
          ) : (
            <ol className="text-xs text-text-secondary leading-relaxed space-y-1 list-decimal list-inside">
              <li>Heat both surfaces for 2–3 seconds before adding solder.</li>
              <li>Feed solder to the joint, not the iron.</li>
              <li>Remove the solder first, then the iron.</li>
              <li>Let it cool undisturbed.</li>
            </ol>
          )}
        </div>
      </details>

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
          <span className="font-semibold text-text">Find it on the real boards: </span>
          the letters <span className="font-mono font-semibold text-text">{cur.fromPin}</span> printed on{" "}
          {cur.fromLabel}, and <span className="font-mono font-semibold text-text">{cur.toPin}</span> on{" "}
          {cur.toLabel}.{" "}
          <span className="text-text-muted">
            Match the printed text — ignore left/right order (clones reverse it).
          </span>
        </div>

        {/* "Is this the part I'm holding?" — wire + both parts, on demand */}
        <details className="group">
          <summary className="text-xs font-medium text-accent cursor-pointer py-1 min-h-11">
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
          <details
            className="group"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) setRescueOpens((n) => n + 1);
            }}
          >
            <summary className="text-xs font-medium text-warning cursor-pointer py-1">
              Doesn&apos;t look right?
            </summary>
            <div className="mt-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 p-2 space-y-1">
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
