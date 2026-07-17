"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildPlan, BuildStep, Part, MicroStep } from "@/lib/types";
import type { FirmwarePackage } from "@/lib/firmware";
import type { ProductVisual } from "@/lib/product-visual";
import { InstructionCard, TIME_BY_KIND } from "@/components/instruction-card";
import { stepKind, kindLabel } from "@/lib/steps/classify";
import { resolveStepMedia } from "@/lib/step-media";
import { Button, DrawerShell, Icon } from "@/components/ui";
import { CoverageBanner, CoverageDetail } from "./coverage-banner";
import { StepHero } from "./step-hero";
import { StepMediaExtras } from "./step-media-extras";
import { NextBuildDoorway } from "./next-build-doorway";
import { HandsFreeMode } from "./hands-free";
import { AskAboutStep } from "./ask-step";
import { useOverlay } from "./use-overlay";
import { GuidedActionContext, type GuidedActionState } from "./guided-steps";
import { PrimaryActionBar } from "./primary-action-bar";
import { StepListSheet } from "./step-list-sheet";
import type { DetailLevel, DrawerId } from "./use-build-state";

export interface BuildScreenProps {
  plan: BuildPlan;
  steps: BuildStep[];
  step: BuildStep | undefined;
  stepIndex: number;
  pct: number;
  detailLevel: DetailLevel;
  completed: Set<number>;
  firmware: FirmwarePackage | null;
  hasPcb: boolean;
  ercBlocksPcb: boolean;
  onSoftwareStep: boolean;
  shareMsg: string;
  tooltip: string | null;
  activeDrawer: DrawerId | null;
  onHome: () => void;
  onShare: () => void;
  onBuyAll: (parts: Part[]) => void;
  onSetDetailLevel: (level: DetailLevel) => void;
  onOpenPrep: () => void;
  onOpenDrawer: (drawer: DrawerId, fwSketchId?: string | null) => void;
  onCloseDrawer: () => void;
  onToggleComplete: (stepNumber: number) => void;
  onGoStep: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onSetTooltip: (t: string | null) => void;
}

/** Everything a builder doesn't need mid-step folds into one overflow menu. */
function ToolbarOverflow({
  detailLevel,
  onSetDetailLevel,
  hasFirmware,
  hasPcb,
  ercBlocksPcb,
  onOpenPrep,
  onOpenDrawer,
  onShare,
}: {
  detailLevel: DetailLevel;
  onSetDetailLevel: (level: DetailLevel) => void;
  hasFirmware: boolean;
  hasPcb: boolean;
  ercBlocksPcb: boolean;
  onOpenPrep: () => void;
  onOpenDrawer: (drawer: DrawerId, fwSketchId?: string | null) => void;
  onShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 44px floor: these were explicit-but-undersized (36/40px) — same bug class
  // as the trigger button below.
  const item =
    "w-full text-left text-sm px-3 py-2 min-h-11 rounded-lg text-text-secondary hover:bg-surface-overlay cursor-pointer";
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="More options"
        className={`text-sm px-2.5 py-1.5 min-h-11 min-w-11 rounded-lg cursor-pointer ${open ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-xl border border-border bg-surface shadow-raised p-1.5">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Detail
            </span>
            <span className="flex gap-1">
              {(["quick", "standard", "deep"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => onSetDetailLevel(lvl)}
                  title={lvl}
                  className={`text-xs px-2 py-1 rounded-md cursor-pointer ${detailLevel === lvl ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
                >
                  {lvl === "quick" ? "⚡" : lvl === "deep" ? "🔬" : "📖"}
                </button>
              ))}
            </span>
          </div>
          <div className="h-px bg-border-subtle my-1" />
          <button className={item} onClick={act(onOpenPrep)}>Prep &amp; parts list</button>
          {hasFirmware && (
            <button className={item} onClick={act(() => onOpenDrawer("firmware", null))}>
              Code package
            </button>
          )}
          {hasPcb && (
            <button
              className={item}
              onClick={act(() => onOpenDrawer(ercBlocksPcb ? "pcbBlocked" : "pcb"))}
            >
              PCB package{ercBlocksPcb ? " ⚠" : ""}
            </button>
          )}
          <button className={item} onClick={act(() => onOpenDrawer("case"))}>3D case</button>
          <button className={item} onClick={act(onShare)}>Share link</button>
          <button className={item} onClick={act(() => onOpenDrawer("publish"))}>
            Publish as kit
          </button>
        </div>
      )}
    </div>
  );
}

