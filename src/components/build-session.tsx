"use client";

/**
 * Build session orchestrator.
 *
 *   BuildSession (state + derived data, no layout)
 *   ├─ PrepScreen     — safety/cart/parts checklist        (build/prep-screen.tsx)
 *   └─ BuildScreen    — step media + instructions + nav    (build/build-screen.tsx)
 *      └─ BuildDrawers — one right-side sheet at a time    (build/build-drawers.tsx)
 *
 * State lives in one pure reducer (build/use-build-state.ts) — tested by the
 * characterization walk from Slice 0. This file only wires state to screens.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildPlan, BuildStep, Part } from "@/lib/types";
import { planCartOpens } from "@/lib/cart";
import { generateFirmware, isSoftwareStep } from "@/lib/firmware";
import { generatePcbPackage } from "@/lib/pcb";
import { generateEnclosure } from "@/lib/enclosure";
import { applyTrustPipeline } from "@/lib/trust";
import { savePlan, touchPlan } from "@/lib/storage";
import { shareUrlForPlan } from "@/lib/share";
import { filterStepsForMode } from "@/lib/modes";
import { useProductVisual } from "@/components/product-hero";
import { PrepScreen } from "@/components/build/prep-screen";
import { BuildScreen } from "@/components/build/build-screen";
import { BuildDrawers } from "@/components/build/build-drawers";
import {
  useBuildState,
  progressPct,
  needsSafetyAck,
} from "@/components/build/use-build-state";

export interface BuildSessionProps {
  plan: BuildPlan;
  /** When true, show prep first (new open). When false, jump into last step. */
  startAtPrep?: boolean;
}

export function BuildSession({ plan: rawPlan, startAtPrep = true }: BuildSessionProps) {
  const router = useRouter();
  const [planPatch, setPlanPatch] = useState<Partial<BuildPlan>>({});
  const plan = useMemo(
    () => applyTrustPipeline({ ...rawPlan, ...planPatch }),
    [rawPlan, planPatch]
  );

  const { state, actions } = useBuildState(plan.id, startAtPrep);

  const steps = useMemo(() => filterStepsForMode(plan, state.buildMode), [plan, state.buildMode]);
  const firmware = useMemo(() => generateFirmware(plan), [plan]);
  const pcb = useMemo(() => {
    try {
      return generatePcbPackage(plan);
    } catch {
      return null;
    }
  }, [plan]);
  const enclosure = useMemo(() => generateEnclosure(plan), [plan]);
  const productVisual = useProductVisual(plan);

  // Clamp step when mode changes
  useEffect(() => {
    actions.clampStep(steps.length);
  }, [steps.length, actions]);

  useEffect(() => {
    savePlan(plan);
    touchPlan(plan.id, {
      cartStrategy: state.cartStrategy,
      buildMode: state.buildMode,
      detailLevel: state.detailLevel,
    });
    const parts = plan.parts ?? null;
    (window as unknown as { __forgeBOM: typeof parts }).__forgeBOM = parts;
    window.dispatchEvent(new CustomEvent("forge:bom", { detail: parts }));
  }, [plan, state.cartStrategy, state.buildMode, state.detailLevel]);

  const s: BuildStep | undefined = steps[state.stepIndex];
  const pct = progressPct(state.completed, steps);
  const onSoftwareStep = isSoftwareStep(s);
  const needsAck = needsSafetyAck(plan, state.safetyAck);
  const ercBlocksPcb = plan.electrical ? !plan.electrical.erc.canExportPcb : false;

  const buyAllParts = (parts: Part[]) => {
    planCartOpens(parts, state.cartStrategy).forEach((item, i) => {
      setTimeout(() => window.open(item.link.url, "_blank", "noopener"), i * 350);
    });
  };

  const share = async () => {
    const url = shareUrlForPlan(plan);
    try {
      await navigator.clipboard.writeText(url);
      actions.setShareMsg("Share link copied");
    } catch {
      actions.setShareMsg(url);
    }
    setTimeout(() => actions.setShareMsg(""), 2500);
  };

  const goHome = () => router.push("/");

  if (state.showPrep) {
    return (
      <PrepScreen
        plan={plan}
        productVisual={productVisual}
        firmware={firmware}
        buildMode={state.buildMode}
        cartStrategy={state.cartStrategy}
        safetyAck={state.safetyAck}
        needsAck={needsAck}
        shareMsg={state.shareMsg}
        tooltip={state.tooltip}
        onHome={goHome}
        onShare={share}
        onBuyAll={buyAllParts}
        onPlanPatch={(patch) => {
          setPlanPatch((prev) => ({ ...prev, ...patch }));
          savePlan(applyTrustPipeline({ ...plan, ...patch }));
        }}
        onSetBuildMode={actions.setBuildMode}
        onSetCartStrategy={actions.setCartStrategy}
        onSetSafetyAck={actions.setSafetyAck}
        onSetTooltip={actions.setTooltip}
        onStart={actions.startBuild}
      />
    );
  }

  return (
    <>
      <BuildScreen
        plan={plan}
        steps={steps}
        step={s}
        stepIndex={state.stepIndex}
        pct={pct}
        detailLevel={state.detailLevel}
        completed={state.completed}
        firmware={firmware}
        hasPcb={!!pcb}
        ercBlocksPcb={ercBlocksPcb}
        onSoftwareStep={onSoftwareStep}
        shareMsg={state.shareMsg}
        tooltip={state.tooltip}
        activeDrawer={state.drawer}
        onHome={goHome}
        onShare={share}
        onBuyAll={buyAllParts}
        onSetDetailLevel={actions.setDetailLevel}
        onOpenPrep={actions.openPrep}
        onOpenDrawer={actions.openDrawer}
        onCloseDrawer={actions.closeDrawer}
        onToggleComplete={(n) => actions.toggleComplete(n, state.completed)}
        onGoStep={(i) => actions.goStep(i, steps.length)}
        onNext={() => actions.nextStep(steps.length)}
        onPrev={actions.prevStep}
        onSetTooltip={actions.setTooltip}
      />
      <BuildDrawers
        drawer={state.drawer}
        plan={plan}
        step={s}
        stepIndex={state.stepIndex}
        firmware={firmware}
        pcb={pcb}
        enclosure={enclosure}
        cartStrategy={state.cartStrategy}
        fwSketchId={state.fwSketchId}
        unstickSymptom={state.unstickSymptom}
        authorName={state.authorName}
        publishMsg={state.publishMsg}
        onClose={actions.closeDrawer}
        onSetFwSketch={actions.setFwSketch}
        onSetUnstickSymptom={actions.setUnstickSymptom}
        onSetAuthorName={actions.setAuthorName}
        onSetPublishMsg={actions.setPublishMsg}
        onOpenPrep={actions.openPrep}
      />
    </>
  );
}
