"use client";

import { useState } from "react";
import type { BuildStep, BuildPlan } from "@/lib/types";
import type { ProductVisual } from "@/lib/product-visual";
import { resolveStepMedia } from "@/lib/step-media";
import { ProductAssemblyApp } from "@/components/product-assembly-app";

/**
 * Left-pane: 3D assembly stage PRIMARY (phase-aware hero), 2D hands-on diagram
 * collapsible below it. The diagram caption stays visible — it tells the builder
 * what to do this step even when the drawing is collapsed.
 */
export function StepMediaPanel({
  step,
  plan,
  visual: _visual,
  stepIndex,
}: {
  step: BuildStep;
  plan: BuildPlan;
  visual: ProductVisual;
  stepIndex: number;
}) {
  const media = resolveStepMedia(step);
  const [openAssembly, setOpenAssembly] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);

  const stepProps = {
    title: step.title,
    description: step.description,
    mediaKind: step.mediaKind,
  };

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      {/* PRIMARY — 3D assembly stage */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
            Assembly stage
          </p>
          <button
            type="button"
            onClick={() => setOpenAssembly(true)}
            className="text-[10px] px-2 py-1 rounded-md border border-border-subtle text-accent hover:bg-accent/10 cursor-pointer font-medium"
          >
            Expand
          </button>
        </div>
        {openAssembly ? (
          /* Inline stage unmounts while the modal owns the (only) live canvas */
          <div
            className="rounded-2xl border border-border-subtle bg-[#070a0f] flex items-center justify-center"
            style={{ height: 480 }}
          >
            <p className="text-xs text-white/50">Open in expanded stage</p>
          </div>
        ) : (
          <ProductAssemblyApp
            plan={plan}
            stepIndex={stepIndex}
            step={stepProps}
            height={480}
            expandable={false}
          />
        )}
      </div>

      {/* Hands-on 2D diagram — collapsed by default, caption always visible */}
      <div className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden shrink-0">
        <button
          type="button"
          aria-expanded={diagramOpen}
          onClick={() => setDiagramOpen((v) => !v)}
          className="w-full px-3 py-2 bg-surface-raised border-b border-border-subtle flex items-center justify-between gap-2 cursor-pointer text-left hover:bg-surface-hover"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Hands-on diagram
            </p>
            <p className="text-sm font-semibold text-text truncate">{media.title}</p>
          </div>
          <span
            className={`text-text-muted shrink-0 transition-transform ${diagramOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        <p className="px-3 py-2.5 text-sm text-text leading-snug bg-surface">{media.caption}</p>
        {diagramOpen && (
          <div
            className="w-full bg-white border-t border-border-subtle [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
            style={{ minHeight: 160 }}
            dangerouslySetInnerHTML={{ __html: media.svg }}
          />
        )}
      </div>

      {openAssembly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-6xl max-h-[95vh] overflow-auto relative">
            <button
              type="button"
              onClick={() => setOpenAssembly(false)}
              className="absolute top-3 right-3 z-10 text-[11px] px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer border border-white/20"
            >
              Close
            </button>
            <ProductAssemblyApp
              plan={plan}
              stepIndex={stepIndex}
              step={stepProps}
              height={720}
              expandable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
