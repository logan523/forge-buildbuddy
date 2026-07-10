"use client";

import type { BuildPlan, BuildStep, Part } from "@/lib/types";
import type { FirmwarePackage } from "@/lib/firmware";
import type { ProductVisual } from "@/lib/product-visual";
import { InstructionCard } from "@/components/instruction-card";
import { stepKind, kindLabel } from "@/lib/steps/classify";
import { StepMediaPanel } from "@/components/step-media-panel";
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
  productVisual: ProductVisual;
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
  productVisual,
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
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="shrink-0 px-4 lg:px-6 py-3 border-b border-border-subtle flex items-center justify-between gap-2">
        <button onClick={onHome} className="text-sm text-text-muted hover:text-text cursor-pointer shrink-0">← Home</button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text truncate max-w-[160px] lg:max-w-[220px]">{plan.title}</span>
          <span className="text-xs text-text-muted hidden sm:inline">{plan.estimatedCost}</span>
        </div>
        <div className="flex items-center gap-1 lg:gap-2 shrink-0 flex-wrap justify-end">
          {(["quick", "standard", "deep"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => onSetDetailLevel(lvl)}
              className={`text-xs px-2 py-1 rounded-lg cursor-pointer ${detailLevel === lvl ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              {lvl === "quick" ? "⚡" : lvl === "deep" ? "🔬" : "📖"}
            </button>
          ))}
          <span className="w-px h-4 bg-border mx-0.5 hidden sm:block" />
          <button onClick={onOpenPrep} className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer">Prep</button>
          {firmware && (
            <button
              onClick={() => onOpenDrawer("firmware", null)}
              className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${activeDrawer === "firmware" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              Code
            </button>
          )}
          {hasPcb && (
            <button
              onClick={() => (ercBlocksPcb ? onOpenDrawer("pcbBlocked") : onOpenDrawer("pcb"))}
              title={ercBlocksPcb ? "See why PCB export is blocked — and how to unlock it" : "PCB package"}
              className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${
                ercBlocksPcb
                  ? "text-warning hover:bg-warning-soft"
                  : activeDrawer === "pcb"
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text"
              }`}
            >
              PCB{ercBlocksPcb ? " ⚠" : ""}
            </button>
          )}
          <button
            onClick={() => onOpenDrawer("case")}
            className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${activeDrawer === "case" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            Case
          </button>
          <button
            onClick={() => onOpenDrawer("publish")}
            className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            Publish
          </button>
          <button
            onClick={() => (activeDrawer === "parts" ? onCloseDrawer() : onOpenDrawer("parts"))}
            className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${activeDrawer === "parts" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            Parts
          </button>
          <button onClick={onShare} className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer">Share</button>
          <button
            onClick={() => onBuyAll(plan.parts)}
            className="text-xs px-2 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-soft cursor-pointer"
          >
            Buy
          </button>
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
            {s ? (
              <StepMediaPanel
                step={s}
                plan={plan}
                visual={productVisual}
                stepIndex={stepIndex}
              />
            ) : null}
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 lg:p-10">
            <div className="max-w-md mx-auto">
              {s && (
                <InstructionCard
                  step={s}
                  stepIndex={stepIndex}
                  totalSteps={steps.length}
                  kindLabel={kindLabel(stepKind(s))}
                  detailLevel={detailLevel}
                  planId={plan.id}
                  stepCompleted={completed.has(s.stepNumber)}
                  onAutoComplete={() => {
                    if (!completed.has(s.stepNumber)) onToggleComplete(s.stepNumber);
                  }}
                />
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

              <button
                onClick={() => onToggleComplete(s?.stepNumber || 0)}
                className={`w-full py-3 rounded-xl font-medium text-sm cursor-pointer mb-2 ${
                  completed.has(s?.stepNumber || 0)
                    ? "bg-success/20 text-success border border-success/20"
                    : "bg-accent text-white btn-spring"
                }`}
              >
                {completed.has(s?.stepNumber || 0) ? "✓ Complete" : "Mark complete"}
              </button>
              <button
                onClick={() => onOpenDrawer("unstick")}
                className="w-full py-3 rounded-xl font-medium text-sm cursor-pointer mb-2 border border-warning/30 bg-warning-soft/40 text-warning"
              >
                I&apos;m stuck — help me debug
              </button>
            </div>
          </div>

          <div className="shrink-0 px-6 py-3 border-t border-border-subtle flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={stepIndex === 0}
              className="text-sm text-text-muted hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              ← Previous
            </button>
            <div className="flex gap-1.5 flex-wrap justify-center max-w-[50%]">
              {steps.map((st, i) => (
                <button
                  key={st.stepNumber}
                  onClick={() => onGoStep(i)}
                  className={`rounded-full transition-all cursor-pointer ${
                    i === stepIndex
                      ? "bg-accent w-4 h-2"
                      : completed.has(st.stepNumber)
                        ? "bg-success w-2 h-2"
                        : "bg-border w-2 h-2"
                  }`}
                />
              ))}
            </div>
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
    </div>
  );
}
