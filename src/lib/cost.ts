/**
 * What this build costs — one answer, with provenance.
 *
 * On 2026-08-24 `/build/solar-weather-clock` said `$25-40` in its header and
 * `~$60.10 · typically $29.70–$90.50` in its body, at the same time. The
 * header rendered `plan.estimatedCost`, a hand-authored string; the body
 * rendered `bomEstimate`, rolled up from the actual per-part prices. Neither
 * was wrong about where it came from. Nothing reconciled them, so the screen
 * disagreed with itself about the single number a builder decides on.
 *
 * Rule: real part prices win. An author's guess never renders next to money
 * derived from a priced BOM, and when it is all we have it says so.
 */

import type { BuildPlan } from "@/lib/types";
import { derived, unknown, type Claim } from "@/lib/claim";

const money = (n: number) => `$${Math.round(n)}`;

/**
 * The build's cost, strongest source first.
 *
 * 1. A BOM with at least one real price -> derived from those prices.
 * 2. Otherwise the authored estimate, labelled as the rough guess it is.
 * 3. Otherwise unknown, with what would close it.
 */
export function planCostClaim(plan: BuildPlan): Claim<string> {
  const bom = plan.bomEstimate;
  if (bom && bom.pricedCount > 0) {
    const range =
      bom.totalMax > bom.totalMin
        ? `${money(bom.totalMin)}–${money(bom.totalMax)}`
        : money(bom.totalMin);
    // Say so when the number covers only part of the BOM. A total that
    // quietly omits four unpriced parts reads as the price of the build.
    const suffix = bom.unpricedCount > 0 ? ` for ${bom.pricedCount} of ${bom.pricedCount + bom.unpricedCount} parts` : "";
    return derived(`${range}${suffix}`, "bomEstimate (real vendor prices)");
  }

  const authored = plan.estimatedCost?.trim();
  if (authored) return derived(`${authored} (rough estimate)`, "plan.estimatedCost (authored)");

  return unknown<string>("no prices yet — the parts haven't been matched to vendors");
}
