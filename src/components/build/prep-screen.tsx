"use client";

import type { BuildPlan, Part } from "@/lib/types";
import { estimateBom, formatUsdRange, type CartStrategy } from "@/lib/cart";
import { filterStepsForMode, modeLabel, type BuildMode } from "@/lib/modes";
import { presentErc } from "@/lib/electrical/present";
import { PartRow, SafetyPanel, partIcon, planNeedsFirmwareHelp } from "@/components/build-ui";
import { PartsIdentifyWalk } from "@/components/build/parts-identify-walk";
import { PowerCheck } from "@/components/build/power-check";
import { ProductHero } from "@/components/product-hero";
import type { ProductVisual } from "@/lib/product-visual";
import type { FirmwarePackage } from "@/lib/firmware";

export interface PrepScreenProps {
  plan: BuildPlan;
  productVisual: ProductVisual;
  firmware: FirmwarePackage | null;
  buildMode: BuildMode;
  cartStrategy: CartStrategy;
  safetyAck: boolean;
  needsAck: boolean;
  shareMsg: string;
  tooltip: string | null;
  onHome: () => void;
  onShare: () => void;
  onBuyAll: (parts: Part[]) => void;
  onPlanPatch: (patch: Partial<BuildPlan>) => void;
  onSetBuildMode: (m: BuildMode) => void;
  onSetCartStrategy: (s: CartStrategy) => void;
  onSetSafetyAck: (ack: boolean) => void;
  onSetTooltip: (t: string | null) => void;
  onStart: () => void;
}

export function PrepScreen({
  plan,
  productVisual,
  firmware,
  buildMode,
  cartStrategy,
  safetyAck,
  needsAck,
  shareMsg,
  tooltip,
  onHome,
  onShare,
  onBuyAll,
  onPlanPatch,
  onSetBuildMode,
  onSetCartStrategy,
  onSetSafetyAck,
  onSetTooltip,
  onStart,
}: PrepScreenProps) {
  const bom =
    plan.bomEstimate ||
    (() => {
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
        <button onClick={onHome} className="text-sm text-text-muted hover:text-text cursor-pointer">← Home</button>
        <span className="text-sm font-medium text-text truncate">{plan.title}</span>
        <div className="flex items-center gap-2">
          <button onClick={onShare} className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-text cursor-pointer">Share</button>
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
            onPlanPatch={onPlanPatch}
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
                onClick={() => onSetBuildMode(m)}
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
          {plan.electrical && (
            <div className="mb-6">
              <PowerCheck plan={plan} />
            </div>
          )}

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
                onChange={(e) => onSetSafetyAck(e.target.checked)}
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
                        onClick={() => onSetCartStrategy(id)}
                        className={`text-[11px] px-2.5 py-1 rounded-md cursor-pointer ${
                          cartStrategy === id ? "bg-accent text-white font-semibold" : "text-text-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => onBuyAll(plan.parts)}
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
            <PartsIdentifyWalk parts={plan.parts} />
            <div className="space-y-2">
              {plan.parts.map((p) => (
                <PartRow key={p.id} part={p} showImage onTooltip={onSetTooltip} strategy={cartStrategy} />
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
          {!firmware && planNeedsFirmwareHelp(plan) && (
            <div className="mb-8 p-4 rounded-xl border border-border-subtle bg-surface">
              <p className="text-xs font-semibold text-text uppercase tracking-wider mb-1">Code: bring your own</p>
              <p className="text-sm text-text-secondary">
                We don&apos;t have code templates for this board yet — the build view includes a
                generic computer-setup guide instead.
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
            onClick={onStart}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm p-4 rounded-xl bg-gray-900 text-white text-xs leading-relaxed shadow-lg" onClick={() => onSetTooltip(null)}>
          {tooltip}
          <p className="text-white/40 mt-1 text-[10px]">Tap to dismiss</p>
        </div>
      )}
    </div>
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
