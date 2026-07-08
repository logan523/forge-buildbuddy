/**
 * Persist 3D pose layouts per plan (localStorage). Pure helpers for tests.
 */
import type { PoseLayout3D } from "./types";

const PREFIX = "bb:product3d:poses:";

export function poseStorageKey(planId: string): string {
  return `${PREFIX}${planId || "unknown"}`;
}

export function loadPoseLayout(planId: string, storage?: Storage | null): PoseLayout3D | null {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return null;
    const raw = s.getItem(poseStorageKey(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PoseLayout3D;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePoseLayout(planId: string, poses: PoseLayout3D, storage?: Storage | null): void {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return;
    s.setItem(poseStorageKey(planId), JSON.stringify(poses));
  } catch {
    /* quota / private mode */
  }
}

export function clearPoseLayout(planId: string, storage?: Storage | null): void {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return;
    s.removeItem(poseStorageKey(planId));
  } catch {
    /* ignore */
  }
}

/** Merge a single node pose into layout. */
export function upsertNodePose(
  layout: PoseLayout3D,
  nodeId: string,
  pose: { position?: [number, number, number]; rotation?: [number, number, number] }
): PoseLayout3D {
  return {
    ...layout,
    [nodeId]: {
      ...layout[nodeId],
      ...pose,
    },
  };
}
