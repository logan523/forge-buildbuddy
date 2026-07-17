/**
 * Derived assembly recipes — the "any project" unlock.
 *
 * The generic assembly engine (AssemblyRecipe → resolveAssemblyFrame) has been
 * proven by the hand-authored sat_clock recipe, but `getRecipeForTemplate`
 * returns null for every other template, silently disabling phases, scrub,
 * harness wiring, pads and per-pin guidance for 5 of 6 project shapes.
 *
 * deriveAssemblyRecipe() compiles a recipe FROM DATA for any scene:
 *   parts   ← scene nodes (anchors from the generalized pin authority)
 *   joints  ← layer-ranked insertion tree; axis = the node's explodeDir;
 *             distance from the rest-pose gap to its parent (Li–Agrawala:
 *             direction/distance/order over a hierarchy)
 *   phases  ← the shipped step-presence derivation (token-matching steps to
 *             nodes, cumulative, with its own too-weak-to-trust guard), one
 *             phase per step that introduces parts; canonical layer-order
 *             buckets as the fallback; authored step copy becomes callouts
 *   nets    ← exact net names from the electrical model, activating at the
 *             phase where the LAST member part arrives
 *
 * resolveAssemblyRecipe() keeps the hand-authored recipe as an override when
 * one exists (sat_clock stays golden) and derives for everything else — it
 * never returns null, which kills the recipe-gate that disabled half the app.
 *
 * Pure module: no React, no WebGL. Unit-tested in Node.
 */
import type { BuildPlan, BuildStep } from "@/lib/types";
import type { ElectricalModel } from "@/lib/electrical/types";
import type {
  AssemblyRecipe,
  JointDef,
  PartDef,
  PhaseDef,
  ProductScene3D,
  SceneNode3D,
} from "@/lib/product-3d";
import {
  deriveStepPresence,
  frameForNodeIds,
  getRecipeForTemplate,
  mapRefToNodeId,
  pinStubsForNode,
} from "@/lib/product-3d";

/** Foundation-first ordering across every template's layer vocabulary. */
const LAYER_RANK: Record<string, number> = {
  base: 0,
  mast: 1,
  shell: 1,
  body: 1,
  frame: 2,
  wheels: 3,
  power: 4,
  brain: 5,
  sensor: 6,
  face: 7,
  touch: 8,
  wings: 9,
};

export function canonicalLayerRank(layer: string): number {
  return LAYER_RANK[layer] ?? 5;
}

/** One PartDef per scene node — structural parts included (they assemble too). */
export function deriveParts(scene: ProductScene3D): PartDef[] {
  return scene.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    nodeId: n.id,
    layer: n.layer,
    colorKey: n.material.preset,
    anchors: pinStubsForNode(n).map((p) => ({
      name: p.name,
      local: [...p.local] as [number, number, number],
    })),
  }));
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Joints as an insertion tree: walk nodes foundation-first; each node attaches
 * to its authored parent when present, else the nearest already-placed node.
 * Exactly nodes.length - 1 joints; the first-ranked node is the root.
 */
export function deriveJoints(nodes: SceneNode3D[]): JointDef[] {
  const ranked = [...nodes].sort(
    (a, b) => canonicalLayerRank(a.layer) - canonicalLayerRank(b.layer)
  );
  const placed: SceneNode3D[] = [];
  const joints: JointDef[] = [];
  for (const n of ranked) {
    if (placed.length === 0) {
      placed.push(n);
      continue;
    }
    const authored = n.parentId ? placed.find((p) => p.id === n.parentId) : undefined;
    const parent =
      authored ??
      placed.reduce((best, p) =>
        dist(n.position, p.position) < dist(n.position, best.position) ? p : best
      );
    joints.push({
      id: `j-${parent.id}-${n.id}`,
      parentPartId: parent.id,
      childPartId: n.id,
      axis: n.explodeDir ?? [0, 1, 0],
      // Peel distance from the rest-pose gap — nestled parts get a modest
      // pull, outboard parts a bigger one; clamped to craft-photo sanity.
      explodeDistance: clamp(dist(n.position, parent.position) * 1.5, 18, 60),
    });
    placed.push(n);
  }
  return joints;
}

