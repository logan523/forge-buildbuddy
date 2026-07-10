/**
 * Deterministic step-render audit — the automated half of the step-review
 * loop. For every step it checks the invariants the 3D hero depends on, so
 * the "camera zooms to an unrelated item / black stage" class of bug is caught
 * mechanically (in tests + the grader script) instead of by eyeballing all N
 * steps of every plan.
 *
 * Pure data in, findings out — no WebGL. Mirrors how ProductAssemblyApp
 * resolves a step's scrub + focus, so a finding here means a real on-screen
 * defect. Reads step.compiled.focusPartIds (a plain field); does not import
 * the steps/ compiler.
 */

import type { BuildPlan, BuildStep } from "@/lib/types";
import { buildProductScene3D } from "./build-scene";
import { getRecipeForTemplate } from "./sat-clock-recipe";
import { resolveAssemblyFrame, phaseIndexForStep } from "./assembly-recipe";
import { frameForNodeIds } from "./cad-frame";
import type { AssemblyRecipe } from "./assembly-recipe";
import type { SceneNode3D } from "./types";

export interface StepRenderFinding {
  stepNumber: number;
  code:
    | "NO_FOCUS" // a wiring step resolved no camera focus → falls back to a guess
    | "FOCUS_UNRESOLVED" // focusPartIds match no scene node → join broken
    | "FOCUS_ABSENT" // a focus part isn't present at the step's phase → black/empty
    | "FOCUS_TOO_BROAD" // focus is ~the whole board → no useful zoom
    | "CAMERA_NAN" // degenerate framing → camera flies to nowhere
    | "EMPTY_STAGE"; // nothing present at this step → blank canvas
  severity: "error" | "warning";
  detail: string;
}

/**
 * The scrub a step renders at — the SINGLE source of truth shared by
 * ProductAssemblyApp (what renders) and this audit (what's validated), so the
 * two can never drift. Loose step type so both the app's prop and BuildStep fit.
 */
export function scrubForStep(
  recipe: AssemblyRecipe,
  step:
    | { title?: string; description?: string; mediaKind?: string; compiled?: { focusPartIds?: string[] } }
    | null
    | undefined,
  stepIndex: number,
  totalSteps: number
): number {
  const maxPhase = Math.max(0, recipe.phases.length - 1);
  // Wiring steps happen on the fully-assembled product (every wired part present).
  if (step?.compiled?.focusPartIds?.length) return maxPhase;
  return phaseIndexForStep(recipe, step, stepIndex, totalSteps);
}

function finite(v: [number, number, number]): boolean {
  return v.every((n) => Number.isFinite(n));
}

/** Audit a single step against the scene it will render. */
export function auditStepRender(
  step: BuildStep,
  stepIndex: number,
  totalSteps: number,
  nodes: SceneNode3D[],
  rootScale: number,
  recipe: AssemblyRecipe | null
): StepRenderFinding[] {
  const out: StepRenderFinding[] = [];
  const add = (code: StepRenderFinding["code"], severity: StepRenderFinding["severity"], detail: string) =>
    out.push({ stepNumber: step.stepNumber, code, severity, detail });

  const focusIds = step.compiled?.focusPartIds ?? [];
  const hasConnections = !!step.compiled?.connections?.length;

  if (hasConnections && focusIds.length === 0) {
    add("NO_FOCUS", "warning", "wiring step has connections but resolved no camera focus (partId join empty)");
  }

  const partIdCount = new Set(nodes.map((n) => n.partId).filter(Boolean)).size;
  const focusSet = new Set(focusIds);
  const focusNodes = nodes.filter((n) => n.partId && focusSet.has(n.partId));

  if (focusIds.length > 0 && focusNodes.length === 0) {
    add(
      "FOCUS_UNRESOLVED",
      "error",
      `focusPartIds [${focusIds.join(", ")}] match no scene node — the camera has nothing to frame`
    );
  }

  if (focusIds.length > 0 && partIdCount > 0 && focusIds.length >= partIdCount) {
    add("FOCUS_TOO_BROAD", "warning", `focus spans all ${partIdCount} parts — no useful zoom (frames the whole board)`);
  }

  if (recipe) {
    const scrub = scrubForStep(recipe, step, stepIndex, totalSteps);
    const frame = resolveAssemblyFrame(recipe, scrub);
    const present = new Set(frame.presentNodeIds);

    if (present.size === 0) {
      add("EMPTY_STAGE", "error", `no parts present at scrub ${scrub.toFixed(1)} — blank canvas`);
    }
    const absent = focusNodes.filter((n) => !present.has(n.id));
    if (absent.length > 0) {
      add(
        "FOCUS_ABSENT",
        "error",
        `focus part(s) ${absent.map((n) => n.partId).join(", ")} not present at this step's phase — camera frames empty space`
      );
    }
  }

  if (focusNodes.length > 0) {
    const cam = frameForNodeIds(nodes, focusNodes.map((n) => n.id), rootScale, 1.35);
    if (!finite(cam.position) || !finite(cam.target)) {
      add("CAMERA_NAN", "error", "framing produced non-finite camera coordinates — degenerate bbox");
    }
  }

  return out;
}

/** Audit every step of a (trust-pipeline-processed) plan. */
export function auditPlanRender(plan: BuildPlan): StepRenderFinding[] {
  const scene = buildProductScene3D(plan);
  const recipe = getRecipeForTemplate(scene.templateId) ?? null;
  const steps = plan.steps || [];
  return steps.flatMap((step, i) =>
    auditStepRender(step, i, steps.length, scene.nodes, scene.rootScale, recipe)
  );
}
