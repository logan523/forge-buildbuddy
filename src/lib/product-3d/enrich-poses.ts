/**
 * Pose enrichment — LLM + deterministic FormSpec params → PoseLayout3D.
 * Authority remains parametric nodes; enrichment only nudges poses.
 */
import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "@/lib/product-visual/formspec/types";
import type { ProductScene3D, PoseLayout3D, NodePose3D, SceneNode3D } from "./types";
import { applyPoseLayout } from "./types";

const POS_MAX = 400; // mm
const ROT_MAX = Math.PI * 2;

/** Raw pose hint before resolve (supports delta-only). */
export interface PoseHint {
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Additive offset in mm (applied when position omitted, or added to position) */
  delta?: [number, number, number];
}

export type PoseHintMap = Record<string, PoseHint>;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function asVec3(v: unknown, maxAbs: number): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = Number(v[0]);
  const b = Number(v[1]);
  const c = Number(v[2]);
  if (![a, b, c].every((x) => Number.isFinite(x))) return null;
  return [clamp(a, -maxAbs, maxAbs), clamp(b, -maxAbs, maxAbs), clamp(c, -maxAbs, maxAbs)];
}

/**
 * Soft-parse untrusted scenePoses (LLM / share / storage).
 * Keys = node ids OR layer ids.
 * Values: { position?, rotation?, delta? }.
 */