/** First sentence of a description, for compact callouts. */
function firstSentence(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^[^.!?]{10,140}[.!?]/);
  return (m ? m[0] : text.slice(0, 140)).trim() || fallback;
}

interface PhasePlanEntry {
  /** node ids arriving at this phase */
  arrivals: string[];
  /** plan steps mapped onto this phase */
  steps: BuildStep[];
}

/** Compress per-step arrivals into phases (steps that add nothing fold in). */
function phasesFromPresence(
  steps: BuildStep[],
  presence: NonNullable<ReturnType<typeof deriveStepPresence>>
): { entries: PhasePlanEntry[]; stepToPhaseIndex: number[] } {
  const entries: PhasePlanEntry[] = [];
  const stepToPhaseIndex: number[] = [];
  steps.forEach((step, i) => {
    const arrived = [...(presence.arrivedByStep.get(i) ?? [])];
    if (i === 0) {
      // Phase 0 additionally seats every never-mentioned structural node.
      const base = [...(presence.presentByStep.get(0) ?? [])];
      entries.push({ arrivals: [...new Set([...base, ...arrived])], steps: [step] });
    } else if (arrived.length > 0) {
      entries.push({ arrivals: arrived, steps: [step] });
    } else {
      entries[entries.length - 1]!.steps.push(step);
    }
    stepToPhaseIndex.push(entries.length - 1);
  });
  return { entries, stepToPhaseIndex };
}

/** Fallback: bucket nodes by canonical layer rank (foundation → wings). */
function phasesFromLayers(
  nodes: SceneNode3D[],
  steps: BuildStep[]
): { entries: PhasePlanEntry[]; stepToPhaseIndex: number[] } {
  const buckets = new Map<number, string[]>();
  for (const n of nodes) {
    const r = canonicalLayerRank(n.layer);
    buckets.set(r, [...(buckets.get(r) ?? []), n.id]);
  }
  const entries = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ids]) => ({ arrivals: ids, steps: [] as BuildStep[] }));
  // Steps map proportionally across phases (same spirit as phaseIndexForStep's
  // unmatched-step fallback: never show the finished product mid-build).
  const stepToPhaseIndex = steps.map((_, i) =>
    steps.length <= 1
      ? entries.length - 1
      : Math.min(entries.length - 1, Math.round((i / (steps.length - 1)) * (entries.length - 1)))
  );
  stepToPhaseIndex.forEach((pi, si) => entries[pi]!.steps.push(steps[si]!));
  return { entries, stepToPhaseIndex };
}

/** Exact net names activating at the phase where their LAST member arrives. */
function netsByPhase(
  phaseOfNode: Map<string, number>,
  phaseCount: number,
  electrical: ElectricalModel | null | undefined,
  scene: ProductScene3D,
  plan: BuildPlan
): string[][] {
  const out: string[][] = Array.from({ length: phaseCount }, () => []);
  if (!electrical?.nets?.length) return out;
  for (const net of electrical.nets) {
    const memberNodeIds = net.members
      .map((m) => mapRefToNodeId(m.ref, scene.nodes, plan))
      .filter((id): id is string => !!id);
    if (memberNodeIds.length < 2) continue;
    const arrive = Math.max(...memberNodeIds.map((id) => phaseOfNode.get(id) ?? 0));
    out[Math.min(arrive, phaseCount - 1)]!.push(net.name.toLowerCase());
  }
  return out;
}

