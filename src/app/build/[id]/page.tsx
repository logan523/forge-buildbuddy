"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { BuildPlan } from "@/lib/types";
import { getPlan, savePlan, touchPlan } from "@/lib/storage";
import { applyTrustPipeline } from "@/lib/trust";
import { BuildSession } from "@/components/build-session";
import demoPlan from "@/data/sat-line.json";
import weatherClockPlan from "@/data/solar-weather-clock.json";

function BuildByIdInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [plan, setPlan] = useState<BuildPlan | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;

    // Built-in demo id
    if (id === "sat-line-smart-clock" || id === "demo-sat-line") {
      const trusted = applyTrustPipeline(demoPlan as unknown as BuildPlan);
      savePlan(trusted);
      touchPlan(trusted.id);
      setPlan(trusted);
      return;
    }

    // Logan's personal build — always load the authored source of truth so
    // edits to the JSON show up without clearing localStorage. It still opens
    // at the prep screen (safety + parts) because it isn't flagged as a demo.
    if (id === "solar-weather-clock") {
      const trusted = applyTrustPipeline(weatherClockPlan as unknown as BuildPlan);
      savePlan(trusted);
      touchPlan(trusted.id);
      setPlan(trusted);
      return;
    }

    const found = getPlan(id);
    if (!found) {
      setMissing(true);
      return;
    }
    const trusted = applyTrustPipeline(found);
    savePlan(trusted);
    touchPlan(trusted.id);
    setPlan(trusted);
  }, [id]);

  const isDemo = id === "sat-line-smart-clock" || id === "demo-sat-line";

  // Deep links: ?wire=1 → first compiled wiring step; ?step=N → 1-based step number.
  const initialStepIndex = useMemo(() => {
    if (!plan) return undefined;
    const wire = searchParams.get("wire");
    const step = searchParams.get("step");
    if (wire === "1" || wire === "true") {
      const idx = plan.steps.findIndex(
        (s) => (s.compiled?.microSteps?.length ?? 0) > 0
      );
      return idx >= 0 ? idx : undefined;
    }
    if (step) {
      const n = parseInt(step, 10);
      if (Number.isFinite(n) && n >= 1) {
        const idx = plan.steps.findIndex((s) => s.stepNumber === n);
        return idx >= 0 ? idx : Math.max(0, n - 1);
      }
    }
    // Demo default: open Wire Lab so the pitch isn't prep fluff.
    if (isDemo) {
      const idx = plan.steps.findIndex(
        (s) => (s.compiled?.microSteps?.length ?? 0) > 0
      );
      return idx >= 0 ? idx : 0;
    }
    return undefined;
  }, [plan, searchParams, isDemo]);

  if (missing) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold font-serif text-text mb-2">Build not found</h1>
          <p className="text-sm text-text-secondary mb-4">
            This plan isn&apos;t in this browser&apos;s storage. Open a share link, or start from home.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold cursor-pointer"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BuildSession
      plan={plan}
      startAtPrep={!isDemo && initialStepIndex == null}
      initialStepIndex={initialStepIndex}
      jumpToWiring={isDemo}
    />
  );
}

export default function BuildByIdPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <BuildByIdInner />
    </Suspense>
  );
}
