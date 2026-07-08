import type { BuildPlan } from "@/lib/types";
import { buildProductScene } from "./build-scene";
import { renderProductSvg, stageForStep } from "./render-svg";
import { resolveFormSpec } from "./formspec/resolve";
import type { ProductVisual } from "./types";

export type {
  ProductScene,
  ProductNode,
  ProductVisual,
  AssemblyStage,
  ModuleRole,
  AssemblyMode,
} from "./types";
export { buildProductScene, classifyRole, matchPartsInStep, stepMode } from "./build-scene";
export { renderProductSvg, stageForStep } from "./render-svg";
export {
  resolveFormSpec,
  matchFormSpec,
  parseFormSpec,
  sanitizeFormSpec,
  detectProductForm,
} from "./form";
export type { FormSpec, FormTemplateId, FormGrade } from "./formspec/types";

/** Build deterministic physical product visual for a plan. */
export function buildProductVisual(plan: BuildPlan): ProductVisual {
  const formSpec = resolveFormSpec(plan);
  const planWithForm: BuildPlan = { ...plan, formSpec };
  const scene = buildProductScene(planWithForm);
  const heroSvg = renderProductSvg(scene, scene.stages[0], {
    showTech: false,
    plan: planWithForm,
    formSpec,
  });

  return {
    scene,
    heroSvg,
    form: formSpec.templateId,
    formSpec,
    svgForStep: (stepIndex, showTech = false) => {
      const stage = stageForStep(scene, stepIndex);
      return renderProductSvg(scene, stage, {
        showTech,
        plan: planWithForm,
        formSpec,
      });
    },
    stageForStep: (stepIndex) => stageForStep(scene, stepIndex),
  };
}
