import type { BuildPlan } from "@/lib/types";
import type { AssemblyStage, ProductScene } from "./types";
import { renderProductFormSvg } from "./form";
import type { FormSpec } from "./formspec/types";

export function renderProductSvg(
  scene: ProductScene,
  stage: AssemblyStage,
  opts?: { showTech?: boolean; plan?: BuildPlan; formSpec?: FormSpec }
): string {
  const plan: BuildPlan =
    opts?.plan ||
    ({
      id: scene.id,
      title: scene.title,
      description: scene.title,
      difficulty: "beginner",
      estimatedTime: scene.estimatedTime || "",
      estimatedCost: "",
      parts: scene.nodes.map((n) => ({
        id: n.partId,
        name: n.label,
        specification: n.role,
        quantity: 1,
        ref: n.ref,
      })),
      tools: [],
      steps: [],
      wiringConnections: [],
      warnings: [],
      formSpec: opts?.formSpec,
    } as BuildPlan);

  return renderProductFormSvg(plan, scene, stage, {
    showTech: opts?.showTech,
    formSpec: opts?.formSpec || plan.formSpec,
  });
}

export function stageForStep(scene: ProductScene, stepIndex: number | "prep"): AssemblyStage {
  if (stepIndex === "prep" || (typeof stepIndex === "number" && stepIndex < 0)) {
    return scene.stages[0];
  }
  const s = scene.stages[(stepIndex as number) + 1];
  return s || scene.stages[scene.stages.length - 1] || scene.stages[0];
}
