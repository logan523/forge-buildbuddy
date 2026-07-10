"use client";

/**
 * "Did I wire it wrong?" — pick the wire color and the pin you put it on, and
 * Forge answers instantly from the netlist (reverse-check.ts). No power-up, no
 * risk, no guessing. A green OK, a plain-English correction, or a red fry-risk
 * warning — all grounded in the compiled wiring so it can't be wrong.
 */

import { useState } from "react";
import type { CompiledStepFacts } from "@/lib/types";
import { reverseCheck, pinOptions, colorOptions } from "@/lib/steps/reverse-check";

export function WireDoubleCheck({ compiled }: { compiled: CompiledStepFacts }) {
  const pins = pinOptions(compiled.connections);
  const colors = colorOptions(compiled.connections);
  const [pin, setPin] = useState("");
  const [color, setColor] = useState("");

  if (pins.length < 1 || colors.length < 1) return null;
  const result = pin && color ? reverseCheck(compiled.connections, { pin, saidColor: color }) : null;

  const tone =
    result?.verdict === "ok"
      ? "bg-success-soft/60 border-success/30 text-success"
      : result?.danger
        ? "bg-danger-soft/60 border-danger/40 text-danger"
        : result?.verdict === "wrong"
          ? "bg-warning-soft/50 border-warning/30 text-warning"
          : "bg-surface-overlay border-border text-text-secondary";

  const selCls =
    "rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text min-h-[36px] cursor-pointer";

  return (
    <details className="group">
      <summary className="text-xs font-medium text-accent cursor-pointer py-1 min-h-[24px]">
        Not sure you got one right? Check it before you power on
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
          <span>I put the</span>
          <select
            aria-label="wire color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={selCls}
          >
            <option value="">…</option>
            {colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span>wire on the pin marked</span>
          <select
            aria-label="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={selCls}
          >
            <option value="">…</option>
            {pins.map((p) => (
              <option key={`${p.label}:${p.pin}`} value={p.pin}>
                {p.pin} ({p.label})
              </option>
            ))}
          </select>
        </div>
        {result && (
          <div className={`rounded-xl border p-3 text-sm leading-relaxed ${tone}`} role="status">
            <p>{result.message}</p>
            {result.fixHint && <p className="mt-1 text-text-secondary">{result.fixHint}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
