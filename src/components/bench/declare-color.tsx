"use client";

/**
 * "GND is brown, VCC is red, SCL is orange and SDA is yellow."
 *
 * He said that on day two of the real build, and the product had nowhere to
 * put it — `wire-colors.ts` made the class standard beat any supplied colour
 * and flagged divergence as a defect. Every instruction afterwards named a
 * colour he was not holding.
 *
 * Inline, beneath the action it belongs to, never a drawer: the point is to
 * fix the sentence you are looking at without losing your place. Commits
 * immediately with an undo rather than asking for confirmation — a
 * first-person statement about your own bench is a fact, not a proposal, and
 * a confirm step on the highest-frequency interaction is a tax.
 */

import { useState } from "react";
import type { CursorAction } from "@/lib/actions/cursor";
import { commitReality, declareColor, clearColor, type BuildReality } from "@/lib/build-reality";

/** Colours a jumper kit actually contains, which is what he will be holding. */
const SWATCHES: { name: string; hex: string }[] = [
  { name: "black", hex: "#1f2937" },
  { name: "brown", hex: "#92400e" },
  { name: "red", hex: "#dc2626" },
  { name: "orange", hex: "#ea580c" },
  { name: "yellow", hex: "#eab308" },
  { name: "green", hex: "#16a34a" },
  { name: "blue", hex: "#2563eb" },
  { name: "purple", hex: "#7c3aed" },
  { name: "grey", hex: "#6b7280" },
  { name: "white", hex: "#e5e7eb" },
];

export function DeclareColor({
  action,
  reality,
}: {
  action: CursorAction;
  reality: BuildReality;
}) {
  const [open, setOpen] = useState(false);
  const net = action.connection.netName;
  const declaredHere = action.connection.colorSource === "user";

  const pick = (name: string, hex: string) => {
    // Declared for the whole NET, not one wire: he says "GND is brown" once
    // and means every ground wire he owns.
    commitReality(declareColor(reality, { hex, name, netName: net }));
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted hover:text-text underline underline-offset-2 cursor-pointer min-h-[44px]"
      >
        {declaredHere ? "Change what colour your " : "Mine's a different colour — set your "}
        {net} wire is
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle p-3 space-y-2">
      <p className="text-xs text-text-muted">
        What colour is your <span className="font-semibold text-text">{net}</span> wire?
      </p>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((s) => (
          <button
            key={s.name}
            onClick={() => pick(s.name, s.hex)}
            title={s.name}
            aria-label={s.name}
            className="w-11 h-11 rounded-lg border border-border-subtle cursor-pointer"
            style={{ backgroundColor: s.hex }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        {declaredHere && (
          <button
            onClick={() => {
              commitReality(clearColor(reality, { netName: net }));
              setOpen(false);
            }}
            className="text-xs text-text-muted underline cursor-pointer min-h-[44px]"
          >
            Undo — use the standard colour
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-text-muted cursor-pointer min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
