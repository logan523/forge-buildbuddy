"use client";

/**
 * Wire Lab — premium one-wire soldering surface.
 *
 * Replaces the old cluttered workbench. Design language:
 * - Dark console (tool, not brochure)
 * - Pad map is the hero (IBOM / Fritzing)
 * - AR camera is a first-class primary action (SanderGi lock path)
 * - One wire, huge type, 44px targets, no nested junk cards
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { BuildPlan, BuildStep, MicroStep } from "@/lib/types";
import { loadWireChecks, saveWireChecks } from "@/lib/storage";
import {
  itemForPart,
  loadBenchInventory,
  type BenchInventory,
} from "@/lib/part-scan";
import { PremiumPadMap } from "./premium-pad-map";
import { LiveSolderCamera } from "./part-scan/live-solder-camera";
import type { GuidedActionState } from "./guided-steps";

export function SolderWorkbench({
  step,
  plan,
  planId,
  stepCompleted = false,
  onAutoComplete,
  onActiveWire,
  onGuidedState,
  inventory: inventoryProp,
  onOpenPartScan,
}: {
  step: BuildStep;
  plan: BuildPlan;
  planId: string;
  stepCompleted?: boolean;
  onAutoComplete?: () => void;
  onActiveWire?: (m: MicroStep | null) => void;
  onGuidedState?: (s: GuidedActionState | null) => void;
  inventory?: BenchInventory;
  onOpenPartScan?: () => void;
}) {
  const micro = step.compiled?.microSteps ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [localInv, setLocalInv] = useState(() => loadBenchInventory(planId));
  const autoFired = useRef(false);
  const liveId = useId();
  const inv = inventoryProp ?? localInv;

  useEffect(() => {
    if (!inventoryProp) setLocalInv(loadBenchInventory(planId));
  }, [planId, inventoryProp]);

  useEffect(() => {
    const c = loadWireChecks(planId, step.stepNumber);
    setChecked(c);
    autoFired.current = false;
    const firstUnchecked = micro.findIndex((m) => !c.has(m.id));
    setCurrent(firstUnchecked >= 0 ? firstUnchecked : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, step.stepNumber]);

  const cur = micro[current];

  const toggle = useCallback(
    (m: MicroStep) => {
      const next = new Set(checked);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      setChecked(next);
      saveWireChecks(planId, step.stepNumber, next);
      if (next.has(m.id)) {
        const nextUnchecked = micro.findIndex((x, i) => i > current && !next.has(x.id));
        if (nextUnchecked >= 0) setCurrent(nextUnchecked);
      }
      if (next.size === micro.length && !autoFired.current && !stepCompleted) {
        autoFired.current = true;
        onAutoComplete?.();
      }
    },
    [checked, current, micro, onAutoComplete, planId, step.stepNumber, stepCompleted]
  );

  useEffect(() => {
    onActiveWire?.(cur ?? null);
    return () => onActiveWire?.(null);
  }, [cur, onActiveWire]);

  useEffect(() => {
    if (!cur) {
      onGuidedState?.(null);
      return;
    }
    const isDoneNow = checked.has(cur.id);
    onGuidedState?.({
      label: isDoneNow ? "Done — undo" : "I soldered this wire",
      done: isDoneNow,
      onToggle: () => toggle(cur),
    });
    return () => onGuidedState?.(null);
  }, [cur, checked, onGuidedState, toggle]);

  const doneCount = useMemo(
    () => micro.filter((m) => checked.has(m.id)).length,
    [micro, checked]
  );

  if (!micro.length || !cur) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-console-text-muted bg-console-bg">
        No pad-level wires compiled for this step.
      </div>
    );
  }

  const isDone = checked.has(cur.id);
  const liveText = `Wire ${current + 1} of ${micro.length}: solder ${cur.colorName} from ${cur.fromLabel} pin ${cur.fromPin} to ${cur.toLabel} pin ${cur.toPin}${isDone ? ", marked done" : ""}`;
  const fromScan = itemForPart(inv, cur.fromPartId);
  const toScan = itemForPart(inv, cur.toPartId);
  const pct = Math.round((doneCount / micro.length) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-console-bg text-console-text">
      {liveOpen && (
        <LiveSolderCamera
          micro={cur}
          fromItem={fromScan}
          toItem={toScan}
          isDone={isDone}
          onClose={() => setLiveOpen(false)}
          onMarkDone={() => toggle(cur)}
        />
      )}
      <p id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {liveText}
      </p>

      {/* Top command bar */}
      <header className="shrink-0 border-b border-console-border bg-console-surface px-3 sm:px-5 py-3">
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <span
                className="shrink-0 mt-1 w-10 h-10 rounded-full border-2 border-white/20 shadow-console"
                style={{ background: cur.colorHex }}
                title={`${cur.colorName} wire`}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-console-accent">
                  Wire lab · {current + 1} / {micro.length}
                  <span className="text-console-text-muted font-semibold normal-case tracking-normal ml-2">
                    {doneCount} done · {pct}%
                  </span>
                </p>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-console-text leading-tight">
                  <span className="font-mono text-console-accent">{cur.fromPin}</span>
                  <span className="text-console-text-muted mx-2 font-sans text-lg">→</span>
                  <span className="font-mono text-console-accent">{cur.toPin}</span>
                </h2>
                <p className="text-sm text-console-text-muted truncate mt-0.5">
                  <span className="text-console-text font-medium">{cur.colorName}</span>
                  {" wire · "}
                  {cur.fromLabel}
                  <span className="mx-1 opacity-50">→</span>
                  {cur.toLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setLiveOpen(true)}
                className="min-h-12 px-4 rounded-xl bg-console-accent text-[#0b0e13] text-sm font-bold cursor-pointer hover:brightness-110 active:scale-[0.98] transition"
              >
                AR guide
              </button>
              <button
                type="button"
                onClick={() => toggle(cur)}
                aria-pressed={isDone}
                className={`min-h-12 px-4 rounded-xl text-sm font-bold cursor-pointer border transition active:scale-[0.98] ${
                  isDone
                    ? "bg-success border-success text-white"
                    : "bg-console-surface-raised border-console-border text-console-text hover:border-console-accent"
                }`}
              >
                {isDone ? "Done ✓" : "Mark soldered"}
              </button>
            </div>
          </div>

          {/* Progress rail */}
          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={micro.length}
              aria-label="Wires completed"
            >
              <div
                className="h-full rounded-full bg-console-accent transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="text-xs font-semibold text-console-text-muted hover:text-console-text min-h-10 px-2 cursor-pointer"
              aria-expanded={railOpen}
            >
              {railOpen ? "Hide list" : "All wires"}
            </button>
          </div>

          {railOpen && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {micro.map((m, i) => {
                const done = checked.has(m.id);
                const active = i === current;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={active ? "true" : undefined}
                    className={`shrink-0 min-h-11 px-3 rounded-lg border text-left cursor-pointer transition ${
                      active
                        ? "border-console-accent bg-console-accent/15 ring-1 ring-console-accent/40"
                        : done
                          ? "border-success/40 bg-success/10"
                          : "border-console-border bg-console-surface-raised hover:border-white/25"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/20"
                        style={{ background: m.colorHex }}
                        aria-hidden
                      />
                      <span className="font-mono text-xs font-bold text-console-text">
                        {m.fromPin}→{m.toPin}
                      </span>
                      {done && <span className="text-[10px] font-bold text-success">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Hero pad map */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4">
          <PremiumPadMap micro={cur} />

          {/* Verify strip — single row, no accordion spam */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl border border-console-border bg-console-surface px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">
                After solder
              </p>
              <p className="text-sm text-console-text mt-1 leading-snug">
                {cur.verify?.tug || "Tug both ends gently — joint should hold"}
              </p>
            </div>
            <div className="rounded-xl border border-console-border bg-console-surface px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">
                Continuity
              </p>
              <p className="text-sm text-console-text mt-1 leading-snug">
                {cur.verify?.continuity || "Multimeter beep pad-to-pad if unsure"}
              </p>
            </div>
            <div className="rounded-xl border border-console-border bg-console-surface px-4 py-3 flex flex-col justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">
                  Your modules
                </p>
                <p className="text-sm text-console-text mt-1">
                  {fromScan || toScan
                    ? `${fromScan ? "A scanned" : "A not scanned"} · ${toScan ? "B scanned" : "B not scanned"}`
                    : "Scan once — AR locks to your board"}
                </p>
              </div>
              {onOpenPartScan && (
                <button
                  type="button"
                  onClick={onOpenPartScan}
                  className="min-h-10 text-sm font-semibold text-console-accent cursor-pointer text-left hover:underline"
                >
                  {inv.items.length ? `Bench scan (${inv.items.length})` : "Scan parts for AR"}
                </button>
              )}
            </div>
          </div>

          {/* Prev / next wire */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-6">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setCurrent((i) => Math.max(0, i - 1))}
              className="min-h-12 min-w-12 px-4 rounded-xl border border-console-border text-sm font-semibold text-console-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:border-white/25"
            >
              ← Prev wire
            </button>
            <p className="text-xs text-console-text-muted text-center hidden sm:block max-w-xs">
              Find the glowing pad on each board. AR guide overlays the same pins on camera.
            </p>
            <button
              type="button"
              disabled={current >= micro.length - 1}
              onClick={() => setCurrent((i) => Math.min(micro.length - 1, i + 1))}
              className="min-h-12 min-w-12 px-4 rounded-xl border border-console-border text-sm font-semibold text-console-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:border-white/25"
            >
              Next wire →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
