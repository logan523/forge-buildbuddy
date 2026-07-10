/**
 * "The Next-Build Doorway."
 *
 * The confetti hits, you tap "I built it" — and instead of a dead end, we hand
 * you a concrete, cheap, only-slightly-harder next thing: "You already own 4 of
 * 6 parts. Build this next." Catches the beginner at peak dopamine so "I built
 * one" becomes "I build things."
 *
 * Ranks candidate builds by how much of your bench they reuse (part overlap),
 * then by difficulty one notch up. Pure — the candidate pool is passed in.
 */

import type { BuildPlan, Part } from "@/lib/types";
import { partCatalogId } from "@/lib/part-identity";

export interface RankedBuild {
  plan: BuildPlan;
  /** Parts you already have from the build you just finished. */
  sharedParts: number;
  totalParts: number;
  /** Parts you'd still need to buy. */
  newParts: number;
}

const DIFF_ORDER = ["beginner", "intermediate", "advanced"];

/** Identity for overlap: catalog id when known, else first two name words. */
function partKey(p: Part): string {
  return partCatalogId(p) ?? p.name.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
}

export function rankNextBuilds(
  finished: BuildPlan,
  candidates: BuildPlan[],
  max = 3
): RankedBuild[] {
  const owned = new Set((finished.parts || []).map(partKey));
  const finIdx = DIFF_ORDER.indexOf(finished.difficulty);
  return candidates
    .filter((c) => c.id !== finished.id && c.title !== finished.title)
    .map((c): RankedBuild => {
      const shared = (c.parts || []).filter((p) => owned.has(partKey(p))).length;
      const total = (c.parts || []).length;
      return { plan: c, sharedParts: shared, totalParts: total, newParts: total - shared };
    })
    .filter((r) => r.sharedParts > 0) // only suggest builds that reuse the bench
    .sort((a, b) => {
      if (b.sharedParts !== a.sharedParts) return b.sharedParts - a.sharedParts;
      // Prefer difficulty one notch UP (delta closest to +1: not easier, not a cliff).
      const sa = Math.abs(DIFF_ORDER.indexOf(a.plan.difficulty) - finIdx - 1);
      const sb = Math.abs(DIFF_ORDER.indexOf(b.plan.difficulty) - finIdx - 1);
      return sa - sb;
    })
    .slice(0, max);
}
