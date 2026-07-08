/**
 * Optional AI / external beauty mesh — DISPLAY ONLY.
 *
 * Never authority for layers, ERC, steps, or BOM.
 * ProductScene3D parametric nodes remain the product model.
 */
import type { BuildPlan } from "@/lib/types";
import type { LayerViewState } from "./types";
import { resolveFormSpec } from "@/lib/product-visual/formspec/resolve";

export type BeautyProvider = "meshy" | "tripo" | "manual" | "unknown";

export interface BeautyMeshSpec {
  /** HTTPS URL to .glb / .gltf (or data: for tests) */
  url: string;
  provider?: BeautyProvider;
  /** World-unit scale (default 1) */
  scale?: number;
  /** 0–1 underlay opacity (default 0.38) */
  opacity?: number;
  offset?: [number, number, number];
  rotation?: [number, number, number];
  /** Prompt used to generate (audit only) */
  prompt?: string;
  status?: "ready" | "pending" | "failed";
}

const DEFAULT_OPACITY = 0.38;
const DEFAULT_SCALE = 1;

const ALLOWED_EXT = [".glb", ".gltf"];

/** True only for safe mesh URLs we will load. */
export function isAllowedBeautyUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (u.length < 8 || u.length > 2048) return false;
  // data: URLs only for tiny test fixtures (not production assets)
  if (u.startsWith("data:model/gltf-binary") || u.startsWith("data:model/gltf+json")) {
    return u.length < 500_000;
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  // Prefer https; allow http only on localhost
  if (parsed.protocol === "http:") {
    if (!/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) return false;
  }
  const path = parsed.pathname.toLowerCase();
  // allow query-string signed CDN urls ending with ext or containing .glb
  if (ALLOWED_EXT.some((e) => path.endsWith(e))) return true;
  if (/\.glb(\?|$)/i.test(u) || /\.gltf(\?|$)/i.test(u)) return true;
  return false;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function asVec3(v: unknown, maxAbs = 20): [number, number, number] | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const a = Number(v[0]);
  const b = Number(v[1]);
  const c = Number(v[2]);
  if (![a, b, c].every(Number.isFinite)) return undefined;
  const clamp = (x: number) => Math.max(-maxAbs, Math.min(maxAbs, x));
  return [clamp(a), clamp(b), clamp(c)];
}

/** Soft-parse untrusted beautyMesh from plan / share / LLM. */
export function sanitizeBeautyMesh(input: unknown): BeautyMeshSpec | undefined {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : typeof o.meshUrl === "string" ? o.meshUrl.trim() : "";
  if (!isAllowedBeautyUrl(url)) return undefined;

  const providerRaw = typeof o.provider === "string" ? o.provider.toLowerCase() : "unknown";
  const provider: BeautyProvider =
    providerRaw === "meshy" || providerRaw === "tripo" || providerRaw === "manual"
      ? providerRaw
      : "unknown";

  const scale = typeof o.scale === "number" && Number.isFinite(o.scale) ? Math.max(0.01, Math.min(10, o.scale)) : DEFAULT_SCALE;
  const opacity =
    typeof o.opacity === "number" && Number.isFinite(o.opacity) ? clamp01(o.opacity) : DEFAULT_OPACITY;
  const offset = asVec3(o.offset) ?? asVec3(o.position);
  const rotation = asVec3(o.rotation, Math.PI * 2);
  const prompt = typeof o.prompt === "string" ? o.prompt.trim().slice(0, 500) : undefined;
  const statusRaw = typeof o.status === "string" ? o.status : "ready";
  const status =
    statusRaw === "pending" || statusRaw === "failed" || statusRaw === "ready" ? statusRaw : "ready";

  return {
    url,
    provider,
    scale,
    opacity,
    ...(offset ? { offset } : {}),
    ...(rotation ? { rotation } : {}),
    ...(prompt ? { prompt } : {}),
    status,
  };
}

/**
 * Authority rule: beauty is suppressed during peel / explode / pose edit.
 * Parametric layers must remain readable as the product model.
 */
