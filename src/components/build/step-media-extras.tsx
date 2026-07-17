"use client";

/**
 * StepMediaExtras — the bench PhotoCard + Technique accordion, extracted from
 * StepHero (Slice A1) so the SAME content can mount twice: once inside the
 * desktop 3D column (hidden lg:flex, unchanged look) and once inline in the
 * mobile instruction column, where the Stage collapses to a peek strip and
 * this becomes the builder's primary reference media.
 */

import { useState } from "react";
import type { StepMediaResult } from "@/lib/step-media";
import { useOverlay } from "./use-overlay";
import { useProbedImage } from "./use-probed-image";

function PhotoCard({ planId, stepNumber }: { planId: string; stepNumber: number }) {
  // Renders nothing until a real photo decodes — a missing file must never
  // flash a ghost card (probe is timing-proof, see useProbedImage).
  const [lightbox, setLightbox] = useState(false);
  useOverlay(() => setLightbox(false), lightbox);
  const src = `/build-photos/${planId}/step-${stepNumber}.jpg`;
  const loaded = useProbedImage(src);

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

export function StepMediaExtras({
  planId,
  stepNumber,
  media,
}: {
  planId: string;
  stepNumber: number;
  media: StepMediaResult;
}) {
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const hasTechnique = media.kind !== "generic_checklist";

  return (
    <>
      <div className="shrink-0">
        <PhotoCard planId={planId} stepNumber={stepNumber} />
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
    </>
  );
}
