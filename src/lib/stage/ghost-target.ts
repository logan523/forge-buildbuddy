/**
 * Ghost fit-targets — "see how each piece fits."
 *
 * For the parts arriving in the NEXT phase, emit their installed pose plus an
 * approach segment along the joint's assembly axis. The overlay renders the
 * real part mesh ghosted at the installed pose and a dashed approach line, so
 * a builder sees exactly where the piece seats and from which direction.
 *
 * Reads the SAME JointDef axis/explodeDistance fields resolveAssemblyFrame
 * animates with — the ghost can never drift from the actual fly-in path.
 */
import type { AssemblyFrame, AssemblyRecipe, ProductScene3D } from "@/lib/product-3d";

export interface GhostTarget {
  nodeId: string;
  /** Installed (rest) pose, part-local mm frame of the scene. */
  position: [number, number, number];
  rotation: [number, number, number];
  /** Approach segment (world mm): staged point → installed point. */
  approachFrom: [number, number, number];
  approachTo: [number, number, number];
}

function normalize(a: [number, number, number]): [number, number, number] {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** Ghosts for the phase AFTER the current one; empty when fully assembled. */
export function ghostTargetsForFrame(
  scene: ProductScene3D,
  recipe: AssemblyRecipe,
  frame: AssemblyFrame
): GhostTarget[] {
  const maxPhase = recipe.phases.length - 1;
  if (frame.phaseIndex >= maxPhase) return [];
  const arriving = new Set(recipe.phases[frame.phaseIndex + 1]!.addsParts);
  if (arriving.size === 0) return [];
  const nowPresent = new Set(frame.presentNodeIds);
  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));
  const partById = new Map(recipe.parts.map((p) => [p.id, p]));

  const out: GhostTarget[] = [];
  for (const joint of recipe.joints) {
    if (!arriving.has(joint.childPartId)) continue;
    const part = partById.get(joint.childPartId);
    const node = part ? nodeById.get(part.nodeId) : undefined;
    if (!node) continue;
    // Mid-fractional scrub the part is already flying in — ghost gone.
    if (nowPresent.has(node.id)) continue;
    const ax = normalize(joint.axis);
    out.push({
      nodeId: node.id,
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      approachFrom: [
        node.position[0] + ax[0] * joint.explodeDistance,
        node.position[1] + ax[1] * joint.explodeDistance,
        node.position[2] + ax[2] * joint.explodeDistance,
      ],
      approachTo: [...node.position] as [number, number, number],
    });
  }
  return out;
}
