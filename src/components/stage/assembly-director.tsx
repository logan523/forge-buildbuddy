"use client";

/**
 * Assembly director — the scrub bar, phase chips, play/pause and callout that
 * drive the piece-by-piece build-up/tear-down. Pure DOM chrome; the timeline
 * math lives in resolveAssemblyFrame (unchanged engine) fed by recipes that
 * now exist for EVERY template (derived when not hand-authored) — the old
 * stuck-Pause bug on non-sat projects is impossible by construction.
 */
import { useEffect, useRef } from "react";
import type { AssemblyFrame, AssemblyRecipe } from "@/lib/product-3d";
import { invalidateStage } from "./stage-invalidate";

const TICK_MS = 48;
const TICK_STEP = 0.02;

export function AssemblyDirector({
  recipe,
  frame,
  scrub,
  onScrub,
  playing,
  onPlayingChange,
}: {
  recipe: AssemblyRecipe;
  frame: AssemblyFrame;
  scrub: number;
  onScrub: (v: number) => void;
  playing: boolean;
  onPlayingChange: (p: boolean) => void;
}) {
  const max = recipe.phases.length - 1;
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;

  // Play loop: advance until complete, then stop (never a stuck "Pause").
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = Math.min(max, scrubRef.current + TICK_STEP);
      onScrub(next);
      invalidateStage();
      if (next >= max) onPlayingChange(false);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, max, onScrub, onPlayingChange]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl bg-surface-raised/95 border border-border-subtle shadow-card px-4 py-3 text-text">
        {/* Callout — the authored beginner prose for this phase */}
        <div className="text-[13px] leading-snug mb-2">
          <span className="font-semibold">{frame.phase.title}</span>
          <span className="text-text-secondary"> — {frame.callout}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!playing && scrub >= max) onScrub(0); // replay from the start
              onPlayingChange(!playing);
            }}
            className="shrink-0 px-3 py-1.5 rounded-md bg-accent border border-accent text-white text-xs font-medium"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            data-testid="phase-scrub"
            min={0}
            max={max}
            step={0.01}
            value={scrub}
            onChange={(e) => {
              onPlayingChange(false);
              onScrub(parseFloat(e.target.value));
              invalidateStage();
            }}
            className="w-full accent-accent"
          />
        </div>
        {/* Phase chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.phases.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onPlayingChange(false);
                onScrub(p.index);
                invalidateStage();
              }}
              className={`px-2 py-0.5 rounded-md text-xs border transition-colors ${
                frame.phaseIndex === p.index
                  ? "bg-accent border-accent text-white"
                  : "bg-surface border-border text-text-secondary hover:border-border-strong"
              }`}
            >
              {p.index + 1} · {p.title.length > 22 ? `${p.title.slice(0, 22)}…` : p.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
