import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import { paintLayer } from "../formspec/layers";
import type { AssemblyStage } from "../types";
import { esc, paintAttrs, productPaletteDefs } from "../palette";

export function renderRobotChassis(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage
): string {
  const W = 460;
  const H = 300;
  const body = paintAttrs(paintLayer("body", spec, stage));
  const wheels = paintAttrs(paintLayer("wheels", spec, stage));
  const brain = paintAttrs(paintLayer("brain", spec, stage));
  const sensor = paintAttrs(paintLayer("sensor", spec, stage));
  // fallbacks
  const bodyP = body.opacity < 0.3 ? paintAttrs(paintLayer("base", spec, stage)) : body;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <ellipse cx="230" cy="250" rx="140" ry="14" fill="#e2e8f0"/>
  <!-- chassis body -->
  <g opacity="${bodyP.opacity}" filter="url(#pvSoft)">
    <rect x="120" y="120" width="220" height="90" rx="14" fill="url(#pvPla)" stroke="#57534e" stroke-width="2"${bodyP.extra}/>
    <rect x="135" y="135" width="190" height="60" rx="6" fill="#fafaf9" opacity="0.5"/>
  </g>
  <!-- wheels -->
  <g opacity="${wheels.opacity}">
    <ellipse cx="145" cy="215" rx="28" ry="28" fill="#1e293b" stroke="#0f172a" stroke-width="2"${wheels.extra}/>
    <ellipse cx="145" cy="215" rx="12" ry="12" fill="#64748b"/>
    <ellipse cx="315" cy="215" rx="28" ry="28" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
    <ellipse cx="315" cy="215" rx="12" ry="12" fill="#64748b"/>
  </g>
  <!-- MCU -->
  <g opacity="${brain.opacity}">
    <rect x="190" y="145" width="70" height="40" rx="3" fill="#14532d" stroke="#166534"${brain.extra}/>
    <circle cx="245" cy="165" r="4" fill="#fbbf24"/>
  </g>
  <!-- front sensor -->
  <g opacity="${sensor.opacity}">
    <rect x="330" y="145" width="24" height="36" rx="4" fill="#fef3c7" stroke="#d97706"${sensor.extra}/>
    <circle cx="342" cy="158" r="5" fill="#f59e0b"/>
  </g>
  <text x="230" y="285" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#57534e">${esc(spec.productCaption)}</text>
</svg>`;
}
