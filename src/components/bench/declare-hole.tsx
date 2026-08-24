"use client";

/**
 * "can you give me exact points" — where each end of THIS wire goes.
 *
 * On a breadboard there are no solder pads; there are hole coordinates, and
 * the product had no concept of them. Four wires went into column 1, the
 * board joined power to ground inside itself, and the ESP got hot. Nothing in
 * the UI could have caught it. The rules that catch it shipped in Slice 2 and
 * the surface that reaches them was deleted with everything else; this is it.
 *
 * Two rules from the elicitation contract:
 *
 *   Exactly ONE unanswered question is visible at a time. Asking for both
 *   ends of a wire at once is how you get two half-remembered answers.
 *
 *   Tapping is the only input. Typing "D14" is the transcription error the
 *   real build actually made, and there is no reason to offer it.
 */

import { useMemo } from "react";
import type { CursorAction } from "@/lib/actions/cursor";
import {
  clearBreadboardHole,
  commitReality,
  declareBreadboardHole,
  setBoardSpec,
  setFormFactor,
  type BuildReality,
} from "@/lib/build-reality";
import { BOARD_SPECS, describeHole, type BoardSpec, type HoleRef } from "@/lib/breadboard/spec";
import { checkBreadboard } from "@/lib/breadboard/erc";
import { BoardSheet } from "./board-sheet";

export function DeclareHole({
  action,
  reality,
}: {
  action: CursorAction;
  reality: BuildReality;
}) {
  const c = action.connection;
  const ends = useMemo(
    () => [
      { key: `${c.netName}:${c.fromRef}:${c.fromPin}`, side: `${c.fromLabel} · ${c.fromPin}` },
      { key: `${c.netName}:${c.toRef}:${c.toPin}`, side: `${c.toLabel} · ${c.toPin}` },
    ],
    [c]
  );

  // ---- Entry. Orientation is confirmed in the same breath as the board, so
  // "column 1" means the same thing to both of us from the first tap. ----
  if (reality.formFactor !== "breadboard" || !reality.breadboard) {
    return (
      <details className="rounded-lg border border-border-subtle px-4 py-2">
        <summary className="text-sm font-medium text-text cursor-pointer min-h-[44px] flex items-center">
          Building on a breadboard?
        </summary>
        <div className="pb-3 space-y-3">
          <p className="text-xs text-text-secondary">
            Tell me which board and every instruction switches to exact hole positions — and I
            check for shorts before anything gets warm. Hold it with the numbers along the long
            edge and column 1 on your <strong>left</strong>; that&apos;s the orientation we&apos;ll both use.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(BOARD_SPECS).map((b) => (
              <button
                key={b.id}
                onClick={() => commitReality(setBoardSpec(setFormFactor(reality, "breadboard"), b.id))}
                className="min-h-[44px] px-3 rounded-lg border border-border-subtle text-sm cursor-pointer hover:border-accent"
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
  const verdict = checkBreadboard(spec, decls, ends.map((e) => e.key));

  const occupied = new Map<string, { label: string; hex?: string }>();
  for (const d of Object.values(decls)) {
    if (d.hole.kind === "hole") {
      occupied.set(`${d.hole.row}${d.hole.column}`, {
        label: d.label,
        hex: ends.some((e) => e.key === d.key) ? c.colorHex : undefined,
      });
    }
  }
  const violationHoles = new Set(verdict.violations.flatMap((v) => v.holes));

  // ONE open question: the first end of this wire we don't know yet.
  const open = ends.find((e) => !decls[e.key]);

  return (
    <div className="rounded-lg border border-border-subtle p-3 space-y-3">
      {/* Accepted facts, and the correction surface — tap one to re-place it. */}
      <div className="flex flex-wrap gap-2">
        {ends.filter((e) => decls[e.key]).map((e) => (
          <button
            key={e.key}
            onClick={() => commitReality(clearBreadboardHole(reality, e.key))}
            className="text-xs px-2 py-1 rounded-sm border border-border-subtle text-text cursor-pointer min-h-[44px]"
            title="Tap to move it"
          >
            {e.side} → <strong>{describeHole(decls[e.key]!.hole)}</strong>
          </button>
        ))}
      </div>

      {open ? (
        <p className="text-sm text-text">
          Tap the hole where <strong>{open.side}</strong> goes.
        </p>
      ) : (
        <p className="text-sm text-text-muted">Both ends placed.</p>
      )}

      <BoardSheet
        spec={spec}
        occupied={occupied}
        violationHoles={violationHoles}
        onTapHole={
          open
            ? (hole: HoleRef) =>
                commitReality(
                  declareBreadboardHole(reality, {
                    key: open.key,
                    netName: c.netName,
                    netClass: c.netClass,
                    label: `${c.colorName} wire (${open.side})`,
                    hole,
                  })
                )
            : undefined
        }
      />

      {/* The reason this exists. Causal, and never blaming the builder. */}
      {verdict.violations.map((v) => (
        <div key={v.id} className="rounded-lg border border-danger/30 bg-danger-soft p-3 space-y-1">
          <p className="text-sm font-semibold text-danger">{v.title}</p>
          <p className="text-xs text-text">{v.teach}</p>
          <p className="text-xs text-text font-medium">→ {v.fix}</p>
        </div>
      ))}
    </div>
  );
}
