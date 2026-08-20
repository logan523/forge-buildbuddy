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
import type { GuidedActionState } from "./guided-action";
import { svgCircuitDiagram } from "@/lib/step-media/circuit-diagram";
import { WireAndPartsIdentity } from "./part-identity-card";
import { WireDoubleCheck } from "./wire-double-check";
import { PhotoCheck } from "./photo-check";
import { diagnose, filterDiagnosesByReality, type SymptomId } from "@/lib/unstick";
import { encouragement } from "@/lib/steps/buddy";
import { recordStruggle, preemptiveRock, frictionCount, type Rock } from "@/lib/steps/friction";
import { WIRE_NAME_HEX } from "@/lib/wire-colors";
import {
  clearColor,
  colorForConnection,
  commitReality,
  declareColor,
  readReality,
  subscribeReality,
} from "@/lib/build-reality";
import { useSyncExternalStore } from "react";
import { BreadboardPanel } from "./breadboard-panel";
import { PrePowerGateCard, isPowerOnStep } from "./pre-power-gate";

/** The 12 buyable-jumper-kit swatches — capture is always swatch + optional free label (design voice 5.2). */
const SWATCHES: { name: string; hex: string }[] = Object.entries(WIRE_NAME_HEX)
  .filter(([name]) => name !== "gray")
  .map(([name, hex]) => ({ name, hex }));

/**
 * "GND is brown" gets a home (Slice 2, R2). Declaring commits immediately
 * with a visible undo — first-person facts about the builder's own hands are
 * never gated behind a confirm card (tiered writes, audit row 9). The
 * recompile that re-keys prose/sheets/3D is triggered by the reality
 * revision upstream in BuildSession.
 */
