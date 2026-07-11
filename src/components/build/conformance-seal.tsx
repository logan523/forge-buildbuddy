"use client";

/**
 * The Conformance Seal — a persistent "Render fidelity: traced" mark on the 3D
 * stage that proves the picture equals the ERC-verified netlist. Green + closed
 * when 100% traced; amber and tap-to-open with the precise list when it isn't,
 * so the render's honesty is legible, not asserted.
 */

import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { auditConformance } from "@/lib/electrical/conformance";

export function ConformanceSeal({ plan }: { plan: BuildPlan }) {
  const report = useMemo(() => auditConformance(plan), [plan]);
  const [open, setOpen] = useState(false);

  if (!report.available) return null;
  const traced = report.traced;

  return (
    <div className="absolute top-3 left-3 z-10 max-w-[min(80%,18rem)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Every wire on screen is checked against the verified electrical model"
        className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full border backdrop-blur-sm cursor-pointer ${
          traced
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
            : "bg-amber-500/15 text-amber-200 border-amber-400/40"
        }`}
      >
        <span aria-hidden>{traced ? "✓" : "⚠"}</span>
        Render {traced ? "traced to the model" : `${report.pct}% traced`}
        {!traced && report.issues.length > 0 && (
          <span className="opacity-70">· {report.issues.length}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/12 p-2 space-y-1">
          <p className="text-[10px] text-white/70">
            {report.coveredNets}/{report.renderableNets} nets fully rendered
            {report.decorativeCount > 0 ? ` · ${report.decorativeCount} decorative` : ""}
          </p>
          {traced ? (
            <p className="text-[10px] text-emerald-300/90">
              Every wire traces to the verified model. The screen can&apos;t show one it didn&apos;t check.
            </p>
          ) : (
            <ul className="space-y-0.5 max-h-32 overflow-y-auto">
              {report.issues.slice(0, 8).map((iss, i) => (
                <li key={i} className="text-[10px] text-white/70 leading-snug">
                  <span
                    className={
                      iss.kind === "decorative" ? "text-amber-300" : "text-white/50"
                    }
                  >
                    {iss.kind === "decorative" ? "decorative" : iss.kind === "orphan-net" ? "missing" : "partial"}:
                  </span>{" "}
                  {iss.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
