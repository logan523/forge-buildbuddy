/**
 * Procedural CanvasTexture maps for parametric product realism.
 * No external image assets — deterministic noise/streaks for normal + roughness.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

export type MapKind =
  | "brushed_normal"
  | "brushed_roughness"
  | "fr4_roughness"
  | "pvc_normal"
  | "copper_normal"
  | "oled_screen"
  | "silkscreen"
  | "solar_cells"
  | "solar_roughness"
  | "space_backdrop";

const cache = new Map<string, CanvasTexture>();

function canvasWH(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  // Node/test path: OffscreenCanvas when available
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  // Minimal stub for pure unit tests without canvas
  return {
    width,
    height,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
}

function canvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  return canvasWH(size, size);
}

function finalize(
  tex: CanvasTexture,
  repeat = 2,
  /** Normal maps must NOT use sRGB or materials go black/wrong; color = albedo/emissive sRGB */
  kind: "normal" | "data" | "color" = "data"
): CanvasTexture {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  // three r152+: wrong colorSpace on normals = black PBR
  tex.colorSpace =
    kind === "normal" ? NoColorSpace : kind === "color" ? SRGBColorSpace : LinearSRGBColorSpace;
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

/**
 * Brushed-metal roughness: horizontal machined streaks so the specular highlight
 * breaks into a grain instead of one uniform "CG metal" dot. Multiplies the
 * material roughness; kept mid-bright so metals stay shiny, just varied.
 */
export function makeBrushedRoughness(size = 128): CanvasTexture {
  const key = `brushed_rough_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 3, "data"));
    return cache.get(key)!;
  }
  const clamp = (n: number) => Math.max(95, Math.min(235, Math.round(n)));
  for (let y = 0; y < size; y++) {
    const base = clamp(165 + Math.sin(y * 0.9) * 28 + (Math.random() * 34 - 17));
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, y, size, 1);
    // Occasional fine along-grain scratch (locally shinier or rougher).
    if (y % 2 === 0) {
      const x0 = Math.floor(Math.random() * size);
      const w = 24 + Math.floor(Math.random() * 64);
      const s = clamp(base + (Math.random() > 0.5 ? 28 : -28));
      ctx.fillStyle = `rgb(${s},${s},${s})`;
      ctx.fillRect(x0, y, w, 1);
    }
  }
  cache.set(key, finalize(tex, 3, "data"));
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

export type OledScreenMode = "clock" | "readout";

export interface OledScreenOpts {
  mode: OledScreenMode;
  label?: string;
  time?: Date;
  temp?: string;
}

/**
 * Redraw an SSD1306-style face onto an existing oled_screen texture in place
 * (live clock updates call this + set needsUpdate — no new texture allocation).
 */
export function drawOledScreen(tex: CanvasTexture, opts: OledScreenOpts): void {
  const c = tex.image as HTMLCanvasElement | OffscreenCanvas | undefined;
  const ctx = c?.getContext?.("2d") as CanvasRenderingContext2D | null;
  if (!c || !ctx) return;
  const W = c.width;
  const H = c.height;

  // True-black background — bloom must only pick up the lit pixels
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const ink = "#dffcff"; // cool OLED white with a cyan cast
  const dim = "#7ce8f4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (opts.mode === "clock") {
    const t = opts.time ?? new Date();
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    ctx.fillStyle = dim;
    ctx.font = `600 ${Math.round(H * 0.14)}px ui-monospace, monospace`;
    ctx.fillText(
      t.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(),
      W / 2,
      H * 0.14
    );
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(H * 0.46)}px ui-monospace, monospace`;
    ctx.fillText(`${hh}:${mm}`, W / 2, H * 0.47);
    ctx.fillStyle = dim;
    ctx.font = `600 ${Math.round(H * 0.16)}px ui-monospace, monospace`;
    ctx.fillText(opts.temp ?? "23.4°C  41%", W / 2, H * 0.82);
  } else {
    const label = (opts.label || "FORGE").slice(0, 12).toUpperCase();
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(H * 0.3)}px ui-monospace, monospace`;
    ctx.fillText(label, W / 2, H * 0.38);
    ctx.fillStyle = dim;
    ctx.font = `600 ${Math.round(H * 0.16)}px ui-monospace, monospace`;
    ctx.fillText("READY", W / 2, H * 0.72);
  }

  // SSD1306 pixel-matrix illusion: dark gridlines every 2px (128×64 logical)
  ctx.strokeStyle = "rgba(0,0,0,0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 0; y <= H; y += 2) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();

  tex.needsUpdate = true;
}

/** Live OLED face (256×128, sRGB, nearest-filter) — emissiveMap for the glass plane. */
export function makeOledScreenMap(mode: OledScreenMode = "readout", label = ""): CanvasTexture {
  const key = `oled_screen_${mode}_${label}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvasWH(256, 128);
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  drawOledScreen(tex, { mode, label });
  finalize(tex, 1, "color");
  tex.magFilter = NearestFilter; // crisp pixel matrix up close
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** PCB silkscreen albedo: label, pin-1 dot, pads, trace hints on FR4 green. */
export function makeSilkscreenMap(label = "PCB"): CanvasTexture {
  const clean = label.slice(0, 14).toUpperCase();
  const key = `silkscreen_${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 1, "color"));
    return cache.get(key)!;
  }

  // Solder-mask green fills the whole canvas — UV bleed stays board-colored
  ctx.fillStyle = "#0f3d24";
  ctx.fillRect(0, 0, S, S);

  // Faint mask mottle
  for (let i = 0; i < 260; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  // Trace hints under the mask (slightly darker green)
  ctx.strokeStyle = "rgba(6,26,15,0.85)";
  ctx.lineWidth = 3;
  const traces: Array<[number, number, number, number, number]> = [
    [30, 200, 120, 200, 120],
    [40, 60, 40, 150, 96],
    [200, 40, 200, 130, 226],
  ];
  for (const [x0, y0, x1, y1, xe] of traces) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(xe, y1 + 30);
    ctx.stroke();
  }

  // Gold pad rings
  ctx.strokeStyle = "#c9a86a";
  ctx.lineWidth = 4;
  for (const [px, py] of [
    [36, 36],
    [220, 36],
    [36, 220],
    [220, 220],
  ]) {
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // White silkscreen
  ctx.fillStyle = "#e8f0ec";
  ctx.strokeStyle = "#e8f0ec";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, S - 28, S - 28); // outline frame
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 26px ui-monospace, monospace";
  ctx.fillText(clean, S / 2, S * 0.42);
  ctx.font = "600 14px ui-monospace, monospace";
  ctx.fillText("FORGE · REV A", S / 2, S * 0.56);
  // Pin-1 dot
  ctx.beginPath();
  ctx.arc(30, S - 30, 5, 0, Math.PI * 2);
  ctx.fill();

  cache.set(key, finalize(tex, 1, "color"));
  return cache.get(key)!;
}

/**
 * Monocrystalline PV albedo: a grid of chamfered deep-blue cells (the signature
 * cut corners let the near-black backsheet show through), a soft crystalline
 * sheen per cell, and the silver busbar + finger grid. Baked once so the panel
 * reads as real cells at ANY distance — where the old ~15 inline meshes
 * dissolved to a flat sheet and mirror-blew-out the studio HDRI.
 */
export function makeSolarCellMap(cols = 6, rows = 5): CanvasTexture {
  const key = `solar_cells_${cols}x${rows}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 1, "color"));
    return cache.get(key)!;
  }

  // Backsheet / inter-cell seam — near-black navy shows in gaps + cut corners
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, S, S);

  const gap = S * 0.012;
  const cw = (S - gap) / cols;
  const ch = (S - gap) / rows;
  const cham = Math.min(cw, ch) * 0.15; // monocrystalline corner cut

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = gap + col * cw + gap * 0.5;
      const y = gap + r * ch + gap * 0.5;
      const w = cw - gap;
      const h = ch - gap;

      // Chamfered octagon cell
      ctx.beginPath();
      ctx.moveTo(x + cham, y);
      ctx.lineTo(x + w - cham, y);
      ctx.lineTo(x + w, y + cham);
      ctx.lineTo(x + w, y + h - cham);
      ctx.lineTo(x + w - cham, y + h);
      ctx.lineTo(x + cham, y + h);
      ctx.lineTo(x, y + h - cham);
      ctx.lineTo(x, y + cham);
      ctx.closePath();

      // Crystalline sheen: center a shade brighter than the edges, subtle
      // per-cell tonal variation so the array isn't a flat wash.
      const tint = ((col * 7 + r * 13) % 13) - 6;
      const g = ctx.createRadialGradient(
        x + w * 0.5, y + h * 0.4, w * 0.04,
        x + w * 0.5, y + h * 0.5, w * 0.9
      );
      g.addColorStop(0, `rgb(${34 + tint},${64 + tint},${118 + tint})`);
      g.addColorStop(0.5, "#12295a");
      g.addColorStop(1, "#0a1838");
      ctx.fillStyle = g;
      ctx.fill();

      // Fine finger lines — silver grid bright enough to read at distance
      ctx.strokeStyle = "rgba(200,216,238,0.5)";
      ctx.lineWidth = 1.4;
      const nF = 8;
      for (let f = 1; f < nF; f++) {
        const fy = y + (h * f) / nF;
        ctx.beginPath();
        ctx.moveTo(x + cham * 0.5, fy);
        ctx.lineTo(x + w - cham * 0.5, fy);
        ctx.stroke();
      }
      // Two bright vertical busbars — the panel's signature grid
      ctx.fillStyle = "rgba(224,232,246,0.92)";
      for (const bx of [x + w * 0.34, x + w * 0.66]) {
        ctx.fillRect(bx - S * 0.005, y + cham * 0.3, S * 0.01, h - cham * 0.6);
      }
    }
  }
  cache.set(key, finalize(tex, 1, "color"));
  return cache.get(key)!;
}

