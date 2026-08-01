"use client";

/**
 * Part Scan panel — single scan, batch wizard, file upload.
 * Manual BOM pick always available when vision fails or is offline.
 */

import { useCallback, useMemo, useState } from "react";
import type { BuildPlan, Part } from "@/lib/types";
import {
  candidatesFromParts,
  confidenceLabel,
  loadBenchInventory,
  orientationTipsForCatalog,
  upsertBenchItem,
  removeBenchItem,
  coverageStats,
  unscannedParts,
  type BenchInventory,
  type ScanMatchResult,
} from "@/lib/part-scan";
import { partCatalogId } from "@/lib/part-identity";
import { CameraCapture } from "./camera-capture";

function dataUrlToBase64(dataUrl: string): {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
} {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (m) {
    return {
      mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp",
      data: m[2]!,
    };
  }
  return {
    mediaType: "image/jpeg",
    data: dataUrl.replace(/^data:[^;]+;base64,/, ""),
  };
}

type PanelMode = "camera" | "file" | "batch";

export function PartScanPanel({
  plan,
  onInventoryChange,
  onClose,
}: {
  plan: BuildPlan;
  onInventoryChange?: (inv: BenchInventory) => void;
  onClose?: () => void;
}) {
  const [inv, setInv] = useState(() => loadBenchInventory(plan.id));
  const [mode, setMode] = useState<PanelMode>("batch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [match, setMatch] = useState<ScanMatchResult | null>(null);
  const [manualPartId, setManualPartId] = useState<string>("");
  const [batchIndex, setBatchIndex] = useState(0);

  const parts = plan.parts ?? [];
  const candidates = useMemo(() => candidatesFromParts(parts), [parts]);
  const scannedIds = useMemo(
    () => new Set(inv.items.map((i) => i.partId)),
    [inv.items]
  );
  const missing = useMemo(
    () => unscannedParts(parts, scannedIds),
    [parts, scannedIds]
  );
  const stats = useMemo(
    () => coverageStats(inv, parts.map((p) => p.id)),
    [inv, parts]
  );

  const batchTarget: Part | null =
    mode === "batch" && missing.length > 0
      ? missing[Math.min(batchIndex, missing.length - 1)] ?? null
      : null;

  const partById = useCallback(
    (id: string): Part | undefined => parts.find((p) => p.id === id),
    [parts]
  );

  const pushInventory = (next: BenchInventory) => {
    setInv(next);
    onInventoryChange?.(next);
  };

  const runScan = async (dataUrl: string) => {
    setBusy(true);
    setError(null);
    setMatch(null);
    setPreview(dataUrl);
    const { data, mediaType } = dataUrlToBase64(dataUrl);
    try {
      const res = await fetch("/api/part-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: data,
          mediaType,
          candidates,
          focusPartId: batchTarget?.id,
          focusHint: batchTarget?.name,
        }),
      });
      const json = (await res.json()) as {
        match?: ScanMatchResult | null;
        error?: string;
      };
      if (!res.ok || !json.match) {
        setError(json.error || "Scan failed — pick the part manually below.");
        if (batchTarget) setManualPartId(batchTarget.id);
        setMatch(null);
        return;
      }
      setMatch(json.match);
      if (json.match.partId) setManualPartId(json.match.partId);
      else if (batchTarget) setManualPartId(batchTarget.id);
    } catch {
      setError("Network error — pick the part manually and save the photo.");
      if (batchTarget) setManualPartId(batchTarget.id);
    } finally {
      setBusy(false);
    }
  };

  const saveToBench = () => {
    const partId = match?.partId || manualPartId;
    if (!partId || !preview) {
      setError("Select which BOM part this is, then save.");
      return;
    }
    const part = partById(partId);
    if (!part) {
      setError("Unknown part id.");
      return;
    }
    const catalogId = part.catalogId ?? partCatalogId(part) ?? undefined;
    const next = upsertBenchItem(plan.id, {
      partId,
      catalogId,
      name: part.name,
      photoDataUrl: preview,
      confidence: match?.partId === partId ? match.confidence : "medium",
      cues: match?.cues ?? ["manual selection"],
      silkscreenText: match?.silkscreenText,
      visiblePins: match?.visiblePins,
      orientationTips: orientationTipsForCatalog(catalogId),
    });
    pushInventory(next);
    setPreview(null);
    setMatch(null);
    setManualPartId("");
    setError(null);

    // Advance batch queue
    if (mode === "batch") {
      const still = unscannedParts(
        parts,
        new Set(next.items.map((i) => i.partId))
      );
      setBatchIndex(0);
      if (still.length === 0) {
        /* complete */
      }
    }
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void runScan(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const skipBatchPart = () => {
    if (missing.length <= 1) {
      setBatchIndex(0);
      return;
    }
    setBatchIndex((i) => (i + 1) % missing.length);
    setPreview(null);
    setMatch(null);
    setError(null);
  };

  return (
    <div className="flex flex-col min-h-0 max-h-[min(90vh,760px)] bg-surface">
      <div className="shrink-0 px-4 py-3 border-b border-border-subtle flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Scan my parts</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Camera → match BOM → pad maps use your modules.{" "}
            <span className="font-semibold text-text">
              {stats.scanned}/{stats.total} scanned
            </span>
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-text-muted hover:text-text cursor-pointer"
            aria-label="Close part scan"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mode toggle */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["batch", "Batch all"],
              ["camera", "One part"],
              ["file", "Upload"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setPreview(null);
                setMatch(null);
                setError(null);
                setBatchIndex(0);
              }}
              className={`min-h-11 px-3 rounded-xl text-sm font-semibold cursor-pointer ${
                mode === id
                  ? "bg-accent text-white"
                  : "border border-border text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Batch progress */}
        {mode === "batch" && (
          <div className="rounded-xl border border-accent/30 bg-accent/8 p-3 space-y-2">
            {missing.length === 0 ? (
              <p className="text-sm font-semibold text-success">
                Bench complete — every BOM part has a photo.
              </p>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-accent">
                  Step {Math.min(batchIndex + 1, missing.length)} of {missing.length}{" "}
                  remaining
                </p>
                <p className="text-base font-bold text-text">
                  Show: {batchTarget?.name}
                </p>
                <p className="text-xs text-text-secondary">
                  {batchTarget?.specification || "Hold so silkscreen is readable."}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {missing.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setBatchIndex(i)}
                      className={`min-h-9 px-2 rounded-lg text-[11px] font-medium cursor-pointer border ${
                        i === batchIndex
                          ? "border-accent bg-accent text-white"
                          : "border-border text-text-secondary"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={skipBatchPart}
                  className="text-xs text-text-muted underline cursor-pointer min-h-11"
                >
                  Skip for now →
                </button>
              </>
            )}
          </div>
        )}

        {(mode === "camera" || mode === "batch") && !preview && missing.length > 0 && (
          <CameraCapture
            onCapture={(url) => void runScan(url)}
            onError={setError}
          />
        )}

        {mode === "batch" && missing.length === 0 && !preview && (
          <p className="text-sm text-text-secondary">
            You can still use &quot;One part&quot; to rescan a module.
          </p>
        )}

        {mode === "file" && !preview && (
          <label className="flex flex-col items-center justify-center min-h-40 rounded-xl border-2 border-dashed border-border bg-surface-overlay cursor-pointer px-4 py-8">
            <span className="text-sm font-semibold text-text">Choose a photo</span>
            <span className="text-xs text-text-muted mt-1">
              One module, silkscreen visible
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        {busy && (
          <p className="text-sm text-text-secondary" role="status">
            Reading silkscreen and matching BOM…
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-text">
            {error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Captured module"
              className="w-full max-h-48 object-contain rounded-xl border border-border bg-surface-raised"
            />

            {match && (
              <div className="rounded-xl border border-border bg-surface-overlay p-3 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">
                  Scan result · {confidenceLabel(match.confidence)}
                </p>
                {match.partId ? (
                  <p className="text-sm font-semibold text-text">
                    {partById(match.partId)?.name ?? match.partId}
                  </p>
                ) : (
                  <p className="text-sm text-text-secondary">No automatic match</p>
                )}
                {match.cues.length > 0 && (
                  <p className="text-xs text-text-secondary">
                    Saw: {match.cues.join(" · ")}
                  </p>
                )}
                {(match.silkscreenText?.length ?? 0) > 0 && (
                  <p className="text-xs text-text-secondary">
                    Silkscreen:{" "}
                    <span className="font-mono">{match.silkscreenText!.join(" · ")}</span>
                  </p>
                )}
                {(match.visiblePins?.length ?? 0) > 0 && (
                  <p className="text-xs text-text-secondary">
                    Pins:{" "}
                    <span className="font-mono font-semibold">
                      {match.visiblePins!.join(", ")}
                    </span>
                  </p>
                )}
                <p className="text-xs text-text-muted">{match.manualCheck}</p>
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                This photo is
              </span>
              <select
                value={manualPartId}
                onChange={(e) => setManualPartId(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
              >
                <option value="">Select BOM part…</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {inv.items.some((i) => i.partId === p.id) ? " (rescan)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveToBench}
                disabled={!manualPartId && !match?.partId}
                className="flex-1 min-h-11 rounded-xl bg-accent text-white text-sm font-bold cursor-pointer disabled:opacity-40"
              >
                Save to my bench
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setMatch(null);
                  setError(null);
                }}
                className="min-h-11 px-4 rounded-xl border border-border text-sm text-text-secondary cursor-pointer"
              >
                Retake
              </button>
            </div>
          </div>
        )}

        {/* Inventory grid */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
            My bench ({inv.items.length})
          </p>
          {inv.items.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No modules scanned yet. Use Batch all to walk every BOM part.
            </p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {inv.items.map((it) => (
                <li
                  key={it.id}
                  className="rounded-xl border border-border overflow-hidden bg-surface-raised flex flex-col"
                >
                  {it.photoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.photoDataUrl}
                      alt={it.name}
                      className="h-24 w-full object-cover"
                    />
                  ) : (
                    <div className="h-24 bg-surface-overlay" />
                  )}
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    <p className="text-xs font-semibold text-text line-clamp-2">
                      {it.name}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {confidenceLabel(it.confidence)}
                      {(it.visiblePins?.length ?? 0) > 0
                        ? ` · ${it.visiblePins!.slice(0, 3).join(",")}`
                        : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        pushInventory(removeBenchItem(plan.id, it.partId))
                      }
                      className="mt-auto text-xs text-danger min-h-11 cursor-pointer text-left"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
