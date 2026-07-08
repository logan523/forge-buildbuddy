import type { BuildPlan } from "@/lib/types";
import type { FormLayerId, FormSpec } from "../formspec/types";
import { paintLayer } from "../formspec/layers";
import type { AssemblyStage } from "../types";
import { esc, paintAttrs, productPaletteDefs } from "../palette";

/** Default anchor points for drag handles (template space). */
export const SAT_CLOCK_ANCHORS: Record<string, { x: number; y: number; w: number; h: number; label: string }> = {
  base: { x: 115, y: 268, w: 250, h: 50, label: "Base" },
  frame: { x: 148, y: 80, w: 184, h: 110, label: "Frame" },
  face: { x: 170, y: 102, w: 140, h: 68, label: "Screen" },
  wings: { x: 40, y: 95, w: 100, h: 60, label: "Solar" },
  brain: { x: 196, y: 178, w: 54, h: 30, label: "MCU" },
  sensor: { x: 260, y: 180, w: 30, h: 24, label: "Sensor" },
  // Default: TOP of frame (user can drag left if preferred)
  touch: { x: 220, y: 52, w: 40, h: 36, label: "Button" },
  power: { x: 195, y: 255, w: 100, h: 30, label: "Battery" },
};

function tform(spec: FormSpec, layer: FormLayerId): string {
  const o = spec.layout?.[layer];
  if (!o) return "";
  const rot = o.rot ? ` rotate(${o.rot})` : "";
  return ` transform="translate(${o.x || 0},${o.y || 0})${rot}"`;
}

