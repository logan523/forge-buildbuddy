/**
 * Wire draw-on timing — which assembly phase reveals each harness wire, and
 * how far along its draw-on animation is at a given scrub position.
 *
 * Deliberately OUTSIDE the recipe schema: assembly-recipe.ts knows nothing
 * about wires today and keeps it that way. PhaseDef.addsNets (exact lowercase
 * net names from the derived recipe; keyword fragments in the hand-authored
 * one; "*" = everything) is the only contract consumed.
 */
import type { AssemblyRecipe } from "@/lib/product-3d";

interface WireLike {
  netName: string;
}

/** Phase index at which a wire becomes active (last phase if unmatched). */
export function wireRevealPhaseIndex(wire: WireLike, recipe: AssemblyRecipe): number {
  const name = wire.netName.toLowerCase();
  const hit = recipe.phases.find((p) =>
    p.addsNets.some((n) => n === "*" || name.includes(n))
  );
  // Never silently hide an unmatched net — it appears with the final phase.
  return hit ? hit.index : recipe.phases.length - 1;
}

/**
 * Draw-on progress 0..1 for a wire at a continuous scrub position: the wire
 * draws across exactly one phase's scrub width (its reveal phase), clamped.
 */
export function wireRevealT(
  wire: WireLike,
  scrub: number,
  recipe: AssemblyRecipe
): number {
  const at = wireRevealPhaseIndex(wire, recipe);
  return Math.max(0, Math.min(1, scrub - at));
}