export function beautyUnderlayAllowed(opts: {
  view: LayerViewState;
  editMode: boolean;
  userEnabled: boolean;
  spec?: BeautyMeshSpec | null;
}): boolean {
  if (!opts.userEnabled) return false;
  if (!opts.spec || opts.spec.status === "failed" || opts.spec.status === "pending") return false;
  if (!isAllowedBeautyUrl(opts.spec.url)) return false;
  if (opts.editMode) return false;
  if (opts.view.soloLayerId) return false;
  if (opts.view.explode > 0.05) return false;
  return true;
}

/** Effective opacity for underlay (never fully opaque over layers by default). */
export function beautyDisplayOpacity(spec: BeautyMeshSpec, userBoost = false): number {
  const base = spec.opacity ?? DEFAULT_OPACITY;
  if (userBoost) return clamp01(Math.max(base, 0.55));
  return clamp01(Math.min(base, 0.85));
}

/**
 * Build a text prompt suitable for Meshy/Tripo-style generators.
 * For external use only — never used as scene authority.
 */
export function buildBeautyPrompt(plan: BuildPlan): string {
  const form = plan.formSpec || resolveFormSpec(plan);
  const mats = form.materials || {};
  const bits = [
    form.productCaption || plan.title,
    `Physical product archetype: ${form.templateId.replace(/_/g, " ")}`,
    mats.base ? `base material ${mats.base}` : null,
    mats.frame ? `frame ${mats.frame}` : null,
    mats.face ? `display face ${mats.face}` : null,
    "clean product render, studio lighting, no text labels, no people",
    "single object on neutral ground, schematic proportions not cartoon",
  ].filter(Boolean);
  return bits.join(". ").slice(0, 480);
}

export interface BeautyResolveResult {
  spec: BeautyMeshSpec | null;
  /** Why beauty is absent or deferred */
  reason: "none" | "ready" | "invalid_url" | "pending" | "failed";
  /** Reminder for UI */
  disclaimer: string;
}

const DISCLAIMER =
  "Beauty mesh is visual only — layers and BOM are the real product model.";

/** Resolve beauty mesh for a plan (no network). */
export function resolveBeautyMesh(plan: BuildPlan): BeautyResolveResult {
  const raw = (plan as BuildPlan & { beautyMesh?: unknown }).beautyMesh;
  if (raw == null) {
    return { spec: null, reason: "none", disclaimer: DISCLAIMER };
  }
  const spec = sanitizeBeautyMesh(raw);
  if (!spec) {
    return { spec: null, reason: "invalid_url", disclaimer: DISCLAIMER };
  }
  if (spec.status === "pending") {
    return { spec, reason: "pending", disclaimer: DISCLAIMER };
  }
  if (spec.status === "failed") {
    return { spec: null, reason: "failed", disclaimer: DISCLAIMER };
  }
  return { spec, reason: "ready", disclaimer: DISCLAIMER };
}

/**
 * Whether the app is configured to call an external mesh provider.
 * Generation is opt-in via env — never automatic side effect in build pipeline.
 */
export function beautyGenerationConfigured(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): {
  configured: boolean;
  provider: BeautyProvider | null;
} {
  if (env.MESHY_API_KEY) return { configured: true, provider: "meshy" };
  if (env.TRIPO_API_KEY) return { configured: true, provider: "tripo" };
  return { configured: false, provider: null };
}

/**
 * Stub for external generation. Does NOT call network.
 * Returns a pending spec + prompt so callers can wire a real provider later.
 */
export function prepareBeautyGeneration(plan: BuildPlan): {
  prompt: string;
  pending: BeautyMeshSpec;
  configured: boolean;
  provider: BeautyProvider | null;
} {
  const { configured, provider } = beautyGenerationConfigured();
  const prompt = buildBeautyPrompt(plan);
  return {
    prompt,
    configured,
    provider,
    pending: {
      url: "https://example.invalid/pending.glb",
      provider: provider || "unknown",
      status: "pending",
      prompt,
      opacity: DEFAULT_OPACITY,
      scale: DEFAULT_SCALE,
    },
  };
}
