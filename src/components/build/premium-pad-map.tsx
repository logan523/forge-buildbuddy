"use client";

/**
 * Pad map — IBOM language: highlight the pad, do NOT draw a cartoon jumper.
 *
 * SEV2 (2026-07-30 → reopened): any mid-canvas connector (bezier, pill, dark
 * chip) reads as a "random black wire." Connection is stated only in the
 * figcaption swatch + glowing pads on each board. Empty air between boards.
 */

import { useMemo, type ReactNode } from "react";
import type { MicroStep } from "@/lib/types";
import {
  pinMatches,
  pinoutForBoard,
  type BoardPinout,
} from "@/lib/step-media/board-pinouts";

function contrastOn(hex: string): string {
  const h = (hex || "#000").replace("#", "");
  if (h.length < 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#0b0e13" : "#ffffff";
}

function short(s: string, n: number) {
  const t = (s || "").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

/** True when hex is near-black (GND / black jumper). */
function isNearBlack(hex: string): boolean {
  const h = (hex || "").replace("#", "").toLowerCase();
  if (h === "1e293b" || h === "000000" || h === "0f172a" || h === "111827" || h === "000") {
    return true;
  }
  if (h.length >= 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Very dark RGB — treat as black wire for UI accents
    return r < 50 && g < 55 && b < 70;
  }
  return false;
}

/**
 * UI accent for pad glow / callouts.
 * Never use near-black fills on the canvas — they read as a stray wire/blob.
 * Real wire color stays in the figcaption swatch only.
 */
function chipFill(hex: string): string {
  if (isNearBlack(hex)) return "#94a3b8"; // slate-400 — "black class", not a black stick
  return hex || "#0e7490";
}

/** Swatch in the caption may show true black (with light border). */
function swatchFill(hex: string): string {
  if (isNearBlack(hex)) return "#1e293b";
  return hex || "#0e7490";
}

function DualHeaderBoard({
  layout,
  activePin,
  color,
  x,
  y,
  w,
  h,
}: {
  layout: BoardPinout;
  activePin: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const left = layout.left || [];
  const right = layout.right || [];
  const n = Math.max(left.length, right.length, 1);
  const padH = Math.min(28, (h - 88) / n - 4);
  const padW = 34;
  const startY = y + 64;
  const leftX = x + 14;
  const rightX = x + w - padW - 14;
  const accent = chipFill(color);

  const cols: { pins: string[]; colX: number }[] = [
    { pins: left, colX: leftX },
    { pins: right, colX: rightX },
  ];

  let activeCx = x + w / 2;
  for (const col of cols) {
    col.pins.forEach((pin) => {
      if (pinMatches(pin, activePin)) {
        activeCx = col.colX + padW / 2;
      }
    });
  }

  const padNodes: ReactNode[] = cols.flatMap(({ pins, colX }) =>
    pins.map((pin, i) => {
      const py = startY + i * (padH + 4);
      const on = pinMatches(pin, activePin);
      return (
        <g key={`${colX}-${pin}-${i}`}>
          {on && (
            <rect
              x={colX - 4}
              y={py - 4}
              width={padW + 8}
              height={padH + 8}
              rx={5}
              fill="none"
              stroke={accent}
              strokeWidth={2.5}
            />
          )}
          <rect
            x={colX}
            y={py}
            width={padW}
            height={padH}
            rx={4}
            fill={on ? accent : "#1a1f2e"}
            stroke={on ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)"}
            strokeWidth={on ? 1.5 : 1}
          />
          <text
            x={colX + padW / 2}
            y={py + padH / 2 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={11}
            fontWeight={on ? 800 : 600}
            fill={on ? contrastOn(accent) : "#94a3b8"}
          >
            {short(pin, 5)}
          </text>
        </g>
      );
    })
  );

  return (
    <g>
      {/* Real PCB green; ink outline (technical-light), not white glow. */}
      <rect x={x} y={y} width={w} height={h} rx={14} fill="#14532d" stroke="#1a2744" strokeOpacity={0.45} strokeWidth={1.5} />
      <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={10} fill="#166534" opacity={0.4} />
      <rect x={x + w / 2 - 28} y={y + 10} width={56} height={16} rx={3} fill="#334155" stroke="#1a2744" strokeOpacity={0.4} />
      <text x={x + w / 2} y={y + 21} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#e2e8f0" fontFamily="system-ui,sans-serif">
        USB
      </text>
      <text x={x + w / 2} y={y + 48} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={13} fontWeight={700} fill="#ecfdf5">
        {short(layout.shortName, 18)}
      </text>
      <rect x={leftX - 5} y={startY - 6} width={padW + 10} height={n * (padH + 4) - 4 + 12} rx={4} fill="#0f172a" opacity={0.75} />
      <rect x={rightX - 5} y={startY - 6} width={padW + 10} height={n * (padH + 4) - 4 + 12} rx={4} fill="#0f172a" opacity={0.75} />
      {padNodes}
      <rect x={activeCx - 52} y={y + 52} width={104} height={26} rx={8} fill={accent} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <text x={activeCx} y={y + 66} textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui,sans-serif" fontSize={11} fontWeight={800} fill={contrastOn(accent)}>
        SOLDER {short(activePin, 8)}
      </text>
    </g>
  );
}

function SingleRowBoard({
  layout,
  activePin,
  color,
  x,
  y,
  w,
  h,
  darkGlass,
}: {
  layout: BoardPinout;
  activePin: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  darkGlass?: boolean;
}) {
  const pins = layout.row || [];
  const padW = Math.min(40, (w - 28) / Math.max(pins.length, 1) - 6);
  const padH = 42;
  const gap = 6;
  const totalW = pins.length * (padW + gap) - gap;
  const startX = x + (w - totalW) / 2;
  const padY = y + h - padH - 22;
  let activeCx = x + w / 2;
  const accent = chipFill(color);

  const body = darkGlass ? "#0c1929" : "#1e293b";
  const bodyHi = darkGlass ? "#132337" : "#334155";

  return (
    <g>
      {/* Dark module bodies stay (that's what the real parts look like);
          outline is ink, not white glow. */}
      <rect x={x} y={y} width={w} height={h} rx={14} fill={body} stroke="#1a2744" strokeOpacity={0.45} strokeWidth={1.5} />
      <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={10} fill={bodyHi} opacity={0.5} />
      {darkGlass && (
        <rect x={x + 22} y={y + 44} width={w - 44} height={h - 120} rx={6} fill="#020617" stroke="#0e7490" strokeOpacity={0.35} />
      )}
      <text x={x + w / 2} y={y + 28} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={13} fontWeight={700} fill="#e2e8f0">
        {short(layout.shortName, 18)}
      </text>
      <text x={x + w / 2} y={y + 44} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={11} fill="#94a3b8">
        match silkscreen
      </text>
      <rect x={startX - 8} y={padY - 10} width={totalW + 16} height={10} rx={2} fill="#0f172a" />
      {pins.map((pin, i) => {
        const px = startX + i * (padW + gap);
        const on = pinMatches(pin, activePin);
        if (on) activeCx = px + padW / 2;
        return (
          <g key={`${pin}-${i}`}>
            {on && (
              <rect x={px - 4} y={padY - 4} width={padW + 8} height={padH + 8} rx={5} fill="none" stroke={accent} strokeWidth={2.5} />
            )}
            <rect
              x={px}
              y={padY}
              width={padW}
              height={padH}
              rx={4}
              fill={on ? accent : "#0f172a"}
              stroke={on ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.16)"}
              strokeWidth={on ? 1.5 : 1}
            />
            <text
              x={px + padW / 2}
              y={padY + padH / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="ui-monospace,monospace"
              fontSize={11}
              fontWeight={on ? 800 : 600}
              fill={on ? contrastOn(accent) : "#94a3b8"}
            >
              {short(pin, 5)}
            </text>
          </g>
        );
      })}
      <rect x={activeCx - 52} y={padY - 34} width={104} height={24} rx={8} fill={accent} stroke="rgba(255,255,255,0.25)" />
      <text x={activeCx} y={padY - 21} textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui,sans-serif" fontSize={11} fontWeight={800} fill={contrastOn(accent)}>
        SOLDER {short(activePin, 8)}
      </text>
    </g>
  );
}

function BoardFace({
  label,
  pin,
  partId,
  color,
  x,
  y,
  w,
  h,
}: {
  label: string;
  pin: string;
  partId?: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const layout = useMemo(() => pinoutForBoard(label, pin, partId), [label, pin, partId]);
  if (layout.kind === "dual_header") {
    return <DualHeaderBoard layout={layout} activePin={pin} color={color} x={x} y={y} w={w} h={h} />;
  }
  const glass = /oled|display|ssd/i.test(label + layout.shortName);
  return (
    <SingleRowBoard
      layout={layout}
      activePin={pin}
      color={color}
      x={x}
      y={y}
      w={w}
      h={h}
      darkGlass={glass}
    />
  );
}

export function PremiumPadMap({
  micro,
  className = "",
}: {
  micro: MicroStep;
  className?: string;
}) {
  const color = micro.colorHex || "#0e7490";
  const accent = chipFill(color);
  const swatch = swatchFill(color);
  const W = 640;
  const H = 380;
  const boardW = 278;
  const boardH = 300;
  // Wide clean gap — no mid-canvas artifact to read as a wire
  const gap = 48;
  const leftX = (W - boardW * 2 - gap) / 2;
  const rightX = leftX + boardW + gap;
  const boardY = 36;

  const aria = `Solder ${micro.colorName} from ${micro.fromLabel} pin ${micro.fromPin} to ${micro.toLabel} pin ${micro.toPin}`;

  return (
    <figure
      className={`rounded-2xl overflow-hidden border border-border-subtle bg-surface shadow-card ${className}`}
    >
      <figcaption className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            Find these two pads
          </p>
          <p className="text-xs text-text-secondary truncate">
            Zoom in — find these two pads on your real boards (the wire is drawn in the sheet above)
          </p>
        </div>
        <div
          className="flex items-center gap-2 shrink-0 rounded-full border border-border pl-2 pr-3 py-1.5"
          style={{ background: isNearBlack(color) ? "rgba(148,163,184,0.15)" : `${accent}22` }}
        >
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-white/70 shrink-0 shadow-sm"
            style={{ background: swatch }}
            aria-hidden
            title={micro.colorName || "wire"}
          />
          <span className="text-sm font-mono font-bold text-text">
            {micro.fromPin}
            <span className="text-text-muted font-sans mx-1.5">to</span>
            {micro.toPin}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            · {micro.colorName || "wire"}
          </span>
        </div>
      </figcaption>

      {/* Native-pixel sheet (same language as the wiring sheet): labels keep
          their authored size; a narrow container scrolls instead of squishing. */}
      <div className="w-full bg-surface overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block mx-auto" role="img" aria-label={aria}>
          {/* Paper canvas — boards sit on the workbench sheet, ink labels. */}
          <rect width={W} height={H} fill="#f5f0e8" />

          {/* Side labels — A / B, not a wire */}
          <text x={leftX + boardW / 2} y={22} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={11} fontWeight={700} fill="#5c6b7a">
            BOARD A · START HERE
          </text>
          <text x={rightX + boardW / 2} y={22} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={11} fontWeight={700} fill="#5c6b7a">
            BOARD B · THEN HERE
          </text>

          <BoardFace
            label={micro.fromLabel}
            pin={micro.fromPin}
            partId={micro.fromPartId}
            color={color}
            x={leftX}
            y={boardY}
            w={boardW}
            h={boardH}
          />
          <BoardFace
            label={micro.toLabel}
            pin={micro.toPin}
            partId={micro.toPartId}
            color={color}
            x={rightX}
            y={boardY}
            w={boardW}
            h={boardH}
          />
          {/* Intentionally empty mid-canvas — no pill, path, or chip */}
        </svg>
      </div>
    </figure>
  );
}