export function derivePhases(
  scene: ProductScene3D,
  plan: BuildPlan,
  parts: PartDef[],
  joints: JointDef[],
  electrical: ElectricalModel | null | undefined
): { phases: PhaseDef[]; stepToPhase: Record<string, number> } {
  const steps = plan.steps ?? [];
  const presence = steps.length
    ? deriveStepPresence(plan, steps, scene.nodes)
    : null;
  const { entries, stepToPhaseIndex } = presence
    ? phasesFromPresence(steps, presence)
    : phasesFromLayers(scene.nodes, steps);

  // Any node the derivation never placed lands in the FINAL phase — visible
  // late rather than silently dropped.
  const placedNodes = new Set(entries.flatMap((e) => e.arrivals));
  const strays = scene.nodes.filter((n) => !placedNodes.has(n.id)).map((n) => n.id);
  if (strays.length) entries[entries.length - 1]!.arrivals.push(...strays);

  const phaseOfNode = new Map<string, number>();
  entries.forEach((e, i) => e.arrivals.forEach((id) => phaseOfNode.set(id, i)));

  const nets = netsByPhase(phaseOfNode, entries.length, electrical, scene, plan);
  const labelOf = new Map(parts.map((p) => [p.id, p.label]));

  const phases: PhaseDef[] = entries.map((e, i) => {
    const step = e.steps[0];
    const arrivingLabels = e.arrivals.map((id) => labelOf.get(id) ?? id);
    const title =
      step?.title?.trim() ||
      (arrivingLabels.length
        ? `Add ${arrivingLabels.slice(0, 2).join(" + ")}${arrivingLabels.length > 2 ? "…" : ""}`
        : `Phase ${i + 1}`);
    const frame = frameForNodeIds(
      scene.nodes,
      e.arrivals.length ? e.arrivals : scene.nodes.map((n) => n.id),
      scene.rootScale,
      1.25
    );
    return {
      id: `phase-${i}`,
      index: i,
      title,
      // Prefer the real authored beginner prose over generated text.
      callout: firstSentence(
        step?.description,
        arrivingLabels.length ? `Place: ${arrivingLabels.join(", ")}.` : "Keep going."
      ),
      addsParts: e.arrivals,
      addsJoints: joints.filter((j) => e.arrivals.includes(j.childPartId)).map((j) => j.id),
      addsNets: nets[i]!,
      cameraHint: { position: frame.position, target: frame.target },
    };
  });

  // Trailing "complete" beat: whole product framed, nothing new to place.
  const whole = frameForNodeIds(
    scene.nodes,
    scene.nodes.map((n) => n.id),
    scene.rootScale,
    1.25
  );
  phases.push({
    id: "complete",
    index: phases.length,
    title: "Complete",
    callout: "Every part is in place.",
    addsParts: [],
    addsJoints: [],
    addsNets: ["*"],
    cameraHint: { position: whole.position, target: whole.target },
  });

  const stepToPhase: Record<string, number> = {};
  steps.forEach((s, i) => {
    if (s.mediaKind) stepToPhase[s.mediaKind] = stepToPhaseIndex[i]!;
  });
  return { phases, stepToPhase };
}

/** Compile a recipe from data for ANY template's scene. */
export function deriveAssemblyRecipe(
  scene: ProductScene3D,
  plan: BuildPlan,
  electrical: ElectricalModel | null | undefined
): AssemblyRecipe {
  const parts = deriveParts(scene);
  const joints = deriveJoints(scene.nodes);
  const { phases, stepToPhase } = derivePhases(scene, plan, parts, joints, electrical);
  return {
    templateId: scene.templateId,
    productLabel: plan.title || scene.templateId,
    parts,
    joints,
    phases,
    stepToPhase,
  };
}

/**
 * The single recipe entry point: hand-authored override wins (sat_clock stays
 * golden), derived recipe covers everything else. Never null.
 */
export function resolveAssemblyRecipe(
  scene: ProductScene3D,
  plan: BuildPlan
): AssemblyRecipe {
  return (
    getRecipeForTemplate(scene.templateId) ??
    deriveAssemblyRecipe(scene, plan, plan.electrical)
  );
}