export function sanitizePoseHints(input: unknown): PoseHintMap | undefined {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: PoseHintMap = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (!key || key.length > 64) continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const o = val as Record<string, unknown>;
    const hint: PoseHint = {};
    const pos = asVec3(o.position, POS_MAX);
    if (pos) hint.position = pos;
    const rot = asVec3(o.rotation, ROT_MAX);
    if (rot) hint.rotation = rot;
    const delta = asVec3(o.delta, POS_MAX);
    if (delta) hint.delta = delta;
    if (hint.position || hint.rotation || hint.delta) {
      out[key] = hint;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Sanitize into absolute PoseLayout3D when possible.
 * Pure-delta hints need resolveHintsOntoScene — this helper only keeps absolute position/rotation.
 */
export function sanitizePoseLayout(input: unknown): PoseLayout3D | undefined {
  const hints = sanitizePoseHints(input);
  if (!hints) return undefined;
  const out: PoseLayout3D = {};
  for (const [k, h] of Object.entries(hints)) {
    if (!h.position && !h.rotation) continue;
    const pose: NodePose3D = {};
    if (h.position && h.delta) {
      pose.position = [
        clamp(h.position[0] + h.delta[0], -POS_MAX, POS_MAX),
        clamp(h.position[1] + h.delta[1], -POS_MAX, POS_MAX),
        clamp(h.position[2] + h.delta[2], -POS_MAX, POS_MAX),
      ];
    } else if (h.position) {
      pose.position = h.position;
    }
    if (h.rotation) pose.rotation = h.rotation;
    if (pose.position || pose.rotation) out[k] = pose;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Expand layer-keyed / node-keyed hints onto concrete node ids.
 * Absolute position replaces; delta adds to current node pose.
 */
export function resolveHintsOntoScene(scene: ProductScene3D, hints?: PoseHintMap | null): PoseLayout3D {
  if (!hints || Object.keys(hints).length === 0) return {};
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const byLayer = new Map<string, SceneNode3D[]>();
  for (const n of scene.nodes) {
    const list = byLayer.get(n.layer) || [];
    list.push(n);
    byLayer.set(n.layer, list);
  }

  const out: PoseLayout3D = {};

  const applyToNode = (node: SceneNode3D, hint: PoseHint) => {
    const prev = out[node.id] || {};
    const basePos = prev.position || node.position;
    const next: NodePose3D = { ...prev };

    if (hint.position && hint.delta) {
      next.position = [
        clamp(hint.position[0] + hint.delta[0], -POS_MAX, POS_MAX),
        clamp(hint.position[1] + hint.delta[1], -POS_MAX, POS_MAX),
        clamp(hint.position[2] + hint.delta[2], -POS_MAX, POS_MAX),
      ];
    } else if (hint.position) {
      next.position = hint.position;
    } else if (hint.delta) {
      next.position = [
        basePos[0] + hint.delta[0],
        basePos[1] + hint.delta[1],
        basePos[2] + hint.delta[2],
      ];
    }
    if (hint.rotation) {
      next.rotation = hint.rotation;
    }
    if (next.position || next.rotation) out[node.id] = next;
  };

  for (const [key, hint] of Object.entries(hints)) {
    if (byId.has(key)) {
      applyToNode(byId.get(key)!, hint);
      continue;
    }
    const layerNodes = byLayer.get(key);
    if (layerNodes) {
      for (const n of layerNodes) applyToNode(n, hint);
    }
  }
  return out;
}

/** @deprecated use resolveHintsOntoScene */
export function resolvePosesOntoScene(scene: ProductScene3D, hints?: PoseLayout3D | null): PoseLayout3D {
  if (!hints) return {};
  // Convert layout-like map (position/rotation only) to hints
  const asHints: PoseHintMap = {};
  for (const [k, v] of Object.entries(hints)) {
    asHints[k] = { position: v.position, rotation: v.rotation };
  }
  return resolveHintsOntoScene(scene, asHints);
}

/**
 * Deterministic pose enrichment from FormSpec composition knobs.
 * heightScale / wingSpan — no LLM required.
 */
export function enrichPosesFromParams(scene: ProductScene3D, form?: FormSpec | null): PoseLayout3D {
  if (!form?.params) return {};
  const h = form.params.heightScale ?? 1;
  const wing = form.params.wingSpan ?? 1;
  const out: PoseLayout3D = {};

  if (Math.abs(h - 1) > 0.02) {
    for (const n of scene.nodes) {
      if (n.layer === "base") continue;
      out[n.id] = {
        ...out[n.id],
        position: [n.position[0], n.position[1] * h, n.position[2]],
      };
    }
  }

  if (Math.abs(wing - 1) > 0.02) {
    for (const n of scene.nodes) {
      if (n.layer !== "wings" && !n.id.startsWith("solar")) continue;
      const prev = out[n.id]?.position || n.position;
      out[n.id] = {
        ...out[n.id],
        position: [prev[0] * wing, prev[1], prev[2]],
      };
    }
  }

  return out;
}

/** Merge pose maps; later entries win per field. */
export function mergePoseLayouts(...maps: (PoseLayout3D | null | undefined)[]): PoseLayout3D {
  const out: PoseLayout3D = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [id, pose] of Object.entries(m)) {
      out[id] = {
        ...out[id],
        ...(pose.position ? { position: pose.position } : {}),
        ...(pose.rotation ? { rotation: pose.rotation } : {}),
      };
    }
  }
  return out;
}

export interface EnrichPosesResult {
  poses: PoseLayout3D;
  source: "none" | "params" | "plan" | "params+plan";
  enriched: boolean;
}

/**
 * Full enrichment chain for a template scene:
 * 1. FormSpec params (heightScale, wingSpan)
 * 2. plan.scenePoses (LLM / share) — layer or node keys, absolute or delta
 */
export function enrichScenePoses(
  scene: ProductScene3D,
  plan: BuildPlan,
  opts?: { form?: FormSpec | null }
): EnrichPosesResult {
  const form = opts?.form ?? plan.formSpec;
  const fromParams = enrichPosesFromParams(scene, form);
  const sceneAfterParams = applyPoseLayout(scene, fromParams);
  const hints = sanitizePoseHints(plan.scenePoses);
  const fromPlan = resolveHintsOntoScene(sceneAfterParams, hints);

  const poses = mergePoseLayouts(fromParams, fromPlan);
  const hasP = Object.keys(fromParams).length > 0;
  const hasL = Object.keys(fromPlan).length > 0;
  let source: EnrichPosesResult["source"] = "none";
  if (hasP && hasL) source = "params+plan";
  else if (hasP) source = "params";
  else if (hasL) source = "plan";

  return {
    poses,
    source,
    enriched: source !== "none",
  };
}

/** Apply enrichment and bump source when LLM poses present. */
export function applyEnrichmentToScene(scene: ProductScene3D, plan: BuildPlan): ProductScene3D {
  const { poses, enriched, source } = enrichScenePoses(scene, plan);
  if (!enriched) return scene;
  let next = applyPoseLayout(scene, poses);
  if (source === "plan" || source === "params+plan") {
    const hasLlmPoses = Boolean(sanitizePoseHints(plan.scenePoses));
    next = {
      ...next,
      source: hasLlmPoses ? "llm_enriched" : next.source,
      grade: next.grade === "assumed" && hasLlmPoses ? "medium" : next.grade,
    };
  }
  return next;
}
