"use client";

/**
 * Power check — the operating-point solver made legible. Each power rail's
 * delivered voltage under load, and its dip during a WiFi burst, so a beginner
 * sees "will this rail hold up?" before they ever power on. Honest: it's an
 * estimate from typical draw, labeled as such, never a measured value.
 */

import { useMemo } from "react";
import type { BuildPlan } from "@/lib/types";
import { solveOperatingPoint } from "@/lib/electrical/operating-point";

const TONE: Record<string, string> = {
  ok: "text-success border-success/25 bg-success-soft/40",
  marginal: "text-warning border-warning/30 bg-warning-soft/40",
  brownout: "text-danger border-danger/40 bg-danger-soft/50",
};

const LABEL: Record<string, string> = {
  ok: "healthy",
  marginal: "tight on bursts",
  brownout: "browns out",
};

export function PowerCheck({ plan }: { plan: BuildPlan }) {
  const op = useMemo(() => solveOperatingPoint(plan.electrical), [plan.electrical]);
  if (!op.available || op.rails.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text">Power check</h3>
        <span className="text-[9px] uppercase tracking-wider text-text-muted">estimated, not measured</span>
      </div>
      <div className="space-y-1.5">
        {op.rails.map((r) => (
          <div key={r.netName} className={`rounded-lg border px-2.5 py-1.5 ${TONE[r.status] ?? TONE.ok}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text">
                {/* netName disambiguates same-voltage rails (two 5V rails read
                    as duplicates without it). */}
                {r.netName} · {r.nominalV}V
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide">{LABEL[r.status]}</span>
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {r.loadMa}mA draw ({r.peakMa}mA peak) → delivers{" "}
              <span className="font-mono font-semibold text-text">{r.deliveredV.toFixed(2)}V</span>
              {r.deliveredPeakV < r.deliveredV && (
                <>
                  , dips to{" "}
                  <span className="font-mono font-semibold text-text">{r.deliveredPeakV.toFixed(2)}V</span> on a burst
                </>
              )}
            </p>
            {r.status === "brownout" && (
              <p className="text-[11px] mt-0.5">
                A WiFi burst pulls this below where a 3.3V part works — thicker/shorter power wires or a
                stronger source. This is the #1 &ldquo;my board keeps rebooting&rdquo; cause.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