function WireColorDeclaration({ planId, micro }: { planId: string; micro: MicroStep }) {
  const reality = useSyncExternalStore(subscribeReality, () => readReality(planId), () => undefined);
  const [labelText, setLabelText] = useState("");
  const [wholeNet, setWholeNet] = useState(true);
  const declared = colorForConnection(reality, micro.id, micro.netName);
  if (reality === undefined) return null; // not hydrated — never paint then repaint colors

  const apply = (swatch: { name: string; hex: string }) => {
    const label = labelText.trim() || undefined;
    commitReality(
      declareColor(reality, {
        hex: swatch.hex,
        name: swatch.name,
        label,
        connectionId: micro.id,
        ...(wholeNet ? { netName: micro.netName } : {}),
      })
    );
  };
  const undo = () => {
    commitReality(clearColor(reality, { connectionId: micro.id, netName: wholeNet ? micro.netName : undefined }));
  };

  return (
    <details className="group rounded-xl border border-console-border bg-console-surface px-4 py-2">
      <summary className="text-sm font-semibold text-console-accent cursor-pointer min-h-11 flex items-center gap-2">
        My wire is a different color
        {declared && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-console-text normal-case">
            <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: declared.hex }} aria-hidden />
            yours: {declared.label ?? declared.name}
          </span>
        )}
      </summary>
      <div className="mt-2 pb-2 space-y-3">
        <p className="text-xs text-console-text-muted">
          Your color is a fact, not a mistake — tell me what you actually used and every
          instruction, sheet, and diagram re-keys to it.
        </p>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((sw) => (
            <button
              key={sw.name}
              type="button"
              onClick={() => apply(sw)}
              title={sw.name}
              aria-label={`my wire is ${sw.name}`}
              className={`w-11 h-11 rounded-full border-2 cursor-pointer transition active:scale-95 ${
                declared?.hex === sw.hex ? "border-console-accent ring-2 ring-console-accent/40" : "border-white/20 hover:border-white/50"
              }`}
              style={{ background: sw.hex }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder={'your words, e.g. "the short orange one"'}
            autoCapitalize="off"
            className="flex-1 min-w-[200px] min-h-11 px-3 rounded-lg bg-console-surface-raised border border-console-border text-sm text-console-text placeholder:text-console-text-muted/60"
          />
          <label className="flex items-center gap-2 text-xs text-console-text-muted cursor-pointer min-h-11">
            <input type="checkbox" checked={wholeNet} onChange={(e) => setWholeNet(e.target.checked)} />
            all {micro.netName} wires
          </label>
          {declared && (
            <button type="button" onClick={undo} className="text-xs font-semibold text-warning cursor-pointer min-h-11 px-2 hover:underline">
              Undo — back to standard
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

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
  askSlot,
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
  /** Ask-AI (or any helper) rendered inside the scroll area — wired by BuildScreen so step skills stay up there. */
  askSlot?: React.ReactNode;
}) {
  const micro = step.compiled?.microSteps ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [rescueOpens, setRescueOpens] = useState(0);
  const [preempt, setPreempt] = useState<{ rock: Rock; count: number } | null>(null);
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

  // Teaching layer (lifted from GuidedSteps when the dead branch dissolved,
  // Slice 1): friction pre-empt once per step, struggle recording, per-wire
  // rescue, and the buddy line.
  const stepNetClasses = useMemo(
    () => Array.from(new Set(micro.map((m) => m.netClass))),
    [micro]
  );
  useEffect(() => {
    setPreempt(preemptiveRock({ kind: "wiring", netClasses: stepNetClasses }, frictionCount));
  }, [stepNetClasses]);
  useEffect(() => {
    setRescueOpens(0);
  }, [current]);
  // Opening the rescue a second time on one wire = struggling → record it, so
  // the NEXT build pre-empts this rock before the builder hits it.
  useEffect(() => {
    if (rescueOpens === 2) recordStruggle({ kind: "wiring", netClasses: stepNetClasses });
  }, [rescueOpens, stepNetClasses]);
  const workbenchReality = useSyncExternalStore(subscribeReality, () => readReality(planId), () => undefined);
  const rescue = useMemo(() => {
    if (!cur?.rescueSymptomId) return null;
    // V2: causes the builder's own evidence already eliminated don't get
    // re-suggested — the codified "the sensor answered, so those exact
    // wires are proven good."
    const ds = filterDiagnosesByReality(diagnose(plan, cur.rescueSymptomId as SymptomId, step), workbenchReality);
    return ds[0] ?? null;
  }, [plan, cur, step, planId, workbenchReality]);

  // Cropped wiring sheet: just the two modules this wire joins, drawn large
  // with pin names on both ends — the ONE picture a beginner needs at the
  // iron. Native-pixel output (never squished into the container; it scrolls
  // instead), same netlist truth as the pad map. Current wire glows,
  // soldered wires stay solid, pending stay faint.
  const circuitSvg = useMemo(
    () =>
      cur
        ? svgCircuitDiagram(plan, {
            crop: true,
            focusPartIds: [cur.fromPartId, cur.toPartId].filter(
              (x): x is string => !!x
            ),
            highlightWireIds: [cur.id],
            doneWireIds: Array.from(checked),
          })
        : "",
    [plan, cur, checked]
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
  // D7: dual-encoded progress — filled = made (asserted), bright = PROVEN
  // by the board itself (instrument evidence in reality).
  const provenCount = micro.filter((m) => workbenchReality?.joints[m.id]?.state === "verified").length;
  const buddyLine = encouragement({
    current,
    total: micro.length,
    doneCount,
    netClass: cur.netClass,
    struggling: rescueOpens > 1,
  });
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
                    {doneCount} done{provenCount > 0 ? ` · ${provenCount} proven live` : ""} · {pct}%
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
              <div className="h-full rounded-full bg-console-accent/50 transition-all duration-300 relative" style={{ width: `${pct}%` }}>
                {/* bright inner segment = proven-by-the-board (instrument tier) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-console-accent transition-all duration-300"
                  style={{ width: micro.length ? `${Math.round((provenCount / Math.max(doneCount, 1)) * 100)}%` : "0%" }}
                />
              </div>
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
          {/* Cropped wiring sheet on paper — the two modules this wire joins,
              drawn large with pin names on both ends. The glowing wire is the
              one to solder; done wires stay solid, the rest stay faint. */}
          {isPowerOnStep(step.title) && <PrePowerGateCard plan={plan} />}

          <BreadboardPanel planId={planId} micro={cur} />

          {workbenchReality?.formFactor === "breadboard" ? (
            /* D8: one hero visual per formFactor — in breadboard mode the
               board sheet above is the hero; the circuit sheet + pad map
               demote to on-demand so three pictures of one wire never
               compete. */
            <details className="group rounded-xl border border-console-border bg-console-surface px-4 py-2">
              <summary className="text-sm font-semibold text-console-accent cursor-pointer min-h-11 flex items-center">
                See the circuit sheet &amp; solder pads
              </summary>
              <div className="mt-2 pb-2 space-y-4">
                <div
                  className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-x-auto [&_svg]:block [&_svg]:mx-auto"
                  dangerouslySetInnerHTML={{ __html: circuitSvg }}
                />
                <PremiumPadMap micro={cur} />
              </div>
            </details>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted mb-2 px-0.5">
                  This connection — the glowing wire is the one you're soldering
                </p>
                <div
                  className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-x-auto [&_svg]:block [&_svg]:mx-auto"
                  dangerouslySetInnerHTML={{ __html: circuitSvg }}
                />
              </div>

              <PremiumPadMap micro={cur} />
            </>
          )}

          {/* Pre-empted rock — the mistake THIS builder has already made twice */}
          {preempt && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-warning">
                Heads up — this one has bitten you before
              </p>
              <p className="text-sm text-console-text mt-1 leading-snug">{preempt.rock.callout}</p>
            </div>
          )}

          {buddyLine && (
            <p className="text-sm text-console-text-muted italic px-0.5" data-testid="buddy-line">
              {buddyLine}
            </p>
          )}

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

          <WireColorDeclaration planId={planId} micro={cur} />

          {/* "Is this the part I'm holding?" — wire + both parts + 1:1 size card */}
          <details className="group rounded-xl border border-console-border bg-console-surface px-4 py-2">
            <summary className="text-sm font-semibold text-console-accent cursor-pointer min-h-11 flex items-center">
              What am I connecting? See both parts
            </summary>
            <div className="mt-2 pb-2 rounded-lg bg-surface p-2">
              <WireAndPartsIdentity micro={cur} plan={plan} />
            </div>
          </details>

          {/* Reverse-check: "I put the [color] wire on pin [X]" → netlist verdict */}
          {step.compiled && (
            <div className="rounded-xl border border-console-border bg-console-surface px-4 py-2 [&_summary]:text-console-accent [&_summary]:min-h-11">
              <WireDoubleCheck compiled={step.compiled} />
            </div>
          )}

          {/* "Did I do it right?" photo verdict — renders only when the vision
              eval has passed (see photo-check.tsx's kill-switch). */}
          <PhotoCheck step={step} planId={planId} />

          {/* Inline rescue for THIS wire — stays on-screen, never a drawer swap */}
          {rescue && (
            <details
              className="group rounded-xl border border-warning/30 bg-console-surface px-4 py-2"
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open) setRescueOpens((n) => n + 1);
              }}
            >
              <summary className="text-sm font-semibold text-warning cursor-pointer min-h-11 flex items-center">
                Doesn&apos;t look right?
              </summary>
              <div className="mt-1.5 space-y-1 pb-2">
                <p className="text-sm font-medium text-console-text">{rescue.title}</p>
                <p className="text-sm text-console-text-muted">{rescue.cause}</p>
                {rescue.actions.slice(0, 2).map((a) => (
                  <p key={a.order} className="text-sm text-console-text-muted">
                    <span className="font-medium text-console-text">{a.order}.</span> {a.action}{" "}
                    <span className="opacity-70">→ {a.expect}</span>
                  </p>
                ))}
              </div>
            </details>
          )}

          {/* Connection table — glanceable from → to → color; tap any row to jump */}
          <div className="rounded-xl border border-console-border bg-console-surface overflow-hidden">
            <div className="px-4 py-2 border-b border-console-border flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">
                All connections
              </p>
              <p className="text-[10px] text-console-text-muted">
                {doneCount}/{micro.length} soldered
              </p>
            </div>
            <ul className="divide-y divide-console-border/60">
              {micro.map((m, i) => {
                const mdone = checked.has(m.id);
                const active = i === current;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setCurrent(i)}
                      aria-current={active ? "true" : undefined}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition ${
                        active ? "bg-console-accent/10" : "hover:bg-white/5"
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ background: m.colorHex }}
                        aria-hidden
                      />
                      <span className="text-xs text-console-text min-w-0 flex-1 truncate">
                        {m.fromLabel} <span className="font-mono text-console-accent">{m.fromPin}</span>
                        <span className="text-console-text-muted mx-1.5">→</span>
                        {m.toLabel} <span className="font-mono text-console-accent">{m.toPin}</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${mdone ? "text-success" : "text-console-text-muted"}`}
                      >
                        {mdone ? "✓ done" : `#${i + 1}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {askSlot && <div className="pt-1">{askSlot}</div>}

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
