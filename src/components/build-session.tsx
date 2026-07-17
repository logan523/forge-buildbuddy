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
import type { BuildPlan, BuildStep, Part, Vendor } from "@/lib/types";
import { planCartOpens, VENDOR_LABEL, type CartOpenItem, type CartStrategy } from "@/lib/cart";
import { generateFirmware, isSoftwareStep } from "@/lib/firmware";
import { generatePcbPackage } from "@/lib/pcb";
import { generateEnclosure } from "@/lib/enclosure";
import { applyTrustPipeline } from "@/lib/trust";
import { onStorageWarning, savePlan, touchPlan } from "@/lib/storage";
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
  // B6: storage quota failures surface instead of silently losing progress.
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  useEffect(() => {
    onStorageWarning((context) => setStorageWarning(context));
    return () => onStorageWarning(null);
  }, []);
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

  // Buy-all used to blast window.open() in a 350ms-staggered loop (one popup
  // per part, no confirmation) — browsers throttle/block rapid-fire popups
  // and it gave zero warning of how many tabs were about to open. Now it
  // opens a small grouped panel (one row per vendor); each row is a single
  // explicit click that opens just that vendor's tabs. No auto-popup loops.
  const [buyAllQueue, setBuyAllQueue] = useState<Part[] | null>(null);
  const buyAllParts = (parts: Part[]) => setBuyAllQueue(parts);

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

  const screen = state.showPrep ? (
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
  ) : (
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
        onBuyAll={buyAllParts}
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
        onOpenUnstick={(symptom) => {
          actions.setUnstickSymptom(symptom);
          actions.openDrawer("unstick");
        }}
      />
    </>
  );

  return (
    <>
      {screen}
      {storageWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] p-3 rounded-xl border border-warning/40 bg-warning-soft shadow-raised flex items-start gap-2">
          <p className="text-sm text-text flex-1">
            Your browser storage is full — {storageWarning} may not stick. Clear old builds
            from the homepage, or export a share link so nothing is lost.
          </p>
          <button
            onClick={() => setStorageWarning(null)}
            aria-label="Dismiss"
            className="min-h-11 min-w-11 -m-1 flex items-center justify-center text-text-muted hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
      {buyAllQueue && buyAllQueue.length > 0 && (
        <BuyAllPanel
          parts={buyAllQueue}
          strategy={state.cartStrategy}
          onClose={() => setBuyAllQueue(null)}
        />
      )}
    </>
  );
}

/**
 * Grouped Buy-all summary: one row per vendor with a part count; each row is
 * a single click that opens just that vendor's tabs (reuses planCartOpens'
 * vendor clustering). Replaces the old 350ms-staggered window.open loop that
 * fired one popup per part with no confirmation — browsers throttle rapid
 * popups, and beginners had no idea how many tabs were about to open.
 */
function BuyAllPanel({
  parts,
  strategy,
  onClose,
}: {
  parts: Part[];
  strategy: CartStrategy;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = groupCartOpensByVendor(planCartOpens(parts, strategy));

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Buy all parts"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl bg-surface border border-border shadow-raised p-4"
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-semibold text-text">Buy all parts</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 min-h-9 min-w-9 flex items-center justify-center text-lg text-text-muted hover:text-text cursor-pointer"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          One tap per vendor opens all of that vendor&apos;s tabs at once.
        </p>
        <div className="space-y-1.5">
          {groups.map((g) => (
            <button
              key={g.vendor}
              onClick={() => g.items.forEach((item) => window.open(item.link.url, "_blank", "noopener"))}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle hover:border-accent/40 hover:bg-surface-overlay transition-colors cursor-pointer text-left"
            >
              <span className="text-sm font-medium text-text">
                {VENDOR_LABEL[g.vendor] || g.vendor} — {g.items.length} part{g.items.length === 1 ? "" : "s"}
              </span>
              <span className="text-xs text-text-muted" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function groupCartOpensByVendor(opens: CartOpenItem[]): { vendor: Vendor; items: CartOpenItem[] }[] {
  const order: Vendor[] = [];
  const byVendor = new Map<Vendor, CartOpenItem[]>();
  for (const item of opens) {
    if (!byVendor.has(item.vendor)) {
      byVendor.set(item.vendor, []);
      order.push(item.vendor);
    }
    byVendor.get(item.vendor)!.push(item);
  }
  return order.map((vendor) => ({ vendor, items: byVendor.get(vendor)! }));
}
