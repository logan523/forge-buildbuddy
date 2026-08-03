"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import type { BuildPlan } from "@/lib/types";
import { buildProductVisual, type ProductVisual } from "@/lib/product-visual";
import { StageApp } from "@/components/stage/stage-app";
import { StageBoundary } from "@/components/stage/stage-boundary";

export function useProductVisual(plan: BuildPlan): ProductVisual {
  return useMemo(() => buildProductVisual(plan), [plan]);
}

export function ProductHero({
  plan,
  visual,
  stepIndex = "prep",
  compact = false,
  onPlanPatch,
}: {
  plan: BuildPlan;
  visual?: ProductVisual;
  /** prep or 0-based step index */
  stepIndex?: number | "prep";
  compact?: boolean;
  /** Persist beauty mesh / other plan patches from the 3D viewer */
  onPlanPatch?: (patch: Partial<BuildPlan>) => void;
}) {
  const fallback = useProductVisual(plan);
  const pv = visual ?? fallback;
  const [livePlan, setLivePlan] = useState(plan);
  const stage = pv.stageForStep(stepIndex);
  const form = livePlan.formSpec || pv.formSpec;
  const caption =
    (stepIndex === "prep" && form?.productCaption) || stage.caption;

  useEffect(() => {
    setLivePlan(plan);
  }, [plan]);

  const onBeauty = useCallback(
    (mesh: import("@/lib/product-3d").BeautyMeshSpec) => {
      setLivePlan((p) => {
        const next = { ...p, beautyMesh: mesh };
        onPlanPatch?.({ beautyMesh: mesh });
        return next;
      });
    },
    [onPlanPatch]
  );

  return (
    <div
      className={`rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden ${
        compact ? "" : "mb-6"
      }`}
    >
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              {stepIndex === "prep" ? "What you’re building" : "Assembly"}
            </p>
            {/* No raw templateId chip: "sat_clock" is an internal token — the
                caption below already says it in English. */}
          </div>
          {!compact && (
            <h3 className="text-base font-semibold text-text font-serif mt-0.5 truncate">
              {plan.title}
            </h3>
          )}
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{caption}</p>
        </div>
      </div>

      {/* Full-bleed CAD stage — wider than page padding. Wrapped so a WebGL /
          postprocessing failure degrades to a note instead of taking down the
          whole build (the parts, wiring and steps below need no 3D). */}
      <div className={compact ? "px-2 pb-2" : "px-0 pb-0 sm:-mx-1"}>
        <StageBoundary
          fallback={
            <div
              className="flex items-center justify-center text-center px-6"
              style={{ minHeight: compact ? 220 : 300 }}
            >
              <div>
                <p className="text-sm font-medium text-text">3D preview isn’t available here</p>
                <p className="mt-1 text-xs text-text-secondary">
                  No problem — your parts, wiring, and steps below have everything you need to build it.
                </p>
              </div>
            </div>
          }
        >
          <StageApp
            plan={livePlan}
            stepIndex={stepIndex}
            height={compact ? 560 : 920}
            expandable
            variant="step"
            onPlanPatch={(patch) => {
              if (patch.beautyMesh) onBeauty(patch.beautyMesh);
              else onPlanPatch?.(patch);
            }}
          />
        </StageBoundary>
      </div>
    </div>
  );
}
