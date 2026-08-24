"use client";

/**
 * The session. Resolve reality, compile once, render the bench.
 *
 * Replaces a 397-line orchestrator that eagerly computed firmware (901 lines),
 * a PCB package (415) and an enclosure (157) on every plan change — to fill
 * drawers most builders never opened — and threaded 30 props into one screen
 * and 21 into another.
 *
 * What is left is the actual shape of a build session: what does this builder
 * have, what is the next thing, and did it work.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline, trustPipelineRuns } from "@/lib/trust";
import {
  hydrateReality,
  migrateLegacyWirechecks,
  readReality,
  subscribeReality,
  type BuildReality,
} from "@/lib/build-reality";
import { savePlan, touchPlan } from "@/lib/storage";
import type { SymptomId } from "@/lib/unstick";
import { FlashConsole } from "@/components/flash/flash-console";
import { BenchScreen } from "./bench-screen";
import { StuckSheet } from "./stuck-sheet";

export interface BenchSessionProps {
  plan: BuildPlan;
}

/**
 * Reality must be known BEFORE the first compile. Reading it inline meant the
 * first pass ran against `undefined` and hydration triggered a second full
 * compile; the page was compiling five times before it settled.
 */
export function BenchSession({ plan: rawPlan }: BenchSessionProps) {
  const planId = rawPlan.id;
  const reality = useSyncExternalStore(subscribeReality, () => readReality(planId), () => undefined);

  useEffect(() => {
    void hydrateReality(planId); // no edges — the legacy migration runs after the first compile
  }, [planId]);

  if (reality === undefined) {
    return (
      <div
        className="h-[calc(100vh-3.5rem)] grid place-items-center text-sm text-text-muted"
        data-testid="bench-hydrating"
      >
        Loading your build…
      </div>
    );
  }
  return <BenchSessionInner plan={rawPlan} reality={reality} />;
}

function BenchSessionInner({ plan: rawPlan, reality }: { plan: BuildPlan; reality: BuildReality }) {
  const router = useRouter();
  const [liveOpen, setLiveOpen] = useState(false);
  const [stuck, setStuck] = useState<{ symptomId?: SymptomId } | null>(null);

  const plan = useMemo(
    () => applyTrustPipeline(rawPlan, reality),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision IS the identity
    [rawPlan, reality.revision]
  );

  useEffect(() => {
    // The one thing that needs compiled edges: recovering real endpoints from
    // legacy forge-wirechecks-* keys. No-ops unless this plan has legacy data.
    migrateLegacyWirechecks(
      rawPlan.id,
      plan.steps.flatMap((s) => s.compiled?.connections ?? [])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per plan
  }, [rawPlan.id]);

  useEffect(() => {
    savePlan(plan);
    touchPlan(plan.id);
    if (typeof window !== "undefined") {
      (window as unknown as { __forgePipelineRuns: number }).__forgePipelineRuns =
        trustPipelineRuns.count;
    }
  }, [plan]);

  return (
    <>
      <BenchScreen
        plan={plan}
        reality={reality}
        onHome={() => router.push("/")}
        onOpenLiveCheck={() => setLiveOpen(true)}
        onOpenStuck={(symptomId) => setStuck({ symptomId: symptomId as SymptomId | undefined })}
      />

      {/* Evidence. The one capability a camera and an LLM structurally cannot
          replicate, so it stays first-class and reachable from any wire.
          FlashConsole already writes found devices into reality at instrument
          tier itself (flash-console.tsx:317) — doing it again here would be a
          second, competing bridge. */}
      <FlashConsole
        open={liveOpen}
        onClose={() => setLiveOpen(false)}
        plan={plan}
        onOpenUnstick={(hint) => {
          setLiveOpen(false);
          setStuck({ symptomId: hint as SymptomId | undefined });
        }}
      />

      {stuck && (
        <StuckSheet
          plan={plan}
          reality={reality}
          symptomId={stuck.symptomId}
          onClose={() => setStuck(null)}
        />
      )}
    </>
  );
}