export function BuildScreen({
  plan,
  steps,
  step: s,
  stepIndex,
  pct,
  detailLevel,
  completed,
  firmware,
  hasPcb,
  ercBlocksPcb,
  onSoftwareStep,
  shareMsg,
  tooltip,
  activeDrawer,
  onHome,
  onShare,
  onBuyAll,
  onSetDetailLevel,
  onOpenPrep,
  onOpenDrawer,
  onCloseDrawer,
  onToggleComplete,
  onGoStep,
  onNext,
  onPrev,
  onSetTooltip,
}: BuildScreenProps) {
  const [handsFree, setHandsFree] = useState(false);
  useOverlay(() => setHandsFree(false), handsFree);

  // "Show me": the guided wire the builder tapped drives the 3D (zoom to pin +
  // light the wire). Owned here so StepHero (the 3D) and InstructionCard (the
  // guided cards) share it.
  const [activeWire, setActiveWire] = useState<MicroStep | null>(null);
  // A2: mirrors GuidedSteps' current-wire toggle (via GuidedActionContext,
  // provided below) and whether the firmware drawer has been opened for this
  // step — both feed PrimaryActionBar's one-CTA state machine.
  const [guidedAction, setGuidedAction] = useState<GuidedActionState | null>(null);
  const [firmwareOpened, setFirmwareOpened] = useState(false);

  // Reset the three above when the step changes, and latch firmwareOpened
  // once the firmware drawer has been opened (it can open from three places:
  // the bar below, the in-content "Firmware ready" banner, the header's
  // overflow menu — watching activeDrawer is one source of truth instead of
  // threading a handler through all three). Adjusted DURING render — React's
  // documented pattern for "resetting state when a prop changes" — rather
  // than in an effect, so there's no extra committed frame where the
  // previous step's wire/guided-action/firmware-opened state still shows.
  const [lastStepIndex, setLastStepIndex] = useState(stepIndex);
  if (stepIndex !== lastStepIndex) {
    setLastStepIndex(stepIndex);
    setActiveWire(null);
    setGuidedAction(null);
    setFirmwareOpened(false);
  }
  const [lastActiveDrawer, setLastActiveDrawer] = useState(activeDrawer);
  if (activeDrawer !== lastActiveDrawer) {
    setLastActiveDrawer(activeDrawer);
    if (activeDrawer === "firmware") setFirmwareOpened(true);
  }

  // A2: the step's checklist renders inside InstructionCard → step-facts.tsx
  // (out of scope for this slice), keying each row with data-unchecked — the
  // same attribute step-facts' own scroll-into-view effect already relies
  // on. Reading it back through a ref gets the bar a live total/checked
  // count and a scroll target without a new prop threaded through
  // InstructionCard. A MutationObserver on the scroll container, set up
  // once, catches every case in one place: first paint, step-to-step
  // content swaps, detail-level toggles, and each checkbox tap.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [actionsTotal, setActionsTotal] = useState(0);
  const [actionsChecked, setActionsChecked] = useState(0);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const recompute = () => {
      const rows = root.querySelectorAll("[data-unchecked]");
      let doneCount = 0;
      rows.forEach((row) => {
        if (row.getAttribute("data-unchecked") !== "true") doneCount++;
      });
      setActionsTotal(rows.length);
      setActionsChecked(doneCount);
    };
    recompute();
    const observer = new MutationObserver(recompute);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-unchecked"],
    });
    return () => observer.disconnect();
  }, []);

  // Same selector + scroll behavior as step-facts.tsx's own E6 effect — "cannot
  // skip" the checklist via the bar, only jump to what's left of it.
  const scrollToFirstUnchecked = () => {
    const el = scrollRef.current?.querySelector<HTMLElement>("[data-unchecked='true']");
    if (!el) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  };

  const isLast = stepIndex === steps.length - 1;
  const allComplete = steps.length > 0 && steps.every((st) => completed.has(st.stepNumber));

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="shrink-0 px-4 lg:px-6 py-3 border-b border-border-subtle flex items-center justify-between gap-2">
        <button onClick={onHome} className="text-sm text-text-muted hover:text-text cursor-pointer shrink-0">← Home</button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text truncate max-w-[160px] lg:max-w-[220px]">{plan.title}</span>
          <span className="text-xs text-text-muted hidden sm:inline">{plan.estimatedCost}</span>
        </div>
        <div className="flex items-center gap-1 lg:gap-2 shrink-0">
          <button
            onClick={() => (activeDrawer === "parts" ? onCloseDrawer() : onOpenDrawer("parts"))}
            className={`text-xs px-2.5 py-1.5 min-h-11 rounded-lg cursor-pointer ${activeDrawer === "parts" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            Parts
          </button>
          <ToolbarOverflow
            detailLevel={detailLevel}
            onSetDetailLevel={onSetDetailLevel}
            hasFirmware={!!firmware}
            hasPcb={hasPcb}
            ercBlocksPcb={ercBlocksPcb}
            onOpenPrep={onOpenPrep}
            onOpenDrawer={onOpenDrawer}
            onShare={onShare}
          />
        </div>
      </div>
      {shareMsg && <div className="text-center text-xs py-1 bg-success-soft text-success">{shareMsg}</div>}

      <div className="shrink-0 h-0.5 bg-surface-overlay">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="w-full lg:w-1/2 min-h-[200px] lg:min-h-0 bg-surface border-b lg:border-b-0 lg:border-r border-border-subtle overflow-hidden flex flex-col">
          {detailLevel !== "quick" && (s?.beforeState || s?.afterState) && (
            <div className="shrink-0 grid grid-cols-2 gap-0 border-b border-border-subtle">
              {s?.beforeState && (
                <div className="p-3 border-r border-border-subtle">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Before</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{s.beforeState}</p>
                </div>
              )}
              {s?.afterState && (
                <div className="p-3">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">After</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{s.afterState}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {s ? <StepHero step={s} plan={plan} stepIndex={stepIndex} focusWire={activeWire} /> : null}
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col min-h-0">
          {/* A4: plan-level coverage truth — renders only when the compiler
              left wires unplaced or flagged issues. Above the sub-header so
              it's visible on every step of an affected build. */}
          <CoverageBanner
            facts={plan.compiledFacts}
            onReview={() => onOpenDrawer("coverage")}
          />
          {/* Persistent step sub-header (Slice A1): step context never
              scrolls away. Was InstructionCard's own header block — now
              rendered once, above the scroll area, always visible. */}
          {s && (
            <div className="shrink-0 border-b border-border-subtle px-6 lg:px-10 pt-4 pb-3">
              <div className="max-w-md mx-auto">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  <span>
                    Step {stepIndex + 1} of {steps.length}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-overlay">
                    {kindLabel(stepKind(s))}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-overlay">
                    {TIME_BY_KIND[stepKind(s)]}
                  </span>
                </p>
                <h2
                  className="text-xl font-bold text-text font-serif truncate mt-1"
                  title={s.title}
                >
                  {s.title}
                </h2>
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-6 lg:p-10">
            <div className="max-w-md mx-auto">
              {/* Mobile only: the Stage column is a peek strip on <lg, so the
                  bench photo + technique reference live here instead. */}
              {s && (
                <div className="lg:hidden flex flex-col gap-3 mb-4">
                  <StepMediaExtras
                    planId={plan.id}
                    stepNumber={s.stepNumber}
                    media={resolveStepMedia(s)}
                  />
                </div>
              )}

              {s && (
                <GuidedActionContext.Provider value={setGuidedAction}>
                  <InstructionCard
                    step={s}
                    detailLevel={detailLevel}
                    planId={plan.id}
                    plan={plan}
                    firmware={firmware}
                    stepCompleted={completed.has(s.stepNumber)}
                    onAutoComplete={() => {
                      if (!completed.has(s.stepNumber)) onToggleComplete(s.stepNumber);
                    }}
                    onActiveWire={setActiveWire}
                  />
                </GuidedActionContext.Provider>
              )}

              {onSoftwareStep && firmware && (
                <div className="mb-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Firmware ready</p>
                  <p className="text-sm text-text-secondary mb-2">
                    Pins match this plan. Upload Blink first, then I2C scanner, then full app.
                  </p>
                  <button
                    onClick={() => onOpenDrawer("firmware", "blink")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium cursor-pointer"
                  >
                    Open code package →
                  </button>
                </div>
              )}

              {s && (
                <AskAboutStep
                  step={s}
                  parts={plan.parts}
                  onOpenUnstick={() => onOpenDrawer("unstick")}
                />
              )}

              {stepIndex === steps.length - 1 && completed.has(s?.stepNumber || 0) && (
                <div className="mt-4 p-5 rounded-2xl border border-success/25 bg-success-soft/50 text-center space-y-3">
                  <div aria-hidden className="text-3xl motion-safe:animate-bounce">🎉</div>
                  <h3 className="text-lg font-bold font-serif text-text">You built it.</h3>
                  <p className="text-sm text-text-secondary">
                    {steps.length} steps, every connection checked. Show it off — or turn it
                    into a kit someone else can build.
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={onShare}
                      className="w-full py-2.5 min-h-11 rounded-xl bg-accent text-white text-sm font-semibold cursor-pointer btn-spring"
                    >
                      Share your build
                    </button>
                    <button
                      onClick={() => onOpenDrawer("publish")}
                      className="w-full py-2.5 min-h-11 rounded-xl border border-border bg-surface text-sm text-text-secondary cursor-pointer"
                    >
                      Publish as a kit
                    </button>
                  </div>
                  <NextBuildDoorway finished={plan} />
                </div>
              )}
            </div>
          </div>

          {/* Primary actions (Slice A2): one CTA driven by PrimaryActionBar's
              state machine, plus a compact secondary row for the two
              non-primary escapes (stuck / hands-free) — both shrink-0 below
              the scroll area so they're always reachable without scrolling. */}
          <div className="shrink-0 border-t border-border-subtle px-6 lg:px-10 py-3">
            <div className="max-w-md mx-auto space-y-2">
              <PrimaryActionBar
                step={s}
                actionsTotal={actionsTotal}
                actionsChecked={actionsChecked}
                guidedState={guidedAction}
                isSoftwareStep={onSoftwareStep}
                firmwareOpened={firmwareOpened}
                completed={completed.has(s?.stepNumber || 0)}
                isLast={isLast}
                allComplete={allComplete}
                onMarkComplete={() => onToggleComplete(s?.stepNumber || 0)}
                onNext={onNext}
                onOpenFirmware={() => onOpenDrawer("firmware", "blink")}
                onShare={onShare}
                onScrollToFirstUnchecked={scrollToFirstUnchecked}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => onOpenDrawer("unstick")}
                  // Rescue reads as rescue: warm amber, distinct from neutral utility.
                  className="flex-1 !border-warning/50 !text-warning hover:!bg-warning-soft/40"
                >
                  <Icon name="bug" size={16} />
                  I&apos;m stuck
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => setHandsFree(true)}
                  className="flex-1"
                  title="Big text + read-aloud — for when your hands are full of flux"
                >
                  <Icon name="mic" size={16} />
                  Hands-free
                </Button>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-6 py-3 border-t border-border-subtle flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={stepIndex === 0}
              className="text-sm text-text-muted hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              ← Prev
            </button>
            {/* A3: was 11 anonymous dots — replaced with a tappable trigger
                that opens the full step list (StepListSheet), same
                exclusivity as every other drawer via activeDrawer. */}
            <button
              type="button"
              onClick={() => (activeDrawer === "steps" ? onCloseDrawer() : onOpenDrawer("steps"))}
              aria-expanded={activeDrawer === "steps"}
              className="min-h-11 px-3 text-sm text-text-secondary hover:text-text cursor-pointer"
            >
              Step {stepIndex + 1} of {steps.length} ⌄
            </button>
            <button
              onClick={onNext}
              disabled={stepIndex === steps.length - 1}
              className="text-sm text-text-muted hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {tooltip && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm p-4 rounded-xl bg-gray-900 text-white text-xs leading-relaxed shadow-lg" onClick={() => onSetTooltip(null)}>
          {tooltip}
        </div>
      )}

      {activeDrawer === "steps" && (
        <StepListSheet
          steps={steps}
          stepIndex={stepIndex}
          completed={completed}
          onGoStep={onGoStep}
          onClose={onCloseDrawer}
        />
      )}

      {activeDrawer === "coverage" && (
        <DrawerShell title="Wiring coverage" onClose={onCloseDrawer} width="md">
          <CoverageDetail facts={plan.compiledFacts} />
        </DrawerShell>
      )}

      {handsFree && (
        <HandsFreeMode
          plan={plan}
          steps={steps}
          stepIndex={stepIndex}
          completed={completed}
          onGoStep={onGoStep}
          onToggleComplete={onToggleComplete}
          onClose={() => setHandsFree(false)}
        />
      )}
    </div>
  );
}
