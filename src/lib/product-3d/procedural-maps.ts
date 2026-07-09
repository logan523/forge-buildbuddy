/**
 * Procedural CanvasTexture maps for parametric product realism.
 * No external image assets — deterministic noise/streaks for normal + roughness.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
  type Texture,
} from "three";

export type MapKind = "brushed_normal" | "fr4_roughness" | "pvc_normal" | "copper_normal";

const cache = new Map<string, CanvasTexture>();

function canvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }
  // Node/test path: OffscreenCanvas when available
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(size, size);
  }
  // Minimal stub for pure unit tests without canvas
  return {
    width: size,
    height: size,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
}

function finalize(
  tex: CanvasTexture,
  repeat = 2,
  /** Normal maps must NOT use sRGB or materials go black/wrong */
  kind: "normal" | "data" = "data"
): CanvasTexture {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  // three r152+: wrong colorSpace on normals = black PBR
  tex.colorSpace = kind === "normal" ? NoColorSpace : LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Brushed metal normal: horizontal streaks (tangent-space-ish blue base). */
export function makeBrushedMetalNormal(size = 128): CanvasTexture {
  const key = `brushed_normal_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 4, "normal"));
    return cache.get(key)!;
  }
  // Base normal flat (128,128,255)
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const n = 118 + Math.floor(Math.sin(y * 0.37) * 8 + (Math.random() * 14 - 7));
    ctx.fillStyle = `rgb(${n},${n},255)`;
    ctx.fillRect(0, y, size, 1);
    if (y % 3 === 0) {
      const x0 = Math.floor(Math.random() * size);
      ctx.fillStyle = `rgb(${n + 10},${n - 6},255)`;
      ctx.fillRect(x0, y, 12 + Math.floor(Math.random() * 40), 1);
    }
  }
  cache.set(key, finalize(tex, 6, "normal"));
  return cache.get(key)!;
}

/** FR4 / solder-mask roughness: fine noise (white=rough). */
export function makeFr4Roughness(size = 128): CanvasTexture {
  const key = `fr4_rough_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 3, "data"));
    return cache.get(key)!;
  }
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 140 + Math.floor(Math.random() * 90);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, finalize(tex, 4, "data"));
  return cache.get(key)!;
}

/** Soft PVC insulation grain normal. */
export function makePvcNormal(size = 64): CanvasTexture {
  const key = `pvc_normal_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 8, "normal"));
    return cache.get(key)!;
  }
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 8; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const r = 1 + Math.floor(Math.random() * 2);
    const n = 120 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${n},${n},255)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  cache.set(key, finalize(tex, 10, "normal"));
  return cache.get(key)!;
}

/** Copper pad annular micro-bump normal. */
export function makeCopperPadNormal(size = 64): CanvasTexture {
  const key = `copper_normal_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 1, "normal"));
    return cache.get(key)!;
  }
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let r = size * 0.42; r > size * 0.12; r -= 2) {
    const n = 125 + Math.floor((r / size) * 20);
    ctx.strokeStyle = `rgb(${n},${n},255)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  cache.set(key, finalize(tex, 1, "normal"));
  return cache.get(key)!;
}

/** Map kind → cached texture. */
export function getProceduralMap(kind: MapKind, size?: number): Texture {
  switch (kind) {
    case "brushed_normal":
      return makeBrushedMetalNormal(size ?? 128);
    case "fr4_roughness":
      return makeFr4Roughness(size ?? 128);
    case "pvc_normal":
      return makePvcNormal(size ?? 64);
    case "copper_normal":
      return makeCopperPadNormal(size ?? 64);
    default:
      return makePvcNormal(64);
  }
}

/** Test helper: texture image dimensions (or canvas size). */
export function proceduralMapSize(kind: MapKind): number {
  const t = getProceduralMap(kind);
  const img = t.image as { width?: number; height?: number } | undefined;
  return Math.min(img?.width ?? 64, img?.height ?? 64);
}

/** Clear cache (tests only). */
export function clearProceduralMapCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
