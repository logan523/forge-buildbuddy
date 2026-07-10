"use client";

/**
 * Step media hero — ONE ProductAssemblyApp (variant="step", minimal chrome),
 * expanded playground via className swap on the same canvas (eng V4), a real
 * bench photo when one exists (E1: public/build-photos/<planId>/step-<n>.jpg),
 * and the hand-drawn technique inset. Browser Back closes any overlay before
 * leaving the build (F4) via a pushed history entry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { resolveStepMedia } from "@/lib/step-media";
import { ProductAssemblyApp } from "@/components/product-assembly-app";

/** Push a history entry so Back closes the overlay instead of leaving (F4). */
function useOverlay(onClose: () => void, open: boolean) {
  const pushed = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || typeof history === "undefined") return;
    history.pushState({ forgeOverlay: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (pushed.current) {
        pushed.current = false;
        history.back();
      }
    };
  }, [open]);
}

function useStageHeight(): number {
  const [h, setH] = useState(420);
  useEffect(() => {
    const update = () => {
      const vh = window.innerHeight;
      const large = window.matchMedia("(min-width: 1024px)").matches;
      // Phone: clamp(260px, 42vh, 420px); desktop keeps the taller stage.
      setH(large ? 480 : Math.max(260, Math.min(420, Math.round(vh * 0.42))));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return h;
}

function PhotoCard({ planId, stepNumber }: { planId: string; stepNumber: number }) {
  // Renders nothing until a real photo decodes — a missing file must never
  // flash a ghost card. Probing with img.decode() is timing-proof: it
  // resolves even for cached images whose load event fired before React
  // attached listeners, and rejects on 404s (which can hang before erroring
  // in dev).
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  useOverlay(() => setLightbox(false), lightbox);
  const src = `/build-photos/${planId}/step-${stepNumber}.jpg`;

  useEffect(() => {
    setLoaded(false);
    let alive = true;
    const probe = new Image();
    // Handlers attach BEFORE src so a cache-synchronous load can't slip past;
    // (img.decode() hangs in some embedders, so no reliance on it).
    probe.onload = () => {
      if (alive && probe.naturalWidth > 0) setLoaded(true);
    };
    probe.onerror = () => {
      if (alive) setLoaded(false);
    };
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) setLoaded(true);
    return () => {
      alive = false;
    };
  }, [src]);

  if (!loaded) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="relative block w-full rounded-xl overflow-hidden border border-border-subtle shadow-card cursor-zoom-in"
        aria-label={`Open bench photo for step ${stepNumber}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Bench photo — step ${stepNumber}`}
          className="w-full h-24 object-cover"
        />
        <span className="absolute left-2 bottom-1.5 text-[8px] font-bold tracking-[0.12em] text-white/90 uppercase drop-shadow">
          Your bench · step {stepNumber}
        </span>
      </button>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Bench photo — step ${stepNumber}`}
            className="max-w-full max-h-full rounded-xl"
          />
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 min-w-11 min-h-11 rounded-full bg-white/10 text-white text-lg border border-white/20 cursor-pointer"
            aria-label="Close photo"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

export function StepHero({
  step,
  plan,
  stepIndex,
}: {
  step: BuildStep;
  plan: BuildPlan;
  stepIndex: number;
}) {
  const media = resolveStepMedia(step);
  const [expanded, setExpanded] = useState(false);
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const stageHeight = useStageHeight();
  const closeExpand = useCallback(() => setExpanded(false), []);
  useOverlay(closeExpand, expanded);

  const stepProps = {
    title: step.title,
    description: step.description,
    mediaKind: step.mediaKind,
    stepNumber: step.stepNumber,
  };
  const hasTechnique = media.kind !== "generic_checklist";

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
            Assembly stage
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[10px] px-2.5 py-1.5 min-h-[28px] rounded-md border border-border-subtle text-accent hover:bg-accent/10 cursor-pointer font-medium"
            aria-expanded={expanded}
          >
            ⤢ Expand
          </button>
        </div>
        {/* ONE canvas: expanding swaps classNames inside ProductAssemblyApp. */}
        <ProductAssemblyApp
          plan={plan}
          stepIndex={stepIndex}
          step={stepProps}
          height={stageHeight}
          expandable={false}
          variant="step"
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
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

      <div className="shrink-0">
        <PhotoCard planId={plan.id} stepNumber={step.stepNumber} />
      </div>

      {hasTechnique && (
        <div className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden shrink-0">
          <button
            type="button"
            aria-expanded={techniqueOpen}
            onClick={() => setTechniqueOpen((v) => !v)}
            className="w-full px-3 py-2 min-h-11 bg-surface-raised border-b border-border-subtle flex items-center justify-between gap-2 cursor-pointer text-left hover:bg-surface-hover"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Technique
              </p>
              <p className="text-sm font-semibold text-text truncate">{media.title}</p>
            </div>
            <span
              className={`text-text-muted shrink-0 transition-transform ${techniqueOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          <p className="px-3 py-2.5 text-sm text-text leading-snug bg-surface">{media.caption}</p>
          {techniqueOpen && (
            <div
              className="w-full bg-white border-t border-border-subtle [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
              style={{ minHeight: 160 }}
              dangerouslySetInnerHTML={{ __html: media.svg }}
            />
          )}
        </div>
      )}
    </div>
  );
}
