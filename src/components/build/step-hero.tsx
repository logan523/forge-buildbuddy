"use client";

/**
 * Step media hero — ONE ProductAssemblyApp (variant="step", minimal chrome),
 * expanded playground via className swap on the same canvas (eng V4), a real
 * bench photo when one exists (E1: public/build-photos/<planId>/step-<n>.jpg),
 * and the hand-drawn technique inset. Browser Back closes any overlay before
 * leaving the build (F4) via a pushed history entry.
 *
 * Slice A1 (workbench foundations): on <lg this column shrinks to a peek
 * strip — the PhotoCard + Technique accordion (StepMediaExtras) move inline
 * into BuildScreen's instruction column instead, so they stay reachable
 * without opening the expanded 3D view. Desktop (lg+) is unchanged.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildPlan, BuildStep, MicroStep } from "@/lib/types";
import { resolveStepMedia } from "@/lib/step-media";
import { svgCircuitDiagram } from "@/lib/step-media/circuit-diagram";
import { StageApp } from "@/components/stage/stage-app";
import { StageBoundary } from "@/components/stage/stage-boundary";
import { StepMediaExtras } from "./step-media-extras";
import { useOverlay } from "./use-overlay";

function useStageHeight(): number {
  const [h, setH] = useState(420);
  useEffect(() => {
    const update = () => {
      const vh = window.innerHeight;
      const large = window.matchMedia("(min-width: 1024px)").matches;
      // Phone: a peek strip — clamp(96px, 42vh, 112px). The canvas stays
      // mounted at a glance height; full view is one tap away via Expand.
      // Desktop keeps the taller stage.
      setH(large ? 480 : Math.max(96, Math.min(112, Math.round(vh * 0.42))));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return h;
}

export function StepHero({
  step,
  plan,
  stepIndex,
  focusWire = null,
}: {
  step: BuildStep;
  plan: BuildPlan;
  stepIndex: number;
  /** "Show me" drill-down: the active guided wire to zoom to + light in the 3D. */
  focusWire?: MicroStep | null;
}) {
  const media = resolveStepMedia(step);
  const [expanded, setExpanded] = useState(false);
  const stageHeight = useStageHeight();
  const closeExpand = useCallback(() => setExpanded(false), []);
  useOverlay(closeExpand, expanded);

  // Pass compiled facts so StageApp can isolate/focus on the pins this step
  // actually touches. Omitting focusPartIds left the camera on the full hero
  // product for every wiring step — the main "renderer feels useless" bug.
  const stepProps = {
    title: step.title,
    description: step.description,
    mediaKind: step.mediaKind,
    stepNumber: step.stepNumber,
    compiled: step.compiled
      ? {
          focusPartIds: step.compiled.focusPartIds,
          connections: step.compiled.connections,
        }
      : undefined,
  };

  const hasFocus = (step.compiled?.focusPartIds?.length ?? 0) > 0 || !!focusWire;

  // Wiring/solder steps: the cropped 2D wiring sheet is the hero — this
  // step's parts and wires drawn large and legible, pin names on every
  // endpoint (the old 96px 3D peek strip was noise, not information). The
  // 3D stage stays one tap away via "View in 3D" for spatial confirmation.
  // Placement and other steps keep the 3D stage as their hero.
  const isWiringStep = (step.compiled?.microSteps?.length ?? 0) > 0;
  const sheetSvg = useMemo(
    () =>
      isWiringStep
        ? svgCircuitDiagram(plan, {
            crop: true,
            focusPartIds: step.compiled?.focusPartIds ?? [],
            highlightWireIds: focusWire ? [focusWire.id] : [],
          })
        : "",
    [plan, step, focusWire, isWiringStep]
  );

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
            {hasFocus ? "Step focus" : "Assembly stage"}
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            // Mobile: the Stage collapses to a peek strip, so this is the ONLY
            // way to reach the full 3D view — a prominent 44px target. Desktop
            // restores the original small chip via the lg: overrides below.
            className="text-xs lg:text-[10px] px-3 lg:px-2.5 py-2.5 lg:py-1.5 min-h-11 lg:min-h-[28px] rounded-md border border-accent/40 lg:border-border-subtle bg-accent/10 lg:bg-transparent text-accent hover:bg-accent/10 cursor-pointer font-medium"
            aria-expanded={expanded}
          >
            <span className="lg:hidden">⤢ View in 3D</span>
            <span className="hidden lg:inline">⤢ Expand</span>
          </button>
        </div>
        {/* Wiring steps lead with the 2D sheet crop (this step's parts + the
            active wire, drawn large); the 3D stage mounts only when the
            builder asks via "View in 3D". Everything else keeps the canvas. */}
        {isWiringStep && !expanded ? (
          <div
            className="rounded-lg border border-border-subtle bg-surface shadow-card overflow-x-auto [&_svg]:block [&_svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: sheetSvg }}
          />
        ) : (
          /* ONE canvas: expanding swaps classNames inside ProductAssemblyApp.
             Boundary so a WebGL failure shows a note, not a dead build screen. */
          <StageBoundary
            fallback={
              <div
                className="flex items-center justify-center text-center rounded-lg border border-border-subtle bg-surface-overlay px-4"
                style={{ height: stageHeight }}
              >
                <p className="text-xs text-text-secondary">
                  3D view unavailable here — the wiring and steps below still have you covered.
                </p>
              </div>
            }
          >
            <StageApp
              plan={plan}
              stepIndex={stepIndex}
              step={stepProps}
              height={stageHeight}
              expandable={false}
              variant="step"
              expanded={expanded}
              onExpandedChange={setExpanded}
              focusWire={focusWire}
            />
          </StageBoundary>
        )}
        {expanded && (
          <button
            type="button"
            onClick={closeExpand}
            className="fixed top-4 right-4 z-[60] min-w-11 min-h-11 px-3 rounded-lg bg-white/10 text-white text-sm border border-white/20 cursor-pointer"
          >
            Close
          </button>
        )}
      </div>

      {/* Desktop only — the mobile column mounts the same StepMediaExtras
          inline in BuildScreen's instruction pane (Slice A1). */}
      <div className="hidden lg:flex flex-col gap-3">
        <StepMediaExtras planId={plan.id} stepNumber={step.stepNumber} media={media} />
      </div>
    </div>
  );
}
