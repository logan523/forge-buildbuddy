/**
 * Pad-level 2D connection map — the beginner primary for soldering.
 *
 * Patterns drawn from open source / industry that actually help at the bench:
 * - Fritzing breadboard view: pin headers look like real modules, not blobs
 * - InteractiveHtmlBom: highlight the ONE footprint among many
 * - SparkFun / Adafruit: silkscreen text is the authority, huge color wire
 * - GitBuilding / iFixit: one physical action per view
 *
 * Renders FROM compiled MicroStep facts so pins/colors cannot drift from
 * the connection table. Board faces use RealPartSpec / SuperMini dual-header
 * layouts so neighbors match what's printed on the module.
 */

import type { MicroStep } from "@/lib/types";
import { escText } from "./svg-util";
import {
  pinMatches,
  pinoutForBoard,
  type BoardPinout,
} from "./board-pinouts";

function truncate(s: string, n: number): string {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

function textContrast(hex: string): string {
  const h = (hex || "#000").replace("#", "");
  if (h.length < 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#0f172a" : "#ffffff";
}

function padRect(
  x: number,
  y: number,
  w: number,
  h: number,
  pin: string,
  isActive: boolean,
  color: string
): string {
  const fill = isActive ? color : "#1e293b";
  const stroke = isActive ? "#0f172a" : "#475569";
  const sw = isActive ? 2.5 : 1;
  const txt = isActive ? textContrast(color) : "#94a3b8";
  const fontSize = pin.length > 5 ? 7 : pin.length > 3 ? 8 : 10;
  const ring = isActive
    ? `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="5" fill="none" stroke="${color}" stroke-width="2" opacity="0.9"/>
       <rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="7" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/>`
    : "";
  return `${ring}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
  <text x="${x + w / 2}" y="${y + h / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace,monospace" font-size="${fontSize}" font-weight="${isActive ? 700 : 500}" fill="${txt}">${escText(truncate(pin, 6))}</text>`;
}

function solderCallout(
  cx: number,
  topY: number,
  color: string,
  pinLabel: string
): string {
  return `
  <line x1="${cx}" y1="${topY + 4}" x2="${cx}" y2="${topY + 14}" stroke="${color}" stroke-width="2"/>
  <rect x="${cx - 48}" y="${topY - 22}" width="96" height="26" rx="6" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
  <text x="${cx}" y="${topY - 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="800" fill="${textContrast(color)}">SOLDER ${escText(truncate(pinLabel, 8))}</text>`;
}

/**
 * Dual-header MCU face (SuperMini class): left + right columns of silkscreen.
 * Wire exits the side of the active column.
 */
function drawDualHeader(opts: {
  bx: number;
  by: number;
  bw: number;
  bh: number;
  layout: BoardPinout;
  activePin: string;
  color: string;
  side: "left" | "right";
}): { svg: string; wireX: number; wireY: number } {
  const { bx, by, bw, bh, layout, activePin, color, side } = opts;
  const left = layout.left || [];
  const right = layout.right || [];
  const n = Math.max(left.length, right.length, 1);
  const padH = Math.min(22, (bh - 70) / n - 3);
  const padW = 28;
  const startY = by + 56;
  const leftX = bx + 10;
  const rightX = bx + bw - padW - 10;

  let activeCx = bx + bw / 2;
  let activeCy = by + bh / 2;
  let activeOnLeft = true;

  const leftPads = left
    .map((pin, i) => {
      const y = startY + i * (padH + 3);
      const active = pinMatches(pin, activePin);
      if (active) {
        activeCx = leftX + padW / 2;
        activeCy = y + padH / 2;
        activeOnLeft = true;
      }
      return padRect(leftX, y, padW, padH, pin, active, color);
    })
    .join("\n");

  const rightPads = right
    .map((pin, i) => {
      const y = startY + i * (padH + 3);
      const active = pinMatches(pin, activePin);
      if (active) {
        activeCx = rightX + padW / 2;
        activeCy = y + padH / 2;
        activeOnLeft = false;
      }
      return padRect(rightX, y, padW, padH, pin, active, color);
    })
    .join("\n");

  // Plastic header strips
  const stripH = n * (padH + 3) - 3 + 8;
  const leftStrip = `<rect x="${leftX - 4}" y="${startY - 4}" width="${padW + 8}" height="${stripH}" rx="3" fill="#334155" opacity="0.85"/>`;
  const rightStrip = `<rect x="${rightX - 4}" y="${startY - 4}" width="${padW + 8}" height="${stripH}" rx="3" fill="#334155" opacity="0.85"/>`;

  const callout = solderCallout(activeCx, startY - 18, color, activePin);

  // USB / chip suggestion for orientation (not electrical truth)
  const usb = `<rect x="${bx + bw / 2 - 22}" y="${by + 8}" width="44" height="14" rx="2" fill="#64748b" stroke="#0f172a" stroke-width="1"/>
  <text x="${bx + bw / 2}" y="${by + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="#f8fafc">USB</text>`;
  const chip = `<rect x="${bx + bw / 2 - 18}" y="${by + bh / 2 - 16}" width="36" height="32" rx="3" fill="#1e293b" opacity="0.5"/>`;

  const wireX = activeOnLeft ? bx : bx + bw;
  const wireY = activeCy;

  const svg = `
  <!-- dual-header ${side} -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="#86efac" stroke="#0f172a" stroke-width="2.5"/>
  <rect x="${bx + 6}" y="${by + 6}" width="${bw - 12}" height="${bh - 12}" rx="7" fill="#4ade80" opacity="0.25"/>
  <text x="${bx + bw / 2}" y="${by + 42}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#0f172a">${escText(truncate(layout.shortName, 20))}</text>
  ${usb}
  ${chip}
  ${leftStrip}
  ${rightStrip}
  ${leftPads}
  ${rightPads}
  ${callout}
`;
  return { svg, wireX, wireY };
}

/**
 * Single-row / edge-pad face (OLED, sensors, chargers).
 */
function drawSingleRow(opts: {
  bx: number;
  by: number;
  bw: number;
  bh: number;
  layout: BoardPinout;
  activePin: string;
  color: string;
  side: "left" | "right";
}): { svg: string; wireX: number; wireY: number } {
  const { bx, by, bw, bh, layout, activePin, color, side } = opts;
  const pins = layout.row || [];
  const padW = Math.min(32, (bw - 24) / Math.max(pins.length, 1) - 4);
  const padH = 36;
  const gap = 4;
  const totalW = pins.length * (padW + gap) - gap;
  const startX = bx + (bw - totalW) / 2;
  const padY = by + bh - padH - 18;

  let activeCx = bx + bw / 2;
  const pads = pins
    .map((pin, i) => {
      const x = startX + i * (padW + gap);
      const active = pinMatches(pin, activePin);
      if (active) activeCx = x + padW / 2;
      return padRect(x, padY, padW, padH, pin, active, color);
    })
    .join("\n");

  const header = `<rect x="${startX - 6}" y="${padY - 8}" width="${totalW + 12}" height="8" rx="2" fill="#334155"/>`;
  const callout = solderCallout(activeCx, padY - 12, color, activePin);
  const glass =
    layout.shortName.toLowerCase().includes("oled") ||
    layout.shortName.toLowerCase().includes("display")
      ? `<rect x="${bx + 18}" y="${by + 36}" width="${bw - 36}" height="${bh - 100}" rx="4" fill="#0f172a"/>
         <text x="${bx + bw / 2}" y="${by + bh / 2 - 20}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="#64748b">screen</text>`
      : `<rect x="${bx + 14}" y="${by + 40}" width="${bw - 28}" height="${bh - 110}" rx="6" fill="#94a3b8" opacity="0.35"/>`;

  const fill =
    layout.shortName.toLowerCase().includes("oled") ? "#1e3a5f" : "#cbd5e1";

  const wireX = side === "left" ? bx + bw : bx;
  const wireY = padY + padH / 2;

  const svg = `
  <!-- single-row ${side} -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${fill}" stroke="#0f172a" stroke-width="2.5"/>
  <text x="${bx + bw / 2}" y="${by + 24}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${fill === "#1e3a5f" ? "#e2e8f0" : "#0f172a"}">${escText(truncate(layout.shortName, 20))}</text>
  <text x="${bx + bw / 2}" y="${by + 40}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="${fill === "#1e3a5f" ? "#94a3b8" : "#475569"}">match silkscreen text</text>
  ${glass}
  ${header}
  ${pads}
  ${callout}
`;
  return { svg, wireX, wireY };
}

function drawBoardFace(opts: {
  bx: number;
  by: number;
  bw: number;
  bh: number;
  label: string;
  activePin: string;
  color: string;
  side: "left" | "right";
  partId?: string | null;
}): { svg: string; wireX: number; wireY: number } {
  const layout = pinoutForBoard(opts.label, opts.activePin, opts.partId);
  if (layout.kind === "dual_header") {
    return drawDualHeader({ ...opts, layout });
  }
  return drawSingleRow({ ...opts, layout });
}

/**
 * Two board faces + pad highlights. No mid-canvas jumper, pill, or chip.
 * SEV2: empty air between boards; wire identity is caption/footer only.
 */
export function svgPinConnection(m: MicroStep): string {
  const fromBoard = m.fromLabel || "Board A";
  const toBoard = m.toLabel || "Board B";
  const fromPin = m.fromPin || "?";
  const toPin = m.toPin || "?";
  const color = m.colorHex || "#64748b";
  // Near-black must never paint UI accents (reads as stray mid-canvas wire)
  const nearBlack = /^#?(1e293b|0f172a|000000|111827|000)$/i.test(color.replace(/\s/g, ""));
  const chip = nearBlack ? "#94a3b8" : color;
  const swatch = nearBlack ? "#1e293b" : color;
  const colorName = (m.colorName || "wire").toUpperCase();
  const net = truncate(m.netName || m.netClass || "", 18);

  const aria = `Solder ${colorName} from ${fromBoard} pin ${fromPin} to ${toBoard} pin ${toPin}`;

  const W = 580;
  const H = 400;
  const boardW = 240;
  const boardH = 268;
  const gap = 52;
  const leftX = (W - boardW * 2 - gap) / 2;
  const rightX = leftX + boardW + gap;
  const boardY = 52;

  const left = drawBoardFace({
    bx: leftX,
    by: boardY,
    bw: boardW,
    bh: boardH,
    label: fromBoard,
    activePin: fromPin,
    color: chip,
    side: "left",
    partId: m.fromPartId,
  });
  const right = drawBoardFace({
    bx: rightX,
    by: boardY,
    bw: boardW,
    bh: boardH,
    label: toBoard,
    activePin: toPin,
    color: chip,
    side: "right",
    partId: m.toPartId,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escText(aria)}">
  <rect width="${W}" height="${H}" fill="#0b0e13"/>

  <text x="${W / 2}" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#94a3b8">Find these two pads · wire ${m.index}/${m.total}${net ? ` · ${escText(net)}` : ""}</text>

  <text x="${leftX + boardW / 2}" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="#64748b">BOARD A</text>
  <text x="${rightX + boardW / 2}" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="#64748b">BOARD B</text>

  ${left.svg}
  ${right.svg}

  <!-- SEV2: no mid-canvas connector (pill/path/chip) -->

  <rect x="24" y="${H - 44}" width="${W - 48}" height="32" rx="10" fill="#11161f" stroke="rgba(255,255,255,0.12)"/>
  <circle cx="44" cy="${H - 28}" r="6" fill="${swatch}" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>
  <text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="#f1f5f9">${escText(truncate(fromPin, 12))}  →  ${escText(truncate(toPin, 12))}  ·  ${escText(colorName)}</text>
</svg>`;
}
