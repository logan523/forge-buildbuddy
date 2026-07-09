"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { BuildPlan, BuildStep, Part } from "@/lib/types";
import {
  estimateBom,
  formatUsdRange,
  planCartOpens,
  type CartStrategy,
} from "@/lib/cart";
import { generateFirmware, isSoftwareStep } from "@/lib/firmware";
import { generatePcbPackage, type PcbPackage } from "@/lib/pcb";
import { generateEnclosure, type EnclosurePackage } from "@/lib/enclosure";
import { publishKit } from "@/lib/kits/store";
import { applyTrustPipeline } from "@/lib/trust";
import { presentErc } from "@/lib/electrical/present";
import {
  loadCompletedSteps,
  saveCompletedSteps,
  savePlan,
  touchPlan,
  loadMeta,
} from "@/lib/storage";
import { shareUrlForPlan } from "@/lib/share";
import { filterStepsForMode, modeLabel, type BuildMode } from "@/lib/modes";
import type { SymptomId } from "@/lib/unstick";
import {
  PartRow,
  SafetyPanel,
  FirmwareDrawer,
  UnstickDrawer,
  partIcon,
} from "@/components/build-ui";
import { ProductHero, useProductVisual } from "@/components/product-hero";
import { InstructionCard } from "@/components/instruction-card";
import { StepMediaPanel } from "@/components/step-media-panel";

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

  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => loadCompletedSteps(plan.id));
  const [showParts, setShowParts] = useState(false);
  const [showPrep, setShowPrep] = useState(startAtPrep);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [cartStrategy, setCartStrategy] = useState<CartStrategy>(() => loadMeta(plan.id)?.cartStrategy || "split");
  const [buildMode, setBuildMode] = useState<BuildMode>(() => loadMeta(plan.id)?.buildMode || "full");
  const [showUnstick, setShowUnstick] = useState(false);
  const [unstickSymptom, setUnstickSymptom] = useState<SymptomId | null>(null);
  const [showFirmware, setShowFirmware] = useState(false);
  const [fwSketchId, setFwSketchId] = useState<string | null>(null);
  const [showPcb, setShowPcb] = useState(false);
  const [showPcbBlocked, setShowPcbBlocked] = useState(false);
  const [showCase, setShowCase] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [authorName, setAuthorName] = useState("Maker");
  const [publishMsg, setPublishMsg] = useState("");
  const [detailLevel, setDetailLevel] = useState<"quick" | "standard" | "deep">(() => {
    return loadMeta(plan.id)?.detailLevel ||
      (typeof window !== "undefined"
        ? ((localStorage.getItem("forge-detail") as "quick" | "standard" | "deep") || "standard")
        : "standard");
  });
  const [safetyAck, setSafetyAck] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  const steps = useMemo(() => filterStepsForMode(plan, buildMode), [plan, buildMode]);
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
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [steps.length, step]);

  useEffect(() => {
    savePlan(plan);
    touchPlan(plan.id, { cartStrategy, buildMode, detailLevel });
    const parts = plan.parts ?? null;
    (window as unknown as { __forgeBOM: typeof parts }).__forgeBOM = parts;
    window.dispatchEvent(new CustomEvent("forge:bom", { detail: parts }));
  }, [plan, cartStrategy, buildMode, detailLevel]);

  const s: BuildStep | undefined = steps[step];
  const pct = steps.length > 0 ? Math.round((completed.size / steps.length) * 100) : 0;
  const onSoftwareStep = isSoftwareStep(s);
  const needsAck =
    (!!plan.safetyReport?.requiresAttention || (plan.electrical && !plan.electrical.erc.clean)) && !safetyAck;
  const ercBlocksPcb = plan.electrical ? !plan.electrical.erc.canExportPcb : false;

  const toggleComplete = (n: number) => {
    const next = new Set(completed);
    next.has(n) ? next.delete(n) : next.add(n);
    setCompleted(next);
    saveCompletedSteps(plan.id, next);
  };

  const buyAllParts = (parts: Part[]) => {
    planCartOpens(parts, cartStrategy).forEach((item, i) => {
      setTimeout(() => window.open(item.link.url, "_blank", "noopener"), i * 350);
    });
  };

  const share = async () => {
    const url = shareUrlForPlan(plan);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Share link copied");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(""), 2500);
  };

  const goHome = () => router.push("/");

  // ── Prep ──
  if (showPrep) {
    const bom = plan.bomEstimate || (() => {
      const e = estimateBom(plan.parts, cartStrategy);
      return {
        totalMin: e.totalMin,
        totalMax: e.totalMax,
        currency: e.currency,
        pricedCount: e.pricedCount,
        unpricedCount: e.unpricedCount,
      };
    })();

    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="shrink-0 px-6 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
          <button onClick={goHome} className="text-sm text-text-muted hover:text-text cursor-pointer">← Home</button>
          <span className="text-sm font-medium text-text truncate">{plan.title}</span>
          <div className="flex items-center gap-2">
            <button onClick={share} className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-text cursor-pointer">Share</button>
            <span className="text-xs text-text-muted">{plan.estimatedCost}</span>
          </div>
        </div>
        {shareMsg && (
          <div className="text-center text-xs py-1 bg-success-soft text-success">{shareMsg}</div>
        )}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 lg:p-10">
            <h2 className="text-2xl font-bold text-text font-serif mb-2">Before you begin</h2>
            <p className="text-text-secondary mb-4">Take 5 minutes to prepare. Everything will go smoother.</p>

            <ProductHero
              plan={plan}
              visual={productVisual}
              stepIndex="prep"
              onPlanPatch={(patch) => {
                setPlanPatch((prev) => ({ ...prev, ...patch }));
                savePlan(applyTrustPipeline({ ...plan, ...patch }));
              }}
            />

            {plan.sourceUrl && (
              <p className="text-xs text-text-muted mb-6">
                Inspired by{" "}
                <a href={plan.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  source project
                </a>
                . Forge is your complete guide — you do not need the video open.
              </p>
            )}

            {/* Build mode */}
            <div className="mb-6 flex gap-2 p-1 rounded-xl bg-surface-overlay w-fit">
              {(["quick", "full"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setBuildMode(m)}
                  className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer ${
                    buildMode === m ? "bg-accent text-white font-semibold" : "text-text-muted"
                  }`}
                >
                  {modeLabel(m)}
                  {m === "quick" ? ` (${filterStepsForMode(plan, "quick").length} steps)` : ` (${plan.steps.length} steps)`}
                </button>
              ))}
            </div>

            {plan.electrical && <ErcPanel electrical={plan.electrical} />}

            {plan.safetyReport && <SafetyPanel report={plan.safetyReport} />}

            {!plan.safetyReport && plan.warnings?.length > 0 && (
              <div className="mb-8 p-5 rounded-xl bg-danger-soft border border-danger/10">
                <h3 className="text-sm font-semibold text-danger uppercase tracking-wider mb-3">Safety</h3>
                {plan.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-text-secondary mb-1">{w}</p>
                ))}
              </div>
            )}

            {(plan.safetyReport?.requiresAttention || (plan.electrical && !plan.electrical.erc.clean)) && (
              <label className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-danger/20 bg-danger-soft/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safetyAck}
                  onChange={(e) => setSafetyAck(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-text">
                  I understand the wiring problems above and will fix or accept risk before first power-on.
                  PCB export stays blocked until the electrical check is clean.
                </span>
              </label>
            )}

            {bom.pricedCount > 0 && (
              <div className="mb-6 p-5 rounded-xl bg-surface border border-border-subtle shadow-card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Parts cart estimate</p>
                    <p className="text-2xl font-bold text-text font-serif tabular-nums">
                      {formatUsdRange(bom.totalMin, bom.totalMax)}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      {bom.pricedCount}/{plan.parts.length} parts priced · catalog estimates
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1 p-0.5 rounded-lg bg-surface-overlay">
                      {([
                        ["split", "Smart"],
                        ["fast", "Amazon"],
                        ["electronics", "LCSC"],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setCartStrategy(id)}
                          className={`text-[11px] px-2.5 py-1 rounded-md cursor-pointer ${
                            cartStrategy === id ? "bg-accent text-white font-semibold" : "text-text-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => buyAllParts(plan.parts)}
                      className="text-sm px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent-soft btn-spring cursor-pointer"
                    >
                      Buy all parts →
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text uppercase tracking-wider">Parts ({plan.parts.length})</h3>
              </div>
              <div className="space-y-2">
                {plan.parts.map((p) => (
                  <PartRow key={p.id} part={p} showImage onTooltip={setTooltip} strategy={cartStrategy} />
                ))}
              </div>
            </div>

            {plan.tools?.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-text uppercase tracking-wider mb-3">Tools</h3>
                <div className="grid grid-cols-2 gap-2">
                  {plan.tools.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface border border-border-subtle">
                      <span className="text-sm mr-1">{partIcon(t.name, "")}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${t.required ? "bg-danger" : "bg-text-muted"}`} />
                      <span className="text-sm text-text">{t.name}</span>
                      {!t.required && <span className="text-[10px] text-text-muted ml-auto">optional</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {firmware && (
              <div className="mb-8 p-4 rounded-xl border border-border-subtle bg-surface">
                <p className="text-xs font-semibold text-text uppercase tracking-wider mb-1">Firmware included</p>
                <p className="text-sm text-text-secondary">
                  {firmware.sketches.length} sketches for {firmware.boardLabel} · SDA={String(firmware.pinMap.PIN_SDA)} SCL={String(firmware.pinMap.PIN_SCL)}
                </p>
              </div>
            )}

            <div className="mb-8 p-5 rounded-xl bg-surface border border-border-subtle">
              <h3 className="text-sm font-semibold text-text uppercase tracking-wider mb-3">Setup</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li>Clear a flat, stable work surface with good lighting</li>
                <li>If soldering: work in a well-ventilated area</li>
                <li>Have your multimeter ready — you&apos;ll verify voltages</li>
                <li>Read through all steps once before starting</li>
              </ul>
            </div>

            <button
              onClick={() => setShowPrep(false)}
              disabled={needsAck}
              className="w-full py-4 bg-accent text-white rounded-2xl font-bold text-lg btn-spring disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Start building →
            </button>
            {needsAck && (
              <p className="text-xs text-danger text-center mt-2">Acknowledge critical safety items to continue.</p>
            )}
          </div>
        </div>
        {tooltip && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm p-4 rounded-xl bg-gray-900 text-white text-xs leading-relaxed shadow-lg" onClick={() => setTooltip(null)}>
            {tooltip}
            <p className="text-white/40 mt-1 text-[10px]">Tap to dismiss</p>
          </div>
        )}
      </div>
    );
  }

  // ── Build ──
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="shrink-0 px-4 lg:px-6 py-3 border-b border-border-subtle flex items-center justify-between gap-2">
        <button onClick={goHome} className="text-sm text-text-muted hover:text-text cursor-pointer shrink-0">← Home</button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text truncate max-w-[160px] lg:max-w-[220px]">{plan.title}</span>
          <span className="text-xs text-text-muted hidden sm:inline">{plan.estimatedCost}</span>
        </div>
        <div className="flex items-center gap-1 lg:gap-2 shrink-0 flex-wrap justify-end">
          {(["quick", "standard", "deep"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => {
                setDetailLevel(lvl);
                if (typeof window !== "undefined") localStorage.setItem("forge-detail", lvl);
              }}
              className={`text-xs px-2 py-1 rounded-lg cursor-pointer ${detailLevel === lvl ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              {lvl === "quick" ? "⚡" : lvl === "deep" ? "🔬" : "📖"}
            </button>
          ))}
          <span className="w-px h-4 bg-border mx-0.5 hidden sm:block" />
          <button onClick={() => setShowPrep(true)} className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer">Prep</button>
          {firmware && (
            <button
              onClick={() => { setShowFirmware(true); setFwSketchId(null); }}
              className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${showFirmware ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              Code
            </button>
          )}
          {pcb && (
            <button
              onClick={() => (ercBlocksPcb ? setShowPcbBlocked(true) : setShowPcb(true))}
              title={ercBlocksPcb ? "See why PCB export is blocked — and how to unlock it" : "PCB package"}
              className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${
                ercBlocksPcb
                  ? "text-warning hover:bg-warning-soft"
                  : showPcb
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text"
              }`}
            >
              PCB{ercBlocksPcb ? " ⚠" : ""}
            </button>
          )}
          <button
            onClick={() => setShowCase(true)}
            className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${showCase ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            Case
          </button>
          <button
            onClick={() => setShowPublish(true)}
            className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            Publish
          </button>
          <button
            onClick={() => setShowParts(!showParts)}
            className={`text-xs px-2 py-1.5 rounded-lg cursor-pointer ${showParts ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
          >
            Parts
          </button>
          <button onClick={share} className="text-xs px-2 py-1.5 rounded-lg text-text-muted hover:text-text cursor-pointer">Share</button>
          <button
            onClick={() => buyAllParts(plan.parts)}
            className="text-xs px-2 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-soft cursor-pointer"
          >
            Buy
          </button>
        </div>
      </div>
      {shareMsg && <div className="text-center text-xs py-1 bg-success-soft text-success">{shareMsg}</div>}

      <div className="shrink-0 h-0.5 bg-surface-overlay">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="w-full lg:w-1/2 min-h-[200px] lg:min-h-0 bg-surface border-b lg:border-b-0 lg:border-r border-border-subtle overflow-hidden flex flex-col">
          {detailLevel !== "quick" && (s?.beforeState || s?.afterState) && (
            <div className="shrink-0 grid grid-cols-2 gap-0 border-b border-border-subtle">
              {s?.beforeState && (
                <div className="p-3 border-r border-border-subtle">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Before</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{s.beforeState}</p>
                </div>
              )}
              {s?.afterState && (
                <div className="p-3">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">After</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{s.afterState}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {s ? (
              <StepMediaPanel
                step={s}
                plan={plan}
                visual={productVisual}
                stepIndex={step}
              />
            ) : null}
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 lg:p-10">
            <div className="max-w-md mx-auto">
              {s && (
                <InstructionCard
                  step={s}
                  stepIndex={step}
                  totalSteps={steps.length}
                  kindLabel={(() => {
                    const st = `${s.title || ""} ${s.description || ""}`.toLowerCase();
                    const isMech =
                      /\b(bend|cut|drill|mount|prepare|mark|assemble|install|strip|sand)\b/.test(st) &&
                      !/\b(connect|solder|pin|wire\s+up|upload|code|flash)\b/.test(st);
                    const isWire =
                      /\b(connect|solder|pin|attach|wire\s+up|wiring)\b/.test(st) &&
                      !/\b(brass|copper)\s+wire|bend.*wire/i.test(st);
                    const isSw = /\b(upload|code|program|compile|flash|firmware)\b/.test(st);
                    const isVf = /\b(verify|test|check|measure|confirm|calibrat)\b/.test(st);
                    return isWire
                      ? "Wiring"
                      : isSw
                        ? "Software"
                        : isVf
                          ? "Check"
                          : isMech
                            ? "Hands-on"
                            : "Step";
                  })()}
                  detailLevel={detailLevel}
                />
              )}

              {onSoftwareStep && firmware && (
                <div className="mb-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Firmware ready</p>
                  <p className="text-sm text-text-secondary mb-2">
                    Pins match this plan. Upload Blink first, then I2C scanner, then full app.
                  </p>
                  <button
                    onClick={() => { setShowFirmware(true); setFwSketchId("blink"); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium cursor-pointer"
                  >
                    Open code package →
                  </button>
                </div>
              )}

              <button
                onClick={() => toggleComplete(s?.stepNumber || 0)}
                className={`w-full py-3 rounded-xl font-medium text-sm cursor-pointer mb-2 ${
                  completed.has(s?.stepNumber || 0)
                    ? "bg-success/20 text-success border border-success/20"
                    : "bg-accent text-white btn-spring"
                }`}
              >
                {completed.has(s?.stepNumber || 0) ? "✓ Complete" : "Mark complete"}
              </button>
              <button
                onClick={() => { setShowUnstick(true); setUnstickSymptom(null); }}
                className="w-full py-3 rounded-xl font-medium text-sm cursor-pointer mb-2 border border-warning/30 bg-warning-soft/40 text-warning"
              >
                I&apos;m stuck — help me debug
              </button>
            </div>
          </div>

          <div className="shrink-0 px-6 py-3 border-t border-border-subtle flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-sm text-text-muted hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              ← Previous
            </button>
            <div className="flex gap-1.5 flex-wrap justify-center max-w-[50%]">
              {steps.map((st, i) => (
                <button
                  key={st.stepNumber}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all cursor-pointer ${
                    i === step
                      ? "bg-accent w-4 h-2"
                      : completed.has(st.stepNumber)
                        ? "bg-success w-2 h-2"
                        : "bg-border w-2 h-2"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              disabled={step === steps.length - 1}
              className="text-sm text-text-muted hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {showFirmware && firmware && (
        <FirmwareDrawer fw={firmware} activeId={fwSketchId} onSelect={setFwSketchId} onClose={() => setShowFirmware(false)} />
      )}
      {showPcb && pcb && <PcbDrawer pcb={pcb} onClose={() => setShowPcb(false)} />}
      {showPcbBlocked && plan.electrical && (
        <PcbBlockedDrawer
          electrical={plan.electrical}
          onClose={() => setShowPcbBlocked(false)}
          onOpenPrep={() => {
            setShowPcbBlocked(false);
            setShowPrep(true);
          }}
        />
      )}
      {showCase && <CaseDrawer enc={enclosure} onClose={() => setShowCase(false)} />}
      {showPublish && (
        <PublishDrawer
          authorName={authorName}
          setAuthorName={setAuthorName}
          message={publishMsg}
          onClose={() => { setShowPublish(false); setPublishMsg(""); }}
          onPublish={() => {
            if (plan.electrical && !plan.electrical.erc.canPublishKit) {
              setPublishMsg("Blocked: ERC has errors — fix electrical issues first.");
              return;
            }
            const kit = publishKit({ plan, authorName, tags: [plan.difficulty, "community"] });
            setPublishMsg(`Published /kits/${kit.slug}`);
          }}
          ercBlocked={!!(plan.electrical && !plan.electrical.erc.canPublishKit)}
        />
      )}
      {showUnstick && (
        <UnstickDrawer
          plan={plan}
          step={s}
          stepIndex={step}
          symptom={unstickSymptom}
          onSelectSymptom={setUnstickSymptom}
          onClose={() => { setShowUnstick(false); setUnstickSymptom(null); }}
        />
      )}
      {showParts && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowParts(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-surface border-l border-border shadow-raised z-50 overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border-subtle px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-text">Parts ({plan.parts.length})</h3>
              <button onClick={() => setShowParts(false)} className="text-text-muted text-lg cursor-pointer">×</button>
            </div>
            <div className="p-5 space-y-3">
              {plan.parts.map((p) => (
                <PartRow key={p.id} part={p} compact strategy={cartStrategy} />
              ))}
            </div>
          </div>
        </>
      )}
      {tooltip && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm p-4 rounded-xl bg-gray-900 text-white text-xs leading-relaxed shadow-lg" onClick={() => setTooltip(null)}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Shown instead of a dead-end when ERC blocks PCB export. Explains each blocking
 * problem in plain language with a concrete fix — so the button teaches instead of
 * silently refusing. PCB export re-enables itself once the wiring check clears.
 */
function PcbBlockedDrawer({
  electrical,
  onClose,
  onOpenPrep,
}: {
  electrical: NonNullable<BuildPlan["electrical"]>;
  onClose: () => void;
  onOpenPrep: () => void;
}) {
  const view = presentErc(electrical.erc, electrical.components);
  const blockers = view.errors.length ? view.errors : view.warnings;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex justify-between items-center gap-3">
          <div>
            <h3 className="font-semibold font-serif text-text">Fix wiring to unlock PCB</h3>
            <p className="text-xs text-text-muted mt-0.5">
              A PCB copies your wiring exactly, so it has to be right first. {view.summaryPlain}
            </p>
          </div>
          <button onClick={onClose} className="text-lg text-text-muted cursor-pointer shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {blockers.length === 0 ? (
            <p className="text-sm text-text-secondary">
              The electrical check hasn&apos;t cleared yet. Open the full wiring check for details.
            </p>
          ) : (
            blockers.map((e) => (
              <div key={e.id} className="p-3 rounded-lg bg-danger-soft border border-danger/15">
                <p className="text-sm font-semibold text-danger">{e.plainTitle}</p>
                <p className="text-xs text-text-secondary mt-1">{e.plainDetail}</p>
                <p className="text-xs text-text mt-2">
                  <span className="font-semibold">What to do:</span> {e.plainFix}
                </p>
                <p className="text-[11px] text-text-muted mt-1.5">Why: {e.whyItMatters}</p>
                {e.refLabels.length > 0 && (
                  <p className="text-[11px] text-text-muted mt-1">Parts: {e.refLabels.join(" · ")}</p>
                )}
              </div>
            ))
          )}
        </div>
        <div className="shrink-0 border-t border-border-subtle px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted">PCB export unlocks automatically once these clear.</p>
          <button
            onClick={onOpenPrep}
            className="text-xs px-3 py-2 rounded-lg bg-accent text-white cursor-pointer shrink-0 whitespace-nowrap"
          >
            Open full wiring check
          </button>
        </div>
      </div>
    </>
  );
}

function PcbDrawer({ pcb, onClose }: { pcb: PcbPackage; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex justify-between items-center">
          <div>
            <h3 className="font-semibold font-serif text-text">PCB package</h3>
            <p className="text-xs text-text-muted">
              {pcb.boardWidth.toFixed(0)}×{pcb.boardHeight.toFixed(0)} mm · {pcb.nets.length} nets · {pcb.routes.length} segments
            </p>
          </div>
          <button onClick={onClose} className="text-lg text-text-muted cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-border-subtle overflow-hidden bg-[#0f172a]" dangerouslySetInnerHTML={{ __html: pcb.svg }} />
          <p className="text-xs text-warning">{pcb.disclaimer}</p>
          {pcb.unrouted.length > 0 && (
            <p className="text-xs text-danger">Unrouted: {pcb.unrouted.join(", ")}</p>
          )}
          <pre className="text-[10px] font-mono bg-surface-overlay p-3 rounded-lg max-h-32 overflow-auto text-text-secondary">
            {pcb.netlistText}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadText("forge-netlist.txt", pcb.netlistText)} className="text-xs px-3 py-2 rounded-lg bg-accent text-white cursor-pointer">Netlist</button>
            <button onClick={() => downloadText("forge.kicad_net", pcb.kicadNetlist)} className="text-xs px-3 py-2 rounded-lg border border-border-subtle cursor-pointer">KiCad netlist</button>
            <button onClick={() => downloadText("bom.csv", pcb.bomCsv)} className="text-xs px-3 py-2 rounded-lg border border-border-subtle cursor-pointer">BOM CSV</button>
            <button onClick={() => downloadText("board.svg", pcb.svg)} className="text-xs px-3 py-2 rounded-lg border border-border-subtle cursor-pointer">SVG</button>
            <a href={pcb.jlcpcbUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-2 rounded-lg border border-border-subtle no-underline text-text">JLCPCB quote →</a>
          </div>
        </div>
      </div>
    </>
  );
}

function CaseDrawer({ enc, onClose }: { enc: EnclosurePackage; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex justify-between items-center">
          <div>
            <h3 className="font-semibold font-serif text-text">3D enclosure</h3>
            <p className="text-xs text-text-muted">
              {enc.params.length}×{enc.params.width}×{enc.params.height} mm · wall {enc.params.wall}mm
            </p>
          </div>
          <button onClick={onClose} className="text-lg text-text-muted cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="border border-border-subtle rounded-lg p-2 bg-surface-raised" dangerouslySetInnerHTML={{ __html: enc.topSvg }} />
            <div className="border border-border-subtle rounded-lg p-2 bg-surface-raised" dangerouslySetInnerHTML={{ __html: enc.sideSvg }} />
          </div>
          <ul className="text-xs text-text-secondary space-y-1">
            {enc.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
          <button
            onClick={() => downloadText("forge-enclosure.scad", enc.openscad)}
            className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm cursor-pointer"
          >
            Download OpenSCAD →
          </button>
        </div>
      </div>
    </>
  );
}

function PublishDrawer({
  authorName,
  setAuthorName,
  message,
  onClose,
  onPublish,
  ercBlocked,
}: {
  authorName: string;
  setAuthorName: (s: string) => void;
  message: string;
  onClose: () => void;
  onPublish: () => void;
  ercBlocked?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex justify-between items-center">
          <h3 className="font-semibold font-serif text-text">Publish as kit</h3>
          <button onClick={onClose} className="text-lg text-text-muted cursor-pointer">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary">
            Share this plan as a free DIY kit recipe. ERC must be clean of errors before publish.
          </p>
          {ercBlocked && (
            <p className="text-xs text-danger p-3 rounded-lg bg-danger-soft border border-danger/20">
              Electrical Rules Check has errors. Fix wiring/BOM (or rebuild plan) before publishing a kit others might power on.
            </p>
          )}
          <label className="block text-xs font-medium text-text-muted">
            Your name
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border-subtle bg-surface text-sm text-text"
            />
          </label>
          <button
            onClick={onPublish}
            disabled={ercBlocked}
            className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Publish kit
          </button>
          {message && (
            <p className={`text-sm ${message.startsWith("Blocked") ? "text-danger" : "text-success"}`}>
              {message.startsWith("Published") ? (
                <>
                  {message}{" "}
                  <a href={message.replace("Published ", "")} className="underline">
                    Open
                  </a>
                </>
              ) : (
                message
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function ErcPanel({ electrical }: { electrical: NonNullable<BuildPlan["electrical"]> }) {
  const { erc, components, nets } = electrical;
  const verified = components.filter((c) => c.pinoutGrade === "verified").length;
  const assumed = components.filter((c) => c.pinoutGrade === "assumed").length;
  // Dual audience: beginner plain language first; full ERC under "Technical"
  const view = presentErc(erc, components);

  return (
    <div className="mb-6 p-5 rounded-xl border border-border-subtle bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text uppercase tracking-wider">Wiring check</h3>
          <p className="text-xs text-text-muted mt-1">
            Plain-English problems first · full electrical model (ERC) when you need it
          </p>
        </div>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-1 rounded border shrink-0 ${
            erc.clean
              ? "bg-success-soft text-success border-success/20"
              : "bg-danger-soft text-danger border-danger/20"
          }`}
        >
          {erc.clean ? "Ready" : "Fix before power"}
        </span>
      </div>
      <p className="text-sm text-text mb-3">{view.summaryPlain}</p>

      {view.errors.slice(0, 8).map((e) => (
        <div key={e.id} className="mb-2 p-3 rounded-lg bg-danger-soft border border-danger/15">
          <p className="text-sm font-semibold text-danger">{e.plainTitle}</p>
          <p className="text-xs text-text-secondary mt-1">{e.plainDetail}</p>
          <p className="text-xs text-text mt-2">
            <span className="font-semibold">What to do:</span> {e.plainFix}
          </p>
          <p className="text-[11px] text-text-muted mt-1.5">Why: {e.whyItMatters}</p>
          {e.refLabels.length > 0 && (
            <p className="text-[11px] text-text-muted mt-1">Parts: {e.refLabels.join(" · ")}</p>
          )}
          <details className="mt-2">
            <summary className="text-[10px] font-semibold uppercase tracking-wider text-text-muted cursor-pointer">
              Technical (ERC · {e.rule})
            </summary>
            <div className="mt-1.5 pl-2 border-l-2 border-danger/20">
              <p className="text-[11px] font-mono text-danger">{e.techTitle}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">{e.techDetail}</p>
              {e.nets?.length ? (
                <p className="text-[10px] font-mono text-text-muted mt-1">nets: {e.nets.join(", ")}</p>
              ) : null}
              {e.refs?.length ? (
                <p className="text-[10px] font-mono text-text-muted">refs: {e.refs.join(", ")}</p>
              ) : null}
            </div>
          </details>
        </div>
      ))}

      {view.warnings.slice(0, 4).map((w) => (
        <div key={w.id} className="mb-2 p-3 rounded-lg bg-warning-soft border border-warning/15">
          <p className="text-sm font-semibold text-warning">{w.plainTitle}</p>
          <p className="text-xs text-text-secondary mt-1">{w.plainDetail}</p>
          <p className="text-xs text-text mt-2">
            <span className="font-semibold">What to do:</span> {w.plainFix}
          </p>
          <details className="mt-2">
            <summary className="text-[10px] font-semibold uppercase tracking-wider text-text-muted cursor-pointer">
              Technical (ERC · {w.rule})
            </summary>
            <div className="mt-1.5 pl-2 border-l-2 border-warning/25">
              <p className="text-[11px] font-mono text-warning">{w.techTitle}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">{w.techDetail}</p>
            </div>
          </details>
        </div>
      ))}

      <details className="mt-3">
        <summary className="text-[10px] text-text-muted cursor-pointer uppercase tracking-wider font-semibold">
          Expert: netlist & model stats
        </summary>
        <p className="text-[11px] text-text-muted mt-2">
          {components.length} components · {nets.length} nets · pinouts {verified} verified / {assumed} assumed
          {" · "}
          {view.summaryTech}
        </p>
        <pre className="mt-2 text-[10px] font-mono text-text-secondary overflow-x-auto max-h-48 bg-surface-overlay/50 p-2 rounded-lg">
          {nets
            .map(
              (n) =>
                `${n.name} [${n.netClass}/${n.grade}]: ${n.members.map((m) => `${m.ref}.${m.pin}`).join(" ")}`
            )
            .join("\n")}
        </pre>
        <div className="mt-2 flex flex-wrap gap-1">
          {components.map((c) => (
            <span
              key={c.ref}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary border border-border-subtle"
              title={c.pinoutGrade}
            >
              {c.ref}={c.name.split(" ").slice(0, 3).join(" ")}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}
