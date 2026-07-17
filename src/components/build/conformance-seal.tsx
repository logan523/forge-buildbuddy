"use client";

/**
 * The Conformance Seal — proof the render equals the ERC-verified netlist. It
 * reports two honest, distinct truths:
 *   • Instructions (the compiled table/steps a beginner reads) — provably
 *     netlist-derived; the load-bearing honesty (the steps can't lie).
 *   • 3D wires (the rendered harness tubes) — today mostly a hand-authored
 *     teaching layout, NOT per-tube netlist truth (see harness reconciliation
 *     in TODOs). Surfacing this is the point: the seal must not over-claim.
 * Tap to open the precise breakdown.
 */

import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { auditConformance } from "@/lib/electrical/conformance";
import { auditPlanHarness } from "@/lib/product-3d";

export function ConformanceSeal({ plan }: { plan: BuildPlan }) {
  const table = useMemo(() => auditConformance(plan), [plan]);
  const harness = useMemo(() => auditPlanHarness(plan), [plan]);
  const [open, setOpen] = useState(false);

  if (!table.available) return null;
  const traced = table.traced;

  return (
    <div className="absolute top-3 left-3 z-10 max-w-[min(80%,18rem)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="The build steps are checked wire-by-wire against the verified electrical model"
        className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full border backdrop-blur-sm cursor-pointer ${
          traced
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
            : "bg-amber-500/15 text-amber-200 border-amber-400/40"
        }`}
      >
        <span aria-hidden>{traced ? "✓" : "⚠"}</span>
        {traced
          ? "Every wire in these steps is checked against your circuit"
          : `${table.pct}% of wires checked against your circuit`}
        {!traced && table.issues.length > 0 && (
          <span className="opacity-70">· {table.issues.length}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/12 p-2 space-y-1.5">
          {/* Instructions (the compiled table) */}
          <div>
            <p className="text-[10px] text-white/70">
              Instructions: {table.coveredNets}/{table.renderableNets} nets rendered in the steps
              {table.decorativeCount > 0 ? ` · ${table.decorativeCount} teaching-only` : ""}
            </p>
            {traced ? (
              <p className="text-[10px] text-emerald-300/90">
                Every wire in the steps is checked against your circuit — the steps can&apos;t tell you to wire one it didn&apos;t check.
              </p>
            ) : (
              <ul className="space-y-0.5 max-h-24 overflow-y-auto mt-0.5">
                {table.issues.slice(0, 6).map((iss, i) => (
                  <li key={i} className="text-[10px] text-white/70 leading-snug">
                    {iss.kind === "decorative" ? (
                      <span className="text-amber-300">
                        teaching-only visuals — the checked list above is what&apos;s verified
                      </span>
                    ) : (
                      <>
                        <span className="text-white/50">
                          {iss.kind === "orphan-net" ? "missing" : "partial"}:
                        </span>{" "}
                        {iss.detail}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 3D wires (the rendered harness) — the honest disclosure */}
          {harness.available && (
            <div className="pt-1 border-t border-white/10">
              <p className="text-[10px] text-white/70 flex items-center gap-1">
                <span
                  aria-hidden
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    harness.traced ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {harness.backedTubes} of {harness.totalTubes} 3D wires verified against the wiring plan
              </p>
              {!harness.traced && (
                <p className="text-[10px] text-amber-200/80">
                  {harness.decorativeTubes} tubes are teaching-only visuals — the checked list above is
                  what&apos;s verified. The steps above are the proven source; the 3D wiring is an
                  illustration.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