/** High-fidelity satellite desk clock — physical form. */
export function renderSatClock(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage,
  opts?: { showTech?: boolean }
): string {
  const W = 480;
  const H = 380;
  const wing = (spec.params.wingSpan ?? 1) * 88;
  const hScale = spec.params.heightScale ?? 1;

  const L = {
    base: paintLayer("base", spec, stage),
    frame: paintLayer("frame", spec, stage),
    face: paintLayer("face", spec, stage),
    brain: paintLayer("brain", spec, stage),
    power: paintLayer("power", spec, stage),
    wings: paintLayer("wings", spec, stage),
    sensor: paintLayer("sensor", spec, stage),
    touch: paintLayer("touch", spec, stage),
  };

  const a = {
    base: paintAttrs(L.base),
    frame: paintAttrs(L.frame),
    face: paintAttrs(L.face),
    brain: paintAttrs(L.brain),
    power: paintAttrs(L.power),
    wings: paintAttrs(L.wings),
    sensor: paintAttrs(L.sensor),
    touch: paintAttrs(L.touch),
  };

  const frameTop = 80 / hScale;
  const faceY = frameTop + 22;
  const frameH = 108 * hScale;

  const faceContent =
    L.face === "ghost"
      ? ""
      : `<text x="240" y="${faceY + 40}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="24" font-weight="700" fill="#67e8f9">12:42</text>
         <text x="240" y="${faceY + 58}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="#94a3b8">22°C · 48%</text>`;

  // Callout when face is highlighted (e.g. OLED prep step)
  const faceCallout =
    L.face === "highlight"
      ? `<g>
    <path d="M320 ${faceY + 20} L360 ${faceY - 10}" stroke="#0891b2" stroke-width="1.5" fill="none"/>
    <text x="365" y="${faceY - 14}" font-family="system-ui,sans-serif" font-size="10" fill="#0891b2" font-weight="600">Working on screen</text>
  </g>`
      : "";

  const caption = stage.stepNumber === 0 ? spec.productCaption : stage.caption;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(plan.title)}">
  ${productPaletteDefs()}
  <rect width="${W}" height="${H}" fill="#f4f1eb"/>
  <ellipse cx="240" cy="330" rx="175" ry="16" fill="#e7e5e4" opacity="0.75"/>

  <g${tform(spec, "base")} opacity="${a.base.opacity}" filter="url(#pvSoft)">
    <ellipse cx="240" cy="300" rx="125" ry="30" fill="url(#pvBamboo)" stroke="#8b6914" stroke-width="1.5"${a.base.extra}/>
    <ellipse cx="240" cy="292" rx="125" ry="30" fill="url(#pvBamboo)" stroke="#a67c2a" stroke-width="1.2"/>
    <ellipse cx="240" cy="292" rx="105" ry="22" fill="none" stroke="#c4a35a" stroke-width="0.9" opacity="0.55"/>
    <ellipse cx="240" cy="292" rx="48" ry="9" fill="#000" opacity="0.06"/>
  </g>

  <g${tform(spec, "frame")} opacity="${a.frame.opacity}">
    <rect x="166" y="${frameTop + 70}" width="9" height="${220 - frameTop}" rx="3.5" fill="url(#pvCopper)" stroke="#8b5a2b" stroke-width="0.8"${a.frame.extra}/>
    <rect x="305" y="${frameTop + 70}" width="9" height="${220 - frameTop}" rx="3.5" fill="url(#pvCopper)" stroke="#8b5a2b" stroke-width="0.8"/>
    <ellipse cx="170.5" cy="${frameTop + 70}" rx="5.5" ry="2.8" fill="#e8a87c"/>
    <ellipse cx="309.5" cy="${frameTop + 70}" rx="5.5" ry="2.8" fill="#e8a87c"/>
  </g>

  <g${tform(spec, "frame")} opacity="${a.frame.opacity}" filter="url(#pvSoft)">
    <rect x="148" y="${frameTop}" width="184" height="${frameH}" rx="7" fill="none" stroke="url(#pvBrass)" stroke-width="6"${a.frame.extra}/>
    <rect x="158" y="${frameTop + 10}" width="164" height="${frameH - 20}" rx="3" fill="#0c0c10" opacity="0.07"/>
    <circle cx="152" cy="${frameTop + 4}" r="4.5" fill="#daa520"/>
    <circle cx="328" cy="${frameTop + 4}" r="4.5" fill="#daa520"/>
    <circle cx="152" cy="${frameTop + frameH - 4}" r="4.5" fill="#daa520"/>
    <circle cx="328" cy="${frameTop + frameH - 4}" r="4.5" fill="#daa520"/>
    <line x1="240" y1="${frameTop}" x2="240" y2="${frameTop - 28}" stroke="#b8860b" stroke-width="2.2"/>
    <circle cx="240" cy="${frameTop - 32}" r="5.5" fill="none" stroke="#b8860b" stroke-width="1.6"/>
    <circle cx="240" cy="${frameTop - 32}" r="2.2" fill="#daa520"/>
  </g>

  <g${tform(spec, "wings")} opacity="${a.wings.opacity}" filter="url(#pvSoft)">
    <g transform="translate(${48 - (wing - 88) / 2},${frameTop + 18}) rotate(-14)">
      <rect x="0" y="0" width="${wing}" height="58" rx="3" fill="url(#pvSolar)" stroke="#334155" stroke-width="1.2"${a.wings.extra}/>
      ${[0, 1, 2, 3, 4].map((i) => `<line x1="${6 + i * (wing / 5)}" y1="5" x2="${6 + i * (wing / 5)}" y2="53" stroke="#475569" stroke-width="0.55"/>`).join("")}
    </g>
    <g transform="translate(${344 + (wing - 88) / 4},${frameTop + 18}) rotate(14)">
      <rect x="0" y="0" width="${wing}" height="58" rx="3" fill="url(#pvSolar)" stroke="#334155" stroke-width="1.2"/>
      ${[0, 1, 2, 3, 4].map((i) => `<line x1="${6 + i * (wing / 5)}" y1="5" x2="${6 + i * (wing / 5)}" y2="53" stroke="#475569" stroke-width="0.55"/>`).join("")}
    </g>
    <line x1="136" y1="${frameTop + 45}" x2="148" y2="${frameTop + 45}" stroke="#b8860b" stroke-width="2.5"/>
    <line x1="332" y1="${frameTop + 45}" x2="344" y2="${frameTop + 45}" stroke="#b8860b" stroke-width="2.5"/>
  </g>

  <g${tform(spec, "face")} opacity="${a.face.opacity}" filter="url(#pvSoft)">
    <rect x="170" y="${faceY}" width="140" height="68" rx="5" fill="#0b1220" stroke="#1e293b" stroke-width="2"${a.face.extra}/>
    <rect x="176" y="${faceY + 6}" width="128" height="56" rx="2" fill="#020617"/>
    ${faceContent}
    ${L.face === "highlight" ? `<rect x="167" y="${faceY - 3}" width="146" height="74" rx="7" fill="none" stroke="#0891b2" stroke-width="2" stroke-dasharray="5 3"/>` : ""}
  </g>
  ${faceCallout}

  <g${tform(spec, "brain")} opacity="${a.brain.opacity}">
    <rect x="196" y="${faceY + 72}" width="54" height="30" rx="2" fill="#14532d" stroke="#166534" stroke-width="1"${a.brain.extra}/>
    <rect x="202" y="${faceY + 77}" width="18" height="12" rx="1" fill="#22c55e" opacity="0.4"/>
    <circle cx="236" cy="${faceY + 86}" r="3.2" fill="#fbbf24"/>
  </g>

  <g${tform(spec, "sensor")} opacity="${a.sensor.opacity}">
    <rect x="260" y="${faceY + 76}" width="30" height="24" rx="2" fill="#ecfdf5" stroke="#059669" stroke-width="1"${a.sensor.extra}/>
    <circle cx="275" cy="${faceY + 88}" r="5.5" fill="#34d399" opacity="0.55"/>
  </g>

  <!-- Touch button — default top-center of frame -->
  <g${tform(spec, "touch")} opacity="${a.touch.opacity}">
    <circle cx="240" cy="58" r="14" fill="#ede9fe" stroke="#7c3aed" stroke-width="1.5"${a.touch.extra}/>
    <circle cx="240" cy="58" r="7" fill="#a78bfa" opacity="0.6"/>
    ${L.touch === "highlight" || L.touch === "placed" ? `<text x="240" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#7c3aed">Touch</text>` : ""}
  </g>

  <g${tform(spec, "power")} opacity="${a.power.opacity}" filter="url(#pvSoft)">
    <rect x="195" y="258" width="48" height="20" rx="10" fill="#334155" stroke="#1e293b" stroke-width="1"${a.power.extra}/>
    <rect x="197" y="260" width="9" height="16" rx="2" fill="#f8fafc"/>
    <text x="225" y="271" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" fill="#e2e8f0">16340</text>
    <rect x="250" y="260" width="40" height="18" rx="2" fill="#fef3c7" stroke="#d97706" stroke-width="1"/>
    <text x="274" y="272" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6.5" fill="#92400e">TP4056</text>
  </g>

  ${caption ? `<text x="240" y="358" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#57534e">${esc(caption.slice(0, 80))}</text>` : ""}

  <g opacity="0.7">
    <rect x="14" y="${H - 22}" width="11" height="9" rx="2" fill="#d4b483" stroke="#8b6914"/>
    <text x="28" y="${H - 15}" font-family="system-ui,sans-serif" font-size="8.5" fill="#64748b">installed</text>
    <rect x="82" y="${H - 22}" width="11" height="9" rx="2" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="2 1"/>
    <text x="96" y="${H - 15}" font-family="system-ui,sans-serif" font-size="8.5" fill="#64748b">coming</text>
  </g>
