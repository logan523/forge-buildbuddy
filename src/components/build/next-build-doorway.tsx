"use client";

/**
 * The Next-Build Doorway — shown at the finish line, at peak dopamine. Instead of
 * a dead end, two concrete next builds that reuse the bench you already own, one
 * notch harder. "You own 4 of 6 parts — build this next."
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { savePlan, touchPlan, newPlanId } from "@/lib/storage";
import { rankNextBuilds } from "@/lib/next-builds";
import demoPlan from "@/data/sat-line.json";
import seedKits from "@/data/seed-kits.json";

function candidatePool(): BuildPlan[] {
  const kits = (seedKits as unknown as { plan: BuildPlan }[])
    .map((k) => k.plan)
    .filter(Boolean);
  const all = [demoPlan as unknown as BuildPlan, ...kits];
  // Dedupe by title (the demo and its kit are the same build).
  const seen = new Set<string>();
  return all.filter((p) => p && p.title && !seen.has(p.title) && seen.add(p.title));
}

export function NextBuildDoorway({ finished }: { finished: BuildPlan }) {
  const router = useRouter();
  const ranked = useMemo(() => rankNextBuilds(finished, candidatePool(), 2), [finished]);

  if (!ranked.length) return null;

  const launch = (p: BuildPlan) => {
    const trusted = applyTrustPipeline({ ...p, id: newPlanId() });
    savePlan(trusted);
    touchPlan(trusted.id);
    router.push(`/build/${trusted.id}`);
  };

  return (
    <div className="mt-4 text-left">
      <p className="text-sm font-semibold text-text mb-2">Build something next?</p>
      <div className="space-y-2">
        {ranked.map((r) => (
          <button
            key={r.plan.id || r.plan.title}
            type="button"
            onClick={() => launch(r.plan)}
            className="w-full text-left rounded-xl border border-border bg-surface hover:border-accent/50 hover:bg-accent/5 p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text">{r.plan.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-text-muted shrink-0">
                {r.plan.difficulty}
              </span>
            </div>
            <p className="text-xs text-accent mt-0.5 font-medium">
              You already own {r.sharedParts} of {r.totalParts} parts
              {r.newParts > 0 && (
                <span className="text-text-secondary font-normal">
                  {" "}
                  · just {r.newParts} new {r.newParts === 1 ? "part" : "parts"}
                  {r.plan.estimatedCost ? ` · ${r.plan.estimatedCost}` : ""}
                </span>
              )}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
