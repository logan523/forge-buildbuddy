"use client";

/**
 * Primary media for wiring steps: exact pad-to-pad map (not product 3D).
 * Occupies the Stage column so solder points are unmissable.
 */

import type { MicroStep } from "@/lib/types";
import { PinConnectionDiagram } from "./pin-connection-diagram";

export function WiringStage({
  wire,
  wireIndex,
  wireTotal,
  className = "",
}: {
  wire: MicroStep | null;
  wireIndex: number;
  wireTotal: number;
  className?: string;
}) {
  if (!wire) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 p-6 bg-surface-overlay/50 ${className}`}
      >
        <p className="text-sm font-semibold text-text">Exact solder points</p>
        <p className="text-xs text-text-muted text-center max-w-xs">
          Pick a wire on the right — each pad-to-pad map shows silkscreen names and
          wire color.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 bg-white ${className}`}>
      <div className="shrink-0 px-3 py-2 border-b border-accent/20 bg-accent/10">
        <p className="text-[10px] font-bold uppercase tracking-wider text-accent">
          Exact solder points — wire {wireIndex + 1} of {wireTotal}
        </p>
        <p className="text-xs font-mono text-text mt-0.5">
          {wire.fromLabel} <span className="font-bold">{wire.fromPin}</span>
          {" → "}
          {wire.toLabel} <span className="font-bold">{wire.toPin}</span>
          <span
            className="ml-2 inline-block w-2.5 h-2.5 rounded-full align-middle border border-black/20"
            style={{ background: wire.colorHex }}
            title={wire.colorName}
          />
          <span className="ml-1 text-text-muted">{wire.colorName}</span>
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-3">
        <PinConnectionDiagram micro={wire} className="border-0 shadow-none rounded-lg" />
      </div>
    </div>
  );
}
