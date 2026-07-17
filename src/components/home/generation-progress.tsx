"use client";

/**
 * Generation progress (B1 #2) — extracted from page.tsx's inline loading
 * screen. Drives the 6-stage list off the REAL layer boundaries the pipeline
 * reports (src/lib/pipeline/run.ts onProgress), not a fake timer. Adds an
 * elapsed-seconds counter, an honest duration estimate, and a Cancel button
 * so a long generation is never a silent black box.
 *
 * Also hosts the principles checkpoint (B2 #5): the moment the layer-2
 * "done" event's detail carries pipelineMeta.principles, a non-blocking card
 * appears while layers 3-6 keep running underneath it.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { PrinciplesResult } from "@/lib/pipeline/types";
import { PrinciplesCheck } from "./principles-check";

/** UI labels for the real pipeline layers (see src/lib/pipeline/run.ts). */
const LOADING_STAGES = [
  { layer: 1, icon: "🛡", label: "Checking for hazards" },
  { layer: 2, icon: "🧭", label: "Framing the goal" },
  { layer: 3, icon: "📋", label: "Finding every part" },
  { layer: 4, icon: "📚", label: "Checking the catalog" },
  { layer: 5, icon: "✍️", label: "Writing your steps" },
  { layer: 6, icon: "✅", label: "Safety & trust checks" },
] as const;

export function GenerationProgress({
  activeLayer,
  principles,
  onCancel,
}: {
  activeLayer: number;
  principles: PrinciplesResult | null;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [principlesDismissed, setPrinciplesDismissed] = useState(false);

  // Self-contained elapsed timer — starts the moment this screen mounts,
  // which is exactly when the request goes out (page.tsx renders this only
  // while loading is true).
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const showPrinciples = principles !== null && !principlesDismissed;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full">
        <div className="w-16 h-16 mx-auto mb-6 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
        <h2 className="text-xl font-bold text-text font-serif mb-1">Building your guide</h2>
        <p className="text-xs text-text-muted mb-4" aria-live="polite">
          {elapsed}s elapsed · usually 30–90 seconds
        </p>

        <div className="space-y-2 text-left inline-block">
          {LOADING_STAGES.map((stage) => {
            const state =
              activeLayer > stage.layer ? "done" : activeLayer === stage.layer ? "active" : "pending";
            return (
              <p
                key={stage.layer}
                className={`text-sm flex items-center gap-2 transition-all duration-500 ${
                  state === "done"
                    ? "text-text-secondary"
                    : state === "active"
                      ? "text-text font-medium"
                      : "text-text-muted/30"
                }`}
              >
                <span className="w-4 shrink-0 text-center">
                  {state === "done" ? "✓" : state === "active" ? stage.icon : "○"}
                </span>
                {stage.label}
              </p>
            );
          })}
        </div>

        {showPrinciples && principles && (
          <div className="mt-6 text-left">
            <PrinciplesCheck
              principles={principles}
              onLooksRight={() => setPrinciplesDismissed(true)}
              onRephrase={onCancel}
            />
          </div>
        )}

        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="mt-6">
          Cancel
        </Button>
      </div>
    </div>
  );
}