/**
 * PV roughness companion: matte backsheet seams (bright = rough), semi-glossy
 * cell glass (mid), so the specular highlight breaks along the cell grid
 * instead of smearing the whole panel into one chrome sheet.
 */
export function makeSolarCellRoughness(cols = 6, rows = 5): CanvasTexture {
  const key = `solar_rough_${cols}x${rows}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 1, "data"));
    return cache.get(key)!;
  }
  // Rough seams everywhere
  ctx.fillStyle = "rgb(200,200,200)";
  ctx.fillRect(0, 0, S, S);
  const gap = S * 0.012;
  const cw = (S - gap) / cols;
  const ch = (S - gap) / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = gap + col * cw + gap * 0.5;
      const y = gap + r * ch + gap * 0.5;
      ctx.fillStyle = "rgb(96,96,96)"; // glossy cell glass
      ctx.fillRect(x, y, cw - gap, ch - gap);
    }
  }
  cache.set(key, finalize(tex, 1, "data"));
  return cache.get(key)!;
}

/**
 * Orbital-void backdrop for a large inverted sky sphere: a navy→black vertical
 * gradient with a deterministic scatter of crisp stars (bright cores so they
 * survive ACES tone mapping — drei's <Stars> washed out under the composer).
 */
export function makeSpaceBackdrop(): CanvasTexture {
  const key = "space_backdrop";
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 1024;
  const H = 512;
  const c = canvasWH(W, H);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  const tex = new CanvasTexture(c as HTMLCanvasElement);
  if (!ctx) {
    cache.set(key, finalize(tex, 1, "color"));
    return cache.get(key)!;
  }

  // Vertical gradient — faint navy up top, near-black at the base
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1430");
  g.addColorStop(0.5, "#070c1c");
  g.addColorStop(1, "#04060e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Deterministic star scatter (LCG — stable across renders + tests)
  let seed = 1337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  // A dim, sparse field (the user asked to dim the starfield). The backdrop is
  // toneMapped:false, so bright texels reach the composer's Bloom buffer raw;
  // 'lighten' keeps overlapping stars from summing, and the brightness cap sits
  // well under the Bloom threshold (0.96) — so the field stays a quiet scatter,
  // never a glow. (Was 5000 stars up to full-white.)
  ctx.globalCompositeOperation = "lighten";
  for (let i = 0; i < 2400; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const big = rnd() > 0.93;
    const r = big ? 0.9 + rnd() * 0.4 : 0.5 + rnd() * 0.6;
    const b = big ? 0.4 + rnd() * 0.14 : 0.28 + rnd() * 0.12;
    const t = rnd();
    ctx.beginPath();
    ctx.fillStyle =
      t > 0.9 ? `rgba(190,210,255,${b})` : t < 0.08 ? `rgba(255,236,214,${b})` : `rgba(255,255,255,${b})`;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  // 1× wrap: a 2:1 texture on the sphere gives ~square texels → round stars.
  // (Prior 3× horizontal tiling compressed the dots into vertical streaks.)
  const out = finalize(tex, 1, "color");
  out.repeat.set(1, 1);
  out.needsUpdate = true;
  cache.set(key, out);
  return out;
}

/** Map kind → cached texture. */
export function getProceduralMap(kind: MapKind, size?: number): Texture {
  switch (kind) {
    case "brushed_normal":
      return makeBrushedMetalNormal(size ?? 128);
    case "brushed_roughness":
      return makeBrushedRoughness(size ?? 128);
    case "fr4_roughness":
      return makeFr4Roughness(size ?? 128);
    case "pvc_normal":
      return makePvcNormal(size ?? 64);
    case "copper_normal":
      return makeCopperPadNormal(size ?? 64);
    case "oled_screen":
      return makeOledScreenMap("readout");
    case "silkscreen":
      return makeSilkscreenMap("PCB");
    case "solar_cells":
      return makeSolarCellMap();
    case "solar_roughness":
      return makeSolarCellRoughness();
    case "space_backdrop":
      return makeSpaceBackdrop();
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
