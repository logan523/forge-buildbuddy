import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import type { AssemblyStage, ProductScene } from "../types";
import { esc, productPaletteDefs } from "../palette";

/** Honest prototype board — not a finished product enclosure. */
export function renderBreadboard(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage,
  scene?: ProductScene
): string {
  const W = 460;
  const H = 280;
  const placed = new Set(stage.placedPartIds?.length ? stage.placedPartIds : stage.visiblePartIds);
  const hi = new Set(stage.highlightPartIds);
  const nodes = (scene?.nodes || []).filter((n) => n.role !== "mech").slice(0, 8);

  let chips = "";
  nodes.forEach((n, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 90 + col * 80;
    const y = 90 + row * 55;
    const isPl = stage.stepNumber === 0 || placed.has(n.partId);
    const isHi = hi.has(n.partId);
    const op = !isPl ? 0.2 : isHi ? 1 : 0.85;
    chips += `<g opacity="${op}">
      <rect x="${x}" y="${y}" width="64" height="36" rx="3" fill="#14532d" stroke="${isHi ? "#0891b2" : "#166534"}" stroke-width="${isHi ? 2 : 1}"${!isPl ? ' stroke-dasharray="3 2"' : ""}/>
      <text x="${x + 32}" y="${y + 22}" text-anchor="middle" font-size="8" fill="#e2e8f0" font-family="system-ui,sans-serif">${esc(n.glyph)}</text>
    </g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#fff7ed"/>
  <rect x="50" y="50" width="360" height="170" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
  <!-- hole grid -->
  ${Array.from({ length: 12 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) => {
      const x = 70 + c * 12;
      const y = 70 + r * 12;
      return `<circle cx="${x}" cy="${y}" r="1.2" fill="#d97706" opacity="0.35"/>`;
    }).join("")
  ).join("")}
  ${chips}
  <text x="230" y="250" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#92400e">${esc(spec.productCaption || "Breadboard prototype")}</text>
</svg>`;
}
