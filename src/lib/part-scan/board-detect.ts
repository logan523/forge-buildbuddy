/**
 * Lightweight PCB-ish quad detector in pure JS (no OpenCV binary).
 *
 * Strategy (inspired by document scanners / ARDW board find):
 * 1. Downscale frame for speed
 * 2. Gradient magnitude threshold → edge mask
 * 3. Contour trace on edges
 * 4. Approx to polygons; keep best convex 4-gon
 * 5. Order corners TL,TR,BR,BL
 *
 * Imperfect in clutter — Live AR falls back to 4-tap calibration + tracking.
 */

import type { Pt } from "./homography";
import { quadArea } from "./homography";

export interface DetectResult {
  quad: Pt[]; // TL,TR,BR,BL in full-res pixel space
  score: number;
  method: "auto" | "manual";
}

/** Detect largest board-like quad. Returns null if none. */
export function detectBoardQuad(
  imageData: ImageData,
  fullW: number,
  fullH: number
): DetectResult | null {
  const { width: w, height: h, data } = imageData;
  if (w < 32 || h < 32) return null;

  // Grayscale + Sobel magnitude
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    gray[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  }

  const mag = new Float32Array(w * h);
  let magMax = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1]! +
        gray[i - w + 1]! -
        2 * gray[i - 1]! +
        2 * gray[i + 1]! -
        gray[i + w - 1]! +
        gray[i + w + 1]!;
      const gy =
        -gray[i - w - 1]! -
        2 * gray[i - w]! -
        gray[i - w + 1]! +
        gray[i + w - 1]! +
        2 * gray[i + w]! +
        gray[i + w + 1]!;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > magMax) magMax = m;
    }
  }

  const thresh = magMax * 0.28;
  const edge = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) edge[i] = mag[i]! >= thresh ? 1 : 0;

  // Dilate slightly to connect edges
  const dil = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        edge[i] ||
        edge[i - 1] ||
        edge[i + 1] ||
        edge[i - w] ||
        edge[i + w]
      ) {
        dil[i] = 1;
      }
    }
  }

  const visited = new Uint8Array(w * h);
  let best: DetectResult | null = null;

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const start = y * w + x;
      if (!dil[start] || visited[start]) continue;
      const contour = traceContour(dil, visited, w, h, x, y);
      if (contour.length < 20) continue;

      const approx = rdp(contour, Math.max(3, Math.min(w, h) * 0.02));
      if (approx.length < 4) continue;

      // Take the 4 corners with largest area convex hull-ish subset
      const quad = bestQuadFromPoly(approx);
      if (!quad) continue;

      const ordered = orderCorners(quad);
      const area = quadArea(ordered);
      const frameArea = w * h;
      const frac = area / frameArea;
      if (frac < 0.04 || frac > 0.92) continue;

      const rectScore = rectangularity(ordered);
      if (rectScore < 0.55) continue;

      const score = frac * rectScore;
      if (!best || score > best.score) {
        // Scale to full resolution
        const sx = fullW / w;
        const sy = fullH / h;
        best = {
          score,
          method: "auto",
          quad: ordered.map((p) => ({ x: p.x * sx, y: p.y * sy })),
        };
      }
    }
  }

  return best;
}

function traceContour(
  mask: Uint8Array,
  visited: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number
): Pt[] {
  // Moore neighborhood walk for outer contour of blob containing (sx,sy)
  // First flood-fill blob to mark, then collect boundary
  const stack = [sy * w + sx];
  const blob: number[] = [];
  visited[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    blob.push(i);
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!mask[ni] || visited[ni]) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }
  if (blob.length < 30 || blob.length > w * h * 0.85) return [];

  // Boundary points
  const pts: Pt[] = [];
  for (const i of blob) {
    const x = i % w;
    const y = (i / w) | 0;
    let border = false;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) {
        border = true;
        break;
      }
    }
    if (border) pts.push({ x, y });
  }
  // Subsample for speed
  if (pts.length > 400) {
    const step = Math.ceil(pts.length / 300);
    return pts.filter((_, i) => i % step === 0);
  }
  return pts;
}

/** Ramer–Douglas–Peucker */
function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points.slice();
  let dmax = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i]!, points[0]!, points[end]!);
    if (d > dmax) {
      idx = i;
      dmax = d;
    }
  }
  if (dmax > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0]!, points[end]!];
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function bestQuadFromPoly(poly: Pt[]): Pt[] | null {
  if (poly.length === 4) return poly.slice();
  if (poly.length < 4) return null;
  // Brute combinations for small n, else take extreme points
  if (poly.length <= 10) {
    let best: Pt[] | null = null;
    let bestA = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++)
          for (let m = k + 1; m < n; m++) {
            const q = [poly[i]!, poly[j]!, poly[k]!, poly[m]!];
            const ordered = orderCorners(q);
            if (!isConvexQuad(ordered)) continue;
            const a = quadArea(ordered);
            if (a > bestA) {
              bestA = a;
              best = ordered;
            }
          }
    return best;
  }
  // Extreme points
  let minX = poly[0]!,
    maxX = poly[0]!,
    minY = poly[0]!,
    maxY = poly[0]!;
  for (const p of poly) {
    if (p.x < minX.x) minX = p;
    if (p.x > maxX.x) maxX = p;
    if (p.y < minY.y) minY = p;
    if (p.y > maxY.y) maxY = p;
  }
  // Diagonal extremes
  let minS = poly[0]!,
    maxS = poly[0]!,
    minD = poly[0]!,
    maxD = poly[0]!;
  for (const p of poly) {
    if (p.x + p.y < minS.x + minS.y) minS = p;
    if (p.x + p.y > maxS.x + maxS.y) maxS = p;
    if (p.x - p.y < minD.x - minD.y) minD = p;
    if (p.x - p.y > maxD.x - maxD.y) maxD = p;
  }
  return orderCorners([minS, minD, maxS, maxD]);
}

export function orderCorners(pts: Pt[]): Pt[] {
  // Sort by y then x for top/bottom, then left/right
  const sorted = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0]!, top[1]!, bot[1]!, bot[0]!]; // TL TR BR BL
}

function isConvexQuad(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** 1 = rectangle-ish (right angles + parallel sides) */
function rectangularity(q: Pt[]): number {
  const angles: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p0 = q[(i + 3) % 4]!;
    const p1 = q[i]!;
    const p2 = q[(i + 1) % 4]!;
    const v1x = p0.x - p1.x;
    const v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const d =
      (v1x * v2x + v1y * v2y) /
      ((Math.hypot(v1x, v1y) || 1) * (Math.hypot(v2x, v2y) || 1));
    const ang = Math.acos(Math.min(1, Math.max(-1, d)));
    angles.push(ang);
  }
  // Prefer ~π/2 corners
  let s = 0;
  for (const a of angles) {
    const err = Math.abs(a - Math.PI / 2) / (Math.PI / 2);
    s += 1 - Math.min(1, err);
  }
  return s / 4;
}

/** Track previous quad: refine with local search + lerp. */
export function smoothTrack(
  prev: Pt[] | null,
  next: Pt[] | null,
  alpha = 0.35
): Pt[] | null {
  if (!next) return prev;
  if (!prev) return next;
  // Match corners by nearest
  const matched: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    let best = next[0]!;
    let bd = Infinity;
    for (const c of next) {
      const d = Math.hypot(c.x - prev[i]!.x, c.y - prev[i]!.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    matched.push({
      x: prev[i]!.x + (best.x - prev[i]!.x) * alpha,
      y: prev[i]!.y + (best.y - prev[i]!.y) * alpha,
    });
  }
  return orderCorners(matched);
}
