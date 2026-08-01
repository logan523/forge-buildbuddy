/**
 * 4-point perspective (homography) — pure TypeScript, no OpenCV.
 * Maps board-plane UVs (0–1) onto camera pixels for true AR pin overlays.
 */

export type Pt = { x: number; y: number };

/** Unit square TL → TR → BR → BL (board UV plane). */
export const UNIT_QUAD: Pt[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * Compute 3×3 homography H (row-major, h33 = 1) mapping src → dst.
 * Uses DLT with Gaussian elimination on the 8×8 system.
 */
export function computeHomography(src: Pt[], dst: Pt[]): number[] | null {
  if (src.length < 4 || dst.length < 4) return null;
  // A is 8×8, b is 8
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: xs, y: ys } = src[i]!;
    const { x: xd, y: yd } = dst[i]!;
    A.push([xs, ys, 1, 0, 0, 0, -xs * xd, -ys * xd]);
    b.push(xd);
    A.push([0, 0, 0, xs, ys, 1, -xs * yd, -ys * yd]);
    b.push(yd);
  }
  const h8 = solveLinear(A, b);
  if (!h8) return null;
  return [h8[0]!, h8[1]!, h8[2]!, h8[3]!, h8[4]!, h8[5]!, h8[6]!, h8[7]!, 1];
}

/** Apply H to a point. */
export function applyHomography(H: number[], p: Pt): Pt {
  const w = H[6]! * p.x + H[7]! * p.y + H[8]!;
  if (Math.abs(w) < 1e-12) return { x: p.x, y: p.y };
  return {
    x: (H[0]! * p.x + H[1]! * p.y + H[2]!) / w,
    y: (H[3]! * p.x + H[4]! * p.y + H[5]!) / w,
  };
}

/** Inverse of a 3×3 homography (for click → UV). */
export function invertHomography(H: number[]): number[] | null {
  const a = H[0]!,
    b = H[1]!,
    c = H[2]!,
    d = H[3]!,
    e = H[4]!,
    f = H[5]!,
    g = H[6]!,
    h = H[7]!,
    i = H[8]!;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const D = c * h - b * i;
  const E = a * i - c * g;
  const F = b * g - a * h;
  const G = b * f - c * e;
  const Hh = c * d - a * f;
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv,
    D * inv,
    G * inv,
    B * inv,
    E * inv,
    Hh * inv,
    C * inv,
    F * inv,
    I * inv,
  ];
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function lerpQuad(a: Pt[], b: Pt[], t: number): Pt[] {
  return [0, 1, 2, 3].map((i) => lerpPt(a[i]!, b[i]!, t));
}

export function quadArea(q: Pt[]): number {
  // shoelace
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    s += q[i]!.x * q[j]!.y - q[j]!.x * q[i]!.y;
  }
  return Math.abs(s) / 2;
}

export function cornerDistance(a: Pt[], b: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const dx = a[i]!.x - b[i]!.x;
    const dy = a[i]!.y - b[i]!.y;
    s += Math.hypot(dx, dy);
  }
  return s / 4;
}

/** Gaussian elimination for n×n (n=8). */
function solveLinear(Ain: number[][], bin: number[]): number[] | null {
  const n = bin.length;
  const M = Ain.map((row, i) => [...row, bin[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-10) return null;
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}
