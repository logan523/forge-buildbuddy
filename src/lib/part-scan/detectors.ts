/**
 * Pluggable board-region detectors.
 * Default: pure-JS multi-scale contour (no model weights).
 * Future: OnnxYoloBoardDetector implementing the same interface.
 */

import type { Pt } from "./homography";
import { detectBoardQuad, type DetectResult } from "./board-detect";

export interface BoardRegionDetector {
  readonly id: string;
  /** Detect board quad in full-res video pixel space. */
  detect(
    imageData: ImageData,
    fullW: number,
    fullH: number
  ): DetectResult | null;
}

/**
 * Multi-scale / multi-threshold contour detector.
 * Runs the base edge detector at two resolutions and picks best score.
 */
export class ContourBoardDetector implements BoardRegionDetector {
  readonly id = "contour-multiscale-v1";

  detect(
    imageData: ImageData,
    fullW: number,
    fullH: number
  ): DetectResult | null {
    // Primary: as provided (caller usually passes ~200px wide)
    const a = detectBoardQuad(imageData, fullW, fullH);

    // Secondary: half-res for large boards that dominate frame
    const { width: w, height: h } = imageData;
    if (w < 80 || h < 80) return a;

    const half = downscaleImageData(imageData, 0.55);
    const b = detectBoardQuad(half, fullW, fullH);

    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return a.score >= b.score ? a : b;
  }
}

function downscaleImageData(src: ImageData, scale: number): ImageData {
  const sw = src.width;
  const sh = src.height;
  const dw = Math.max(32, Math.round(sw * scale));
  const dh = Math.max(32, Math.round(sh * scale));
  // Nearest-neighbor into new buffer (no DOM canvas required — testable)
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y / dh) * sh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / dw) * sw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  // ImageData constructor available in browser + node 20+
  return new ImageData(out, dw, dh);
}

/**
 * SanderGi OBB sync façade — returns last async inference result.
 * Kick inference via detectSanderGiObb() from the Live AR loop.
 * @see sander-gi-obb.ts, docs/AR-VENDOR-EVAL.md
 */
export class SanderGiObbDetectorSync implements BoardRegionDetector {
  readonly id = "sander-gi-obb-onnx";
  private last: DetectResult | null = null;

  setLast(r: DetectResult | null): void {
    this.last = r;
  }

  detect(): DetectResult | null {
    return this.last;
  }
}

/** Primary then fallback (e.g. SanderGi → contour). */
export class CascadedBoardDetector implements BoardRegionDetector {
  readonly id: string;
  constructor(
    private readonly primary: BoardRegionDetector,
    private readonly fallback: BoardRegionDetector
  ) {
    this.id = `cascade(${primary.id}+${fallback.id})`;
  }

  detect(
    imageData: ImageData,
    fullW: number,
    fullH: number
  ): DetectResult | null {
    return (
      this.primary.detect(imageData, fullW, fullH) ??
      this.fallback.detect(imageData, fullW, fullH)
    );
  }
}

/** @deprecated use SanderGiObbDetectorSync */
export class OnnxYoloBoardDetector extends SanderGiObbDetectorSync {
  readonly id = "sander-gi-obb-onnx";
}

const contour = new ContourBoardDetector();
const sanderSync = new SanderGiObbDetectorSync();
let defaultDetector: BoardRegionDetector = new CascadedBoardDetector(
  sanderSync,
  contour
);

export function getBoardDetector(): BoardRegionDetector {
  return defaultDetector;
}

export function getSanderGiSyncFacade(): SanderGiObbDetectorSync {
  return sanderSync;
}

/** Tests / force contour-only. */
export function setBoardDetector(d: BoardRegionDetector): void {
  defaultDetector = d;
}

export function resetBoardDetector(): void {
  sanderSync.setLast(null);
  defaultDetector = new CascadedBoardDetector(sanderSync, contour);
}

export type { DetectResult, Pt };
