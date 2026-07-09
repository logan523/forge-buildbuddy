"use client";

import { useState } from "react";
import type { BuildStep, BuildPlan } from "@/lib/types";
import type { ProductVisual } from "@/lib/product-visual";
import { resolveStepMedia } from "@/lib/step-media";
import { ProductAssemblyApp } from "@/components/product-assembly-app";

/**
 * Left-pane: hands-on diagram PRIMARY, assembly stage secondary (phase-aware).
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

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      {/* PRIMARY — 2D action diagram */}
      <div className="rounded-xl border-2 border-accent/40 bg-surface shadow-card overflow-hidden shrink-0">
        <div className="px-3 py-2 bg-accent/10 border-b border-accent/20 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
              Hands-on diagram
            </p>
            <p className="text-sm font-semibold text-text truncate">{media.title}</p>
          </div>
          <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-md bg-surface-overlay shrink-0">
            Do this
          </span>
        </div>
        <div
          className="w-full bg-white [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
          style={{ minHeight: 160 }}
          dangerouslySetInnerHTML={{ __html: media.svg }}
        />
        <p className="px-3 py-2.5 text-sm text-text leading-snug border-t border-border-subtle bg-surface">
          {media.caption}
        </p>
      </div>

      {/* Product assembly context — phase-aware stage + expand */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Where it lives in the product
          </p>
          <button
            type="button"
            onClick={() => setOpenAssembly(true)}
            className="text-[10px] px-2 py-1 rounded-md border border-border-subtle text-accent hover:bg-accent/10 cursor-pointer font-medium"
          >
            Open assembly stage
          </button>
        </div>
        <ProductAssemblyApp
          plan={plan}
          stepIndex={stepIndex}
          step={{
            title: step.title,
            description: step.description,
            mediaKind: step.mediaKind,
          }}
          height={420}
          expandable={false}
        />
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
              step={{
                title: step.title,
                description: step.description,
                mediaKind: step.mediaKind,
              }}
              height={520}
              expandable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
