"use client";

/**
 * "Did I do it right?" photo check button (E3) — hardened gate (Tension C).
 *
 * Renders ONLY when BOTH gates pass:
 *   1. /photo-check.pass.json exists with {passed: true} — written exclusively
 *      by scripts/eval-photo-check.mjs on a passing eval and DELETED on any
 *      failure. The eval result mechanically controls this button's presence.
 *   2. A reference photo exists for this exact step (demo-scoped v1) —
 *      /build-photos/<planId>/step-<n>.jpg, same probe pattern as PhotoCard.
 *
 * F4 semantics: one verdict at a time; retake only after a verdict or error.
 * The verdict never replaces the manual checklist — it sits beside it.
 */

import { useEffect, useRef, useState } from "react";
import type { BuildStep } from "@/lib/types";
import type { PhotoVerdict } from "@/lib/photo-check";
import { diagLog } from "@/lib/diag";

const MAX_DIM = 1280;

async function downscaleToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image decode failed"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(",")[1] ?? null;
  } catch {
    return null;
  }
}

const VERDICT_STYLE: Record<PhotoVerdict["verdict"], { head: string; cls: string }> = {
  looks_right: { head: "✓ Looks right", cls: "bg-success-soft border-success/30 text-success" },
  cant_tell: { head: "Can't tell — check manually", cls: "bg-warning-soft border-warning/30 text-warning" },
  issue: { head: "Issue found", cls: "bg-danger-soft border-danger/30 text-danger" },
};

export function PhotoCheck({ step, planId }: { step: BuildStep; planId: string }) {
  // Slice 1 (Track 0.5): the eval kill-switch stays — vision never ships
  // unevaluated — but the per-step reference photo is now OPTIONAL (the API
  // core already treats referenceBase64 as optional). The old double-gate
  // made this feature dead on every plan except a demo with checked-in
  // photos; now any plan gets "did I do it right?" once the eval passes.
  const [enabled, setEnabled] = useState(false);
  const [refSrc, setRefSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<PhotoVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setRefSrc(null);
    setVerdict(null);
    setError(null);
    setBusy(false);
    setEnabled(false);
    const ref = `/build-photos/${planId}/step-${step.stepNumber}.jpg`;
    fetch("/photo-check.pass.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((flag: { passed?: boolean } | null) => {
        if (!alive || flag?.passed !== true) return;
        setEnabled(true);
        const probe = new Image();
        probe.onload = () => {
          if (alive && probe.naturalWidth > 0) setRefSrc(ref);
        };
        probe.onerror = () => {};
        probe.src = ref;
        if (probe.complete && probe.naturalWidth > 0 && alive) setRefSrc(ref);
      });
    return () => {
      alive = false;
    };
  }, [planId, step.stepNumber]);

  if (!enabled) return null;

  const check = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setVerdict(null);
    setError(null);
    try {
      const [imageBase64, referenceBase64] = await Promise.all([
        downscaleToBase64(file),
        refSrc ? fetchAsBase64(refSrc) : Promise.resolve(null),
      ]);
      if (!imageBase64) throw new Error("empty image");
      const res = await fetch("/api/photo-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          referenceBase64,
          mediaType: "image/jpeg",
          stepTitle: step.title,
          connections: step.compiled?.connections?.map((c) => ({
            colorName: c.colorName,
            fromLabel: c.fromLabel,
            fromPin: c.fromPin,
            toLabel: c.toLabel,
            toPin: c.toPin,
          })),
          checks: step.compiled?.checks,
        }),
      });
      const data = (await res.json()) as PhotoVerdict & { error?: string };
      if (!res.ok || !data.verdict) {
        setError(data.error || "The photo checker isn't available right now.");
        diagLog("api_error", `photo-check ${res.status}`);
      } else {
        setVerdict({ verdict: data.verdict, detail: data.detail });
      }
    } catch (e) {
      setError("The photo checker isn't reachable right now.");
      diagLog("api_error", `photo-check: ${String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) check(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full min-h-11 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-text-secondary cursor-pointer hover:bg-surface-overlay disabled:opacity-50 disabled:cursor-default"
      >
        {busy ? "Checking your photo…" : verdict || error ? "📷 Check another photo" : "📷 Did I do it right? Snap a photo"}
      </button>
      <p className="mt-1 text-[10px] text-text-muted">Your photo is sent to AI for checking.</p>
      {verdict && (
        <div className={`mt-2 p-3 rounded-xl border ${VERDICT_STYLE[verdict.verdict].cls}`}>
          <p className="text-xs font-semibold">{VERDICT_STYLE[verdict.verdict].head}</p>
          <p className="text-xs text-text mt-1 leading-relaxed">{verdict.detail}</p>
          <p className="text-[10px] text-text-muted mt-1.5">
            AI check — the manual checklist above is the source of truth.
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-text-secondary">{error} Use the manual checklist above.</p>}
    </div>
  );
}
