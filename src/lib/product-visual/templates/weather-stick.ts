import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import { paintLayer } from "../formspec/layers";
import type { AssemblyStage } from "../types";
import { esc, paintAttrs, productPaletteDefs } from "../palette";

export function renderWeatherStick(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage
): string {
  const W = 400;
  const H = 360;
  const h = spec.params.heightScale ?? 1;
  const mast = paintAttrs(paintLayer("frame", spec, stage));
  const head = paintAttrs(paintLayer("sensor", spec, stage));
  const base = paintAttrs(paintLayer("base", spec, stage));
  const brain = paintAttrs(paintLayer("brain", spec, stage));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#f0fdf4"/>
  <ellipse cx="200" cy="330" rx="90" ry="12" fill="#d6d3d1" opacity="0.6"/>
  <!-- ground stake base -->
  <g opacity="${base.opacity}">
    <ellipse cx="200" cy="310" rx="36" ry="10" fill="#78716c" stroke="#57534e"${base.extra}/>
  </g>
  <!-- mast -->
  <g opacity="${mast.opacity}">
    <rect x="194" y="${80 / h}" width="12" height="${230 * h}" rx="3" fill="url(#pvMetal)" stroke="#64748b"${mast.extra}/>
  </g>
  <!-- sensor head -->
  <g opacity="${head.opacity}" filter="url(#pvSoft)">
    <ellipse cx="200" cy="70" rx="48" ry="36" fill="#ecfdf5" stroke="#059669" stroke-width="2"${head.extra}/>
    <circle cx="200" cy="70" r="14" fill="#34d399" opacity="0.45"/>
    <circle cx="200" cy="70" r="6" fill="#047857"/>
  </g>
  <!-- small MCU brick on mast -->
  <g opacity="${brain.opacity}">
    <rect x="178" y="160" width="44" height="28" rx="3" fill="#14532d" stroke="#166534"${brain.extra}/>
    <circle cx="210" cy="174" r="3" fill="#fbbf24"/>
  </g>
  <text x="200" y="350" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#57534e">${esc(spec.productCaption)}</text>
</svg>`;
}
