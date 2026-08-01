/**
 * Sparse Lucas–Kanade optical flow for 4 board corners.
 * Pure TypeScript — no OpenCV. Good enough for inter-frame pad lock.
 *
 * Classic LK: solve for (dx, dy) minimizing brightness constancy in a window:
 *   [ sum Ix²   sum IxIy ] [dx]   [ -sum Ix It ]
 *   [ sum IxIy  sum Iy²  ] [dy] = [ -sum Iy It ]
 */

import type { Pt } from "./homography";

export interface FlowResult {
  points: Pt[];
  /** Per-corner 0–1 (higher = better conditioned / smaller residual) */
  confidences: number[];
  /** Mean confidence */
  meanConfidence: number;
}

const WIN = 7; // half-window → 15×15
const ITER = 5;
const MIN_DET = 1e-3;

/** Grayscale float buffer (row-major). */
export type Gray = { data: Float32Array; w: number; h: number };

export function rgbaToGray(imageData: ImageData): Gray {
  const { width: w, height: h, data } = imageData;
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    g[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  }
  return { data: g, w, h };
}

function sample(g: Gray, x: number, y: number): number {
  // bilinear
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  if (x0 < 0 || y0 < 0 || x1 >= g.w || y1 >= g.h) {
    const cx = Math.min(g.w - 1, Math.max(0, x0));
    const cy = Math.min(g.h - 1, Math.max(0, y0));
    return g.data[cy * g.w + cx]!;
  }
  const ax = x - x0;
  const ay = y - y0;
  const i00 = g.data[y0 * g.w + x0]!;
  const i10 = g.data[y0 * g.w + x1]!;
  const i01 = g.data[y1 * g.w + x0]!;
  const i11 = g.data[y1 * g.w + x1]!;
  return (
    i00 * (1 - ax) * (1 - ay) +
    i10 * ax * (1 - ay) +
    i01 * (1 - ax) * ay +
    i11 * ax * ay
  );
}

/** Track points from prev gray → next gray. */
export function trackPointsLK(prev: Gray, next: Gray, points: Pt[]): FlowResult {
  const out: Pt[] = [];
  const confidences: number[] = [];

  for (const p of points) {
    let x = p.x;
    let y = p.y;
    let conf = 0;

    for (let it = 0; it < ITER; it++) {
      let sxx = 0,
        sxy = 0,
        syy = 0,
        sxt = 0,
        syt = 0;
      let n = 0;

      for (let dy = -WIN; dy <= WIN; dy++) {
        for (let dx = -WIN; dx <= WIN; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 1 || py < 1 || px >= prev.w - 1 || py >= prev.h - 1) continue;
          if (px < 1 || py < 1 || px >= next.w - 1 || py >= next.h - 1) continue;

          const Ix =
            (sample(prev, px + 1, py) - sample(prev, px - 1, py)) * 0.5;
          const Iy =
            (sample(prev, px, py + 1) - sample(prev, px, py - 1)) * 0.5;
          const It = sample(next, px, py) - sample(prev, px, py);

          sxx += Ix * Ix;
          sxy += Ix * Iy;
          syy += Iy * Iy;
          sxt += Ix * It;
          syt += Iy * It;
          n++;
        }
      }

      if (n < 20) {
        conf = 0;
        break;
      }

      const det = sxx * syy - sxy * sxy;
      let dx = 0;
      let dy = 0;

      if (Math.abs(det) >= MIN_DET) {
        // Full 2D LK
        dx = (-syy * sxt + sxy * syt) / det;
        dy = (sxy * sxt - sxx * syt) / det;
        conf = Math.min(1, Math.abs(det) / (n * n * 40 + 1));
      } else if (sxx > MIN_DET * 10) {
        // Degenerate: mostly horizontal gradient (typical PCB edge)
        dx = -sxt / sxx;
        dy = 0;
        conf = Math.min(1, sxx / (n * 80 + 1));
      } else if (syy > MIN_DET * 10) {
        dx = 0;
        dy = -syt / syy;
        conf = Math.min(1, syy / (n * 80 + 1));
      } else {
        conf = 0;
        break;
      }

      // Clamp step (prevent blow-up)
      dx = Math.max(-3, Math.min(3, dx));
      dy = Math.max(-3, Math.min(3, dy));
      x += dx;
      y += dy;

      if (dx * dx + dy * dy < 0.01) break;
    }

    // Clamp to image
    x = Math.min(next.w - 2, Math.max(1, x));
    y = Math.min(next.h - 2, Math.max(1, y));
    out.push({ x, y });
    confidences.push(conf);
  }

  const meanConfidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((a, b) => a + b, 0) / confidences.length;

  return { points: out, confidences, meanConfidence };
}

/**
 * Map points from work-canvas space → full display space (or reverse).
 */
export function scalePoints(pts: Pt[], sx: number, sy: number): Pt[] {
  return pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}
