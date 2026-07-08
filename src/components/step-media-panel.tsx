"use client";

import type { BuildStep, BuildPlan } from "@/lib/types";
import type { ProductVisual } from "@/lib/product-visual";
import { resolveStepMedia } from "@/lib/step-media";
import { ProductViewer3D, stepFocusLayer } from "@/components/product-viewer-3d";

/**
 * Left-pane: 3D product (layers) + 2D action diagram for hands-on steps.
 */
export function StepMediaPanel({
  step,
  plan,
  visual,
  stepIndex,
}: {
  step: BuildStep;
  plan: BuildPlan;
  visual: ProductVisual;
  stepIndex: number;
}) {
  const media = resolveStepMedia(step);
  const focus = stepFocusLayer(plan, stepIndex);

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      {/* 3D product — peel layers / explode */}
      <ProductViewer3D
        plan={plan}
        focusLayer={focus}
        height={280}
        showLayerPanel
        compact
      />

      {/* 2D action diagram — what to do with your hands */}
      <div className="rounded-xl border-2 border-accent/30 bg-surface shadow-card overflow-hidden">
        <div className="px-3 py-2 bg-accent/5 border-b border-accent/15 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
              Hands-on diagram
            </p>
            <p className="text-xs font-medium text-text">{media.title}</p>
          </div>
          <span className="text-[9px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-overlay">
            {media.kind}
          </span>
        </div>
        <div
          className="w-full bg-white"
          style={{ minHeight: 180 }}
          dangerouslySetInnerHTML={{ __html: media.svg }}
        />
        <p className="px-3 py-2 text-xs text-text-secondary border-t border-border-subtle">
          {media.caption}
        </p>
      </div>
    </div>
  );
}
