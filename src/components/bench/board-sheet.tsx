"use client";

/**
 * The board, drawn honestly, and tappable.
 *
 * Ported unchanged from the deleted breadboard panel because the drawing was
 * never the problem — fixed standard orientation, numbered columns, lettered
 * rows, the centre trench that actually breaks a column in half. Only its
 * surroundings were rebuilt.
 *
 * The sheet is the INPUT, not decoration. Typing "D14" is the transcription
 * error the real build made ("D14 sorry"), so tapping a hole is primary and
 * typing is not offered at all.
 */

import type { BoardSpec, HoleRef } from "@/lib/breadboard/spec";

const CELL = 18;
const PAD = 24;

export function BoardSheet({
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

