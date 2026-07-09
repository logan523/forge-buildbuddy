"use client";

import type { BuildStep, BuildPlan } from "@/lib/types";
import type { ProductVisual } from "@/lib/product-visual";
import { resolveStepMedia } from "@/lib/step-media";
import { ProductViewer3D } from "@/components/product-viewer-3d";
import { focusLayerForStep } from "@/lib/product-3d";

/**
 * Left-pane: hands-on diagram PRIMARY, 3D product secondary (docs/STEP-MEDIA.md).
 */
export function StepMediaPanel({
  step,
  plan,
  visual: _visual,
  stepIndex: _stepIndex,
}: {
  step: BuildStep;
  plan: BuildPlan;
  visual: ProductVisual;
  stepIndex: number;
}) {
  const media = resolveStepMedia(step);
  // Focus from the same step object as the diagram (not filtered plan.steps[i])
  const focus = focusLayerForStep(step.title, step.description, step.mediaKind);

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

      {/* SECONDARY — compact 3D product context */}
      <div className="shrink-0">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 px-0.5">
          Product layers
        </p>
        <ProductViewer3D
          plan={plan}
          focusLayer={focus}
          height={200}
          showLayerPanel={false}
          compact
          editable={false}
        />
      </div>
    </div>
  );
}
