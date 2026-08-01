/**
 * SanderGi PCB-OBB detector (YOLOv11n-obb → ONNX).
 *
 * Model: https://huggingface.co/SanderGi/PCB-OBB (from
 * https://github.com/SanderGi/PCB-Detection, MIT).
 * Output layout [1, 6, 8400]: cx, cy, w, h, conf, angle_rad (letterbox 640).
 *
 * Lazy-loads onnxruntime-web; never blocks app boot.
 */

import type { Pt } from "./homography";
import { orderCorners, type DetectResult } from "./board-detect";
import type { BoardRegionDetector } from "./detectors";

const MODEL_URL =
  process.env.NEXT_PUBLIC_SANDER_GI_OBB_URL ||
  "/models/ar/sander-gi-pcb-obb.onnx";
const INPUT = 640;
const CONF_THRESH = 0.35;

type OrtSession = {
  run: (
    feeds: Record<string, unknown>
  ) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  inputNames: string[];
  outputNames: string[];
};

type OrtTensor = new (
  type: string,
  data: Float32Array,
  dims: number[]
) => unknown;

let sessionPromise: Promise<OrtSession | null> | null = null;
let TensorCtor: OrtTensor | null = null;

export function sanderGiModelUrl(): string {
  return MODEL_URL;
}

/** Warm the session (call when opening Live AR). */
export function preloadSanderGiObb(): Promise<OrtSession | null> {
  if (!sessionPromise) sessionPromise = loadSession();
  return sessionPromise;
}

async function loadSession(): Promise<OrtSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const ort = await import("onnxruntime-web");
    // Serve ORT wasm from CDN (Next doesn't auto-expose node_modules/*.wasm)
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
    TensorCtor = ort.Tensor as unknown as OrtTensor;
    const session = (await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    })) as unknown as OrtSession;
    return session;
  } catch (e) {
    console.warn("[sander-gi-obb] failed to load model", e);
    return null;
  }
}

export class SanderGiObbDetector implements BoardRegionDetector {
  readonly id = "sander-gi-obb-onnx";

  detect(
    imageData: ImageData,
    fullW: number,
    fullH: number
  ): DetectResult | null {
    // Sync API required by BoardRegionDetector — use last async result.
    // Callers should use detectAsync for real inference.
    void imageData;
    void fullW;
    void fullH;
    return lastAsyncResult;
  }
}

let lastAsyncResult: DetectResult | null = null;

/**
 * Async detect: letterbox work ImageData, run OBB, map corners to full video space.
 * Work image is a downscale of the video; fullW/H are native video dims.
 */
export async function detectSanderGiObb(
  imageData: ImageData,
  fullW: number,
  fullH: number
): Promise<DetectResult | null> {
  if (!sessionPromise) sessionPromise = loadSession();
  const session = await sessionPromise;
  if (!session || !TensorCtor) {
    lastAsyncResult = null;
    return null;
  }

  const { tensor, meta } = letterboxToTensor(imageData);
  const inputName = session.inputNames[0] || "images";
  const feeds: Record<string, unknown> = {
    [inputName]: new TensorCtor("float32", tensor, [1, 3, INPUT, INPUT]),
  };

  let out: Record<string, { data: Float32Array; dims: number[] }>;
  try {
    out = await session.run(feeds);
  } catch (e) {
    console.warn("[sander-gi-obb] run failed", e);
    lastAsyncResult = null;
    return null;
  }

  const key = session.outputNames[0] || Object.keys(out)[0]!;
  const raw = out[key]!;
  // [1,6,8400] or [1,8400,6]
  const decoded = decodeObb(raw.data, raw.dims, CONF_THRESH);
  if (!decoded) {
    lastAsyncResult = null;
    return null;
  }

  // Corners in letterbox 640 space → work ImageData space → full video space
  const workW = imageData.width;
  const workH = imageData.height;
  const cornersWork = decoded.corners.map((p) =>
    letterboxToSource(p, meta, workW, workH)
  );
  // work is downscale of full video
  const sx = fullW / workW;
  const sy = fullH / workH;
  const cornersFull = orderCorners(
    cornersWork.map((p) => ({ x: p.x * sx, y: p.y * sy }))
  );

  const result: DetectResult = {
    quad: cornersFull,
    score: decoded.conf,
    method: "auto",
  };
  lastAsyncResult = result;
  return result;
}

interface LetterboxMeta {
  scale: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
}

function letterboxToTensor(imageData: ImageData): {
  tensor: Float32Array;
  meta: LetterboxMeta;
} {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const scale = Math.min(INPUT / srcW, INPUT / srcH);
  const nw = Math.round(srcW * scale);
  const nh = Math.round(srcH * scale);
  const padX = Math.floor((INPUT - nw) / 2);
  const padY = Math.floor((INPUT - nh) / 2);

  // Draw into offscreen canvas for resize
  const c = document.createElement("canvas");
  c.width = INPUT;
  c.height = INPUT;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, INPUT, INPUT);
  // put ImageData scaled
  const tmp = document.createElement("canvas");
  tmp.width = srcW;
  tmp.height = srcH;
  tmp.getContext("2d")!.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, srcW, srcH, padX, padY, nw, nh);
  const { data } = ctx.getImageData(0, 0, INPUT, INPUT);

  const tensor = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4]! / 255;
    tensor[plane + i] = data[i * 4 + 1]! / 255;
    tensor[2 * plane + i] = data[i * 4 + 2]! / 255;
  }
  return {
    tensor,
    meta: { scale, padX, padY, srcW, srcH },
  };
}

function letterboxToSource(p: Pt, meta: LetterboxMeta, _w: number, _h: number): Pt {
  return {
    x: (p.x - meta.padX) / meta.scale,
    y: (p.y - meta.padY) / meta.scale,
  };
}

function decodeObb(
  data: Float32Array,
  dims: number[],
  confThresh: number
): { corners: Pt[]; conf: number; angle: number } | null {
  // dims [1,6,N] → N columns of 6
  let n = 8400;
  let get: (i: number, c: number) => number;
  if (dims.length === 3 && dims[1] === 6) {
    n = dims[2]!;
    get = (i, c) => data[c * n + i]!;
  } else if (dims.length === 3 && dims[2] === 6) {
    n = dims[1]!;
    get = (i, c) => data[i * 6 + c]!;
  } else {
    // fallback assume [1,6,N]
    n = Math.floor(data.length / 6);
    get = (i, c) => data[c * n + i]!;
  }

  let bestI = -1;
  let bestC = confThresh;
  for (let i = 0; i < n; i++) {
    const conf = get(i, 4);
    if (conf > bestC) {
      bestC = conf;
      bestI = i;
    }
  }
  if (bestI < 0) return null;

  const cx = get(bestI, 0);
  const cy = get(bestI, 1);
  const bw = get(bestI, 2);
  const bh = get(bestI, 3);
  const ang = get(bestI, 5);
  const corners = xywhrToCorners(cx, cy, bw, bh, ang);
  return { corners, conf: bestC, angle: ang };
}

/** OBB center format → 4 corners (same convention as Ultralytics). */
export function xywhrToCorners(
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number
): Pt[] {
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = w / 2;
  const dy = h / 2;
  const local: [number, number][] = [
    [-dx, -dy],
    [dx, -dy],
    [dx, dy],
    [-dx, dy],
  ];
  return local.map(([lx, ly]) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }));
}

export function isSanderGiReady(): boolean {
  return sessionPromise !== null;
}
