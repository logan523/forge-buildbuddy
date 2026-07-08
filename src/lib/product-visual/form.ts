/**
 * Physical product form dispatch — FormSpec → template SVG.
 */
import type { BuildPlan } from "@/lib/types";
import type { AssemblyStage, ProductScene } from "./types";
import { resolveFormSpec } from "./formspec/resolve";
import { renderTemplate } from "./templates";
import type { FormSpec } from "./formspec/types";

export type { FormSpec, FormTemplateId } from "./formspec/types";
export { resolveFormSpec } from "./formspec/resolve";
export { matchFormSpec, scoreTemplates } from "./formspec/match";
export { parseFormSpec, sanitizeFormSpec } from "./formspec/schema";

/** @deprecated use resolveFormSpec(plan).templateId */
export function detectProductForm(plan: BuildPlan): FormSpec["templateId"] {
  return resolveFormSpec(plan).templateId;
}

export function renderProductFormSvg(
  plan: BuildPlan,
  scene: ProductScene,
  stage: AssemblyStage,
  opts?: { showTech?: boolean; formSpec?: FormSpec }
): string {
  const spec = opts?.formSpec || resolveFormSpec(plan);
  return renderTemplate(plan, spec, stage, scene, opts);
}
