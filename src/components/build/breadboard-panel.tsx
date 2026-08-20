"use client";

/**
 * Breadboard mode (Slice 3: D4 tap-to-declare + D3 sequential elicitation +
 * D5 violation teaching). The board sheet is the INPUT, not just a picture:
 * tapping a hole answers the ONE open question — typed coordinates were the
 * "D14 sorry" transcription-error class, so taps are primary. Exactly one
 * unanswered question is visible at a time (the elicitation acceptance
 * test); the accepted-facts chips above it are the correction surface.
 */

import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import type { MicroStep } from "@/lib/types";
import {
  clearBreadboardHole,
  commitReality,
  declareBreadboardHole,
  readReality,
  setBoardSpec,
  subscribeReality,
} from "@/lib/build-reality";
import { BOARD_SPECS, describeHole, type BoardSpec, type HoleRef } from "@/lib/breadboard/spec";
import { checkBreadboard, type BreadboardVerdict } from "@/lib/breadboard/erc";

const CELL = 18;
const PAD = 24;

function BreadboardSheet({
  spec,
  occupied,
  violationHoles,
  onTapHole,
}: {
  spec: BoardSpec;
  occupied: Map<string, { label: string; hex?: string }>;
  violationHoles: Set<string>;
  onTapHole?: (hole: HoleRef) => void;
}) {
  const rows = [...spec.topRows, ...spec.bottomRows];
  const width = PAD * 2 + spec.columns * CELL;
  const height = PAD * 2 + rows.length * CELL + CELL; // + center gap
  const gapY = PAD + spec.topRows.length * CELL + CELL / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${spec.label} — tap a hole to declare a wire position`}
      className="w-full h-auto bg-[#f5f1e6] rounded-xl border border-border-subtle"
    >
      {/* center gap trench */}
      <rect x={PAD - 8} y={gapY - 5} width={spec.columns * CELL + 16} height={10} rx={3} fill="#d9d2bd" />
      {/* column numbers along the top */}
      {Array.from({ length: spec.columns }, (_, i) => i + 1)
        .filter((c) => c === 1 || c % 5 === 0)
        .map((c) => (
          <text key={c} x={PAD + (c - 0.5) * CELL} y={PAD - 8} textAnchor="middle" fontSize={9} fill="#8a8264" fontFamily="ui-monospace,monospace">
            {c}
          </text>
        ))}
      {rows.map((row, ri) => {
        const y = PAD + ri * CELL + (ri >= spec.topRows.length ? CELL : 0) + CELL / 2;
        return (
          <g key={row}>
            <text x={PAD - 12} y={y + 3} textAnchor="middle" fontSize={9} fill="#8a8264" fontFamily="ui-monospace,monospace">
              {row}
            </text>
            {Array.from({ length: spec.columns }, (_, ci) => {
              const col = ci + 1;
              const x = PAD + ci * CELL + CELL / 2;
              const key = `${row}${col}`;
              const occ = occupied.get(key);
              const bad = violationHoles.has(key);
              return (
                <g key={key}>
                  {bad && <circle cx={x} cy={y} r={8} fill="#dc2626" opacity={0.35} className="animate-pulse" />}
                  <circle
                    cx={x}
                    cy={y}
                    r={occ ? 5.5 : 3.5}
                    fill={occ ? (occ.hex ?? "#1e293b") : "#c9c1a6"}
                    stroke={bad ? "#dc2626" : occ ? "#00000033" : "none"}
                    strokeWidth={bad ? 2 : 1}
                    style={{ cursor: onTapHole ? "pointer" : "default" }}
                    onClick={onTapHole ? () => onTapHole({ kind: "hole", row, column: col }) : undefined}
                  >
                    <title>{occ ? `${key} — ${occ.label}` : key}</title>
                  </circle>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function BreadboardPanel({ planId, micro }: { planId: string; micro: MicroStep }) {
  const reality = useSyncExternalStore(subscribeReality, () => readReality(planId), () => undefined);

  const endpoints = useMemo(
    () => [
      { key: `${micro.id}@${micro.fromLabel}:${micro.fromPin}`, side: `${micro.fromLabel} (pin ${micro.fromPin})` },
      { key: `${micro.id}@${micro.toLabel}:${micro.toPin}`, side: `${micro.toLabel} (pin ${micro.toPin})` },
    ],
    [micro]
  );

  if (reality === undefined) return null;

  // ---- Entry: choose your board (orientation confirmed in the same breath) ----
  if (reality.formFactor !== "breadboard" || !reality.breadboard) {
    return (
      <details className="group rounded-xl border border-console-border bg-console-surface px-4 py-2">
        <summary className="text-sm font-semibold text-console-accent cursor-pointer min-h-11 flex items-center">
          Building on a breadboard?
        </summary>
        <div className="mt-2 pb-2 space-y-3">
          <p className="text-xs text-console-text-muted">
            Tell me which board and I switch every instruction to exact hole positions — and
            check for shorts before anything gets warm. Hold the board with the numbers along
            the long edge and column 1 on your LEFT — that's the orientation we'll both use.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(BOARD_SPECS).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => commitReality(setBoardSpec(reality, b.id))}
                className="min-h-11 px-3 rounded-lg border border-console-border bg-console-surface-raised text-sm text-console-text cursor-pointer hover:border-console-accent"
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </details>
    );
  }

  const spec = BOARD_SPECS[reality.breadboard.boardId as BoardSpec["id"]] ?? BOARD_SPECS["half-400"];
  const decls = reality.breadboard.declarations;
  const expectedKeys = endpoints.map((e) => e.key);
  const verdict: BreadboardVerdict = checkBreadboard(spec, decls, expectedKeys);

  const occupied = new Map<string, { label: string; hex?: string }>();
  for (const d of Object.values(decls)) {
    if (d.hole.kind === "hole") occupied.set(`${d.hole.row}${d.hole.column}`, { label: d.label, hex: d.key.startsWith(micro.id) ? micro.colorHex : undefined });
  }
  const violationHoles = new Set(verdict.violations.flatMap((v) => v.holes));

  // Sequential elicitation: exactly ONE open question at a time.
  const open = endpoints.find((e) => !decls[e.key]);

  const tap = (hole: HoleRef) => {
    if (!open) return;
    commitReality(
      declareBreadboardHole(reality, {
        key: open.key,
        netName: micro.netName,
        netClass: micro.netClass,
        label: `${micro.colorLabel ?? micro.colorName} wire — ${open.side}`,
        hole,
      })
    );
  };

  return (
    <div className="rounded-xl border border-console-border bg-console-surface p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">
        Your breadboard — {spec.label}
      </p>

      {/* Accepted facts = the correction surface: tap a chip to re-place it. */}
      {endpoints.some((e) => decls[e.key]) && (
        <div className="flex flex-wrap gap-2">
          {endpoints
            .filter((e) => decls[e.key])
            .map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => commitReality(clearBreadboardHole(reality, e.key))}
                title="Tap to re-place this end"
                className="min-h-11 px-3 rounded-lg bg-success/10 border border-success/30 text-xs text-console-text cursor-pointer"
              >
                ✓ {e.side} in <span className="font-mono font-bold">{describeHole(decls[e.key].hole)}</span>
                <span className="text-console-text-muted"> · tap to change</span>
              </button>
            ))}
        </div>
      )}

      {/* THE one open question */}
      {open ? (
        <p className="text-sm text-console-text">
          Where did you plug in the <span className="font-semibold" style={{ color: micro.colorHex }}>{micro.colorLabel ?? micro.colorName}</span>{" "}
          wire's <span className="font-semibold">{open.side}</span> end?{" "}
          <span className="text-console-text-muted">Tap the hole below.</span>
        </p>
      ) : verdict.violations.length === 0 ? (
        <p className="text-sm text-success">Both ends placed — this wire checks out on the board.</p>
      ) : null}

      <BreadboardSheet spec={spec} occupied={occupied} violationHoles={violationHoles} onTapHole={open ? tap : undefined} />

      {/* Violation teaching — causal, never-blame (D5) */}
      {verdict.violations.map((v) => (
        <div key={v.id} className="rounded-xl border border-danger/40 bg-danger-soft/40 px-4 py-3 space-y-1">
          <p className="text-sm font-bold text-danger">{v.title}</p>
          <p className="text-sm text-console-text leading-snug">{v.teach}</p>
          <p className="text-sm text-console-text-muted">→ {v.fix}</p>
        </div>
      ))}
    </div>
  );
}
