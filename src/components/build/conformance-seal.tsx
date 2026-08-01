"use client";

/**
 * The Conformance Seal — proof the render equals the ERC-verified netlist.
 * Two honest channels (both netlist-derived after harness reconciliation):
 *   • Instructions — compiled connections / steps a beginner reads
 *   • 3D wires — harness tubes on the stage
 * Overall green only when BOTH are fully traced. Tap for breakdown.
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

  // Both channels must be clean for the compact chip to claim full fidelity.
  const harnessOk = !harness.available || harness.traced;
  const fullyTraced = table.traced && harnessOk;

  return (
    <div className="absolute top-3 left-3 z-10 max-w-[min(80%,18rem)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Wires in the steps and on the 3D stage are checked against the verified electrical model"
        className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full border backdrop-blur-sm cursor-pointer ${
          fullyTraced
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
            : "bg-amber-500/15 text-amber-200 border-amber-400/40"
        }`}
      >
        <span aria-hidden>{fullyTraced ? "✓" : "⚠"}</span>
        {fullyTraced
          ? "Steps + 3D wires checked against your circuit"
          : table.traced && !harnessOk
            ? `3D: ${harness.backedTubes}/${harness.totalTubes} tubes verified`
            : `${table.pct}% of step wires checked against your circuit`}
        {!fullyTraced && (table.issues.length > 0 || harness.decorativeTubes > 0) && (
          <span className="opacity-70">
            · {table.issues.length + (harness.decorativeTubes || 0)}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/12 p-2 space-y-1.5">
          <div>
            <p className="text-[10px] text-white/70 flex items-center gap-1">
              <span
                aria-hidden
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  table.traced ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              Instructions: {table.coveredNets}/{table.renderableNets} nets in the steps
              {table.decorativeCount > 0 ? ` · ${table.decorativeCount} unmatched` : ""}
            </p>
            {table.traced ? (
              <p className="text-[10px] text-emerald-300/90 mt-0.5">
                Every connection in the steps maps to a verified net — the table can&apos;t invent a wire.
              </p>
            ) : (
              <ul className="space-y-0.5 max-h-24 overflow-y-auto mt-0.5">
                {table.issues.slice(0, 6).map((iss, i) => (
                  <li key={i} className="text-[10px] text-white/70 leading-snug">
                    <span className="text-white/50">{iss.kind}:</span> {iss.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {harness.available && (
            <div className="pt-1 border-t border-white/10">
              <p className="text-[10px] text-white/70 flex items-center gap-1">
                <span
                  aria-hidden
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    harness.traced ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                3D stage: {harness.backedTubes}/{harness.totalTubes} tubes map to verified nets
              </p>
              {harness.traced ? (
                <p className="text-[10px] text-emerald-300/90 mt-0.5">
                  Every 3D wire is netlist-derived (hub–spoke for multi-pin nets) — same truth as the steps.
                </p>
              ) : (
                <>
                  <p className="text-[10px] text-amber-200/80 mt-0.5">
                    {harness.decorativeTubes} tube
                    {harness.decorativeTubes === 1 ? "" : "s"} not backed by a net name — treat the
                    steps table as authoritative until this is fixed.
                  </p>
                  <ul className="space-y-0.5 max-h-20 overflow-y-auto mt-0.5">
                    {harness.issues.slice(0, 4).map((iss, i) => (
                      <li key={i} className="text-[10px] text-white/70 leading-snug">
                        {iss.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
