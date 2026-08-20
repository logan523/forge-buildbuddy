"use client";

/**
 * Pre-flash display asset gallery — Track B3 (rebuild cycle). Generalizes
 * the exact technique proved out by hand this session (a self-built HTML
 * canvas simulator that regex-extracted real PROGMEM bytes and re-drew
 * them, so a preview could never drift from what the firmware actually
 * embeds) into a real, reusable product feature.
 *
 * Honest, deliberately narrow scope, stated plainly in the UI: this renders
 * exactly the bytes the firmware will draw — real bitmap assets, byte for
 * byte — but it does NOT simulate timing, animation sequencing, or any
 * dynamic logic (a rotation pool's random pick, a sensor-driven branch, a
 * WiFi retry). That would need a real C++ interpreter, which is the kind of
 * over-engineered scope CLAUDE.md already warns against. Same
 * "provably derived, never hand-drawn" principle the Conformance Ledger
 * applies to wiring — applied here to firmware's static assets.
 */

import { useEffect, useRef } from "react";
import type { CustomFirmwareSource } from "@/lib/types";
import { extractProgmemArrays, type ExtractedBitmap } from "@/lib/firmware/progmem-extract";
import { renderBitmap } from "@/lib/firmware/ssd1306-render";

const DIMENSION_LABEL: Record<ExtractedBitmap["dimensionSource"], string> = {
  "drawBitmap-call": "from drawBitmap()",
  "inferred-square": "size inferred — no drawBitmap() call found",
  unknown: "size unknown",
};

function BitmapThumb({ bitmap }: { bitmap: ExtractedBitmap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap.width || !bitmap.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height, pixels } = renderBitmap(bitmap.bytes, bitmap.width, bitmap.height);
    canvas.width = width;
    canvas.height = height;
    // TS's lib.dom types ImageData's constructor as requiring a
    // Uint8ClampedArray<ArrayBuffer> specifically (not the more general
    // ArrayBufferLike a freshly-allocated typed array is typed as) —
    // real-world buffers from `new Uint8ClampedArray(n)` are always plain
    // ArrayBuffers, never SharedArrayBuffer, so this cast is safe.
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  }, [bitmap]);

  if (!bitmap.width || !bitmap.height) return null;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-2 text-center">
      <canvas
        ref={canvasRef}
        className="w-full aspect-square bg-black rounded"
        style={{ imageRendering: "pixelated" }}
      />
      <p className="text-2xs font-mono text-text mt-1.5 truncate" title={bitmap.name}>
        {bitmap.name}
      </p>
      <p className="text-2xs text-text-muted">
        {bitmap.width}×{bitmap.height} · {bitmap.file}
      </p>
      {bitmap.dimensionSource === "inferred-square" && (
        <p className="text-2xs text-warning mt-0.5">{DIMENSION_LABEL[bitmap.dimensionSource]}</p>
      )}
    </div>
  );
}

export function DisplayPreview({ customFirmware }: { customFirmware: CustomFirmwareSource }) {
  const bitmaps = extractProgmemArrays(customFirmware.files).filter((b) => b.width && b.height);

  if (bitmaps.length === 0) {
    return (
      <p className="text-xs text-text-muted p-4">
        No display assets found — this firmware doesn&apos;t embed any PROGMEM bitmap arrays.
      </p>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-text-secondary leading-relaxed">
        Every bitmap this firmware can draw, extracted directly from its source — exactly what will
        be drawn, not when or in what sequence. Flash to a real board to see it live.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {bitmaps.map((b) => (
          <BitmapThumb key={`${b.file}:${b.name}`} bitmap={b} />
        ))}
      </div>
    </div>
  );
}
