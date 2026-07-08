import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import { paintLayer } from "../formspec/layers";
import type { AssemblyStage } from "../types";
import { esc, paintAttrs, productPaletteDefs } from "../palette";

export function renderBoxedGadget(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage
): string {
  const W = 440;
  const H = 300;
  const shell = paintAttrs(paintLayer("shell", spec, stage));
  const base = paintAttrs(paintLayer("base", spec, stage));
  const body = shell.opacity > 0.2 ? shell : base.opacity > 0.2 ? base : paintAttrs(paintLayer("body", spec, stage));
  const face = paintAttrs(paintLayer("face", spec, stage));
  const brain = paintAttrs(paintLayer("brain", spec, stage));
  const hasFace = (spec.materials.face || "none") !== "none" || face.opacity > 0.2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#f5f5f4"/>
  <ellipse cx="220" cy="260" rx="130" ry="14" fill="#e7e5e4"/>
  <g opacity="${body.opacity}" filter="url(#pvSoft)">
    <rect x="90" y="70" width="260" height="160" rx="18" fill="url(#pvPla)" stroke="#44403c" stroke-width="2.5"${body.extra}/>
    <rect x="105" y="85" width="230" height="130" rx="10" fill="#fafaf9" opacity="0.35"/>
  </g>
  ${
    hasFace
      ? `<g opacity="${face.opacity}">
    <rect x="145" y="105" width="150" height="70" rx="6" fill="#0b1220" stroke="#1e293b" stroke-width="2"${face.extra}/>
    <rect x="152" y="112" width="136" height="56" rx="3" fill="#020617"/>
    ${face.opacity > 0.3 ? `<text x="220" y="145" text-anchor="middle" font-family="ui-monospace,monospace" font-size="18" font-weight="700" fill="#67e8f9">OK</text>` : ""}
  </g>`
      : ""
  }
  <g opacity="${brain.opacity}">
    <rect x="185" y="185" width="70" height="28" rx="3" fill="#14532d" stroke="#166534"${brain.extra}/>
  </g>
  <text x="220" y="285" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#57534e">${esc(spec.productCaption)}</text>
</svg>`;
}
