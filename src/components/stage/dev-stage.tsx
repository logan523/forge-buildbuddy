"use client";

/**
 * Dev-only Stage harness (/dev/stage) — mounts StageApp on the demo plan,
 * fullscreen, with the debug HUD. ?cam=hero|table|overhead|part:<nodeId>
 * pins the initial shot for deterministic design review + screenshots.
 */
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import demoPlan from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { parseShotId } from "@/lib/stage/shots";
import { StageApp } from "./stage-app";

function DevStageInner() {
  const params = useSearchParams();
  const initialShot = parseShotId(params.get("cam")) ?? "hero";
  const plan = useMemo(
    () => applyTrustPipeline(demoPlan as unknown as BuildPlan),
    []
  );
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0"
        style={{ top: 56, height: "calc(100vh - 56px)" }}
      >
        <StageApp
          plan={plan}
          initialShot={initialShot}
          debugHud
          className="w-full"
          style={{ height: "calc(100vh - 56px)" }}
        />
      </div>
    </>
  );
}

export default function DevStage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">loading stage…</div>}>
      <DevStageInner />
    </Suspense>
  );
}
