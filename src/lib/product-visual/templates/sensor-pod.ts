import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import { paintLayer } from "../formspec/layers";
import type { AssemblyStage } from "../types";
import { esc, paintAttrs, productPaletteDefs } from "../palette";

export function renderSensorPod(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage
): string {
  const W = 360;
  const H = 320;
  const shell = paintAttrs(paintLayer("shell", spec, stage));
  const shellAlt = shell.opacity < 0.3 ? paintAttrs(paintLayer("body", spec, stage)) : shell;
  const s = shellAlt.opacity < 0.3 ? paintAttrs(paintLayer("base", spec, stage)) : shellAlt;
  const brain = paintAttrs(paintLayer("brain", spec, stage));
  const sensor = paintAttrs(paintLayer("sensor", spec, stage));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#faf5ff"/>
  <ellipse cx="180" cy="270" rx="70" ry="12" fill="#e9d5ff" opacity="0.5"/>
  <g opacity="${s.opacity}" filter="url(#pvSoft)">
    <ellipse cx="180" cy="160" rx="90" ry="100" fill="url(#pvPla)" stroke="#7c3aed" stroke-width="2"${s.extra}/>
    <ellipse cx="180" cy="140" rx="55" ry="40" fill="#f5f3ff" opacity="0.7"/>
  </g>
  <g opacity="${sensor.opacity}">
    <circle cx="180" cy="130" r="22" fill="#ecfdf5" stroke="#059669" stroke-width="1.5"${sensor.extra}/>
    <circle cx="180" cy="130" r="8" fill="#34d399"/>
  </g>
  <g opacity="${brain.opacity}">
    <rect x="155" y="175" width="50" height="28" rx="3" fill="#14532d" stroke="#166534"${brain.extra}/>
  </g>
  <line x1="180" y1="60" x2="180" y2="40" stroke="#a78bfa" stroke-width="2"/>
  <circle cx="180" cy="36" r="5" fill="none" stroke="#7c3aed" stroke-width="1.5"/>
  <text x="180" y="300" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#57534e">${esc(spec.productCaption)}</text>
</svg>`;
}