</svg>`;
}

/** Close-up of OLED pads for prep steps */
export function renderOledCloseup(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" width="100%" height="100%">
  <rect width="320" height="160" fill="#f8fafc"/>
  <rect x="40" y="30" width="160" height="100" rx="6" fill="#0b1220" stroke="#334155" stroke-width="2"/>
  <rect x="50" y="40" width="140" height="60" rx="2" fill="#020617"/>
  <text x="120" y="75" text-anchor="middle" fill="#67e8f9" font-family="ui-monospace,monospace" font-size="16" font-weight="700">OLED</text>
  <!-- 4 pads -->
  ${["GND", "VCC", "SCL", "SDA"].map((lab, i) => {
    const x = 60 + i * 35;
    return `<rect x="${x}" y="110" width="22" height="14" rx="2" fill="#fbbf24" stroke="#b45309"/>
    <text x="${x + 11}" y="140" text-anchor="middle" font-size="9" fill="#57534e" font-family="ui-monospace,monospace">${lab}</text>`;
  }).join("")}
  <text x="240" y="50" font-family="system-ui,sans-serif" font-size="11" fill="#334155" font-weight="600">Back of board</text>
  <text x="240" y="70" font-family="system-ui,sans-serif" font-size="10" fill="#64748b">4 holes after</text>
  <text x="240" y="86" font-family="system-ui,sans-serif" font-size="10" fill="#64748b">header removed</text>
</svg>`;
}
