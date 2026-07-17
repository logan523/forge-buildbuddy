"use client";

import { useState, type ReactNode } from "react";
import type { BuildPlan, BuildStep, MatchConfidence, Part, SafetyFinding } from "@/lib/types";
import {
  bestLink,
  formatUsdRange,
  resolveOffers,
  type CartStrategy,
} from "@/lib/cart";
import {
  diagnose,
  likelihoodLabel,
  relevantSymptoms,
  type Diagnosis,
  type SymptomId,
} from "@/lib/unstick";
import {
  type FirmwarePackage,
  type FirmwareSketch,
} from "@/lib/firmware";
import { confidenceTier, type BadgeTone } from "@/components/ui/badge";
import { DrawerShell } from "@/components/ui/drawer-shell";
import { Icon } from "@/components/ui/icon";

const VENDOR_LABEL: Record<string, string> = {
  amazon: "Amazon", aliexpress: "AliExpress", digikey: "DigiKey", mouser: "Mouser", lcsc: "LCSC", other: "Buy",
};

// Beginner glossary lives in src/lib/glossary.ts (one authority; step text
// popovers and part-row tooltips share it).
import { glossaryTip } from "@/lib/glossary";
import { buyGuidance } from "@/lib/part-identity";
import { IsolationWalkPanel } from "@/components/build/isolation-walk-panel";

// ── Part category icons ──
// Same 12-branch text guesser as before; each branch now returns a lucide
// Icon element (decorative — the part name/spec always renders right next to
// it) instead of an emoji string. Return type is ReactNode so it still drops
// straight into JSX at every call site, including the two outside this file
// that interpolate it as a plain child (parts-identify-walk.tsx, prep-screen.tsx).
export function partIcon(name: string, spec: string): ReactNode {
  const t = `${name} ${spec}`.toLowerCase();
  const cls = "text-text-muted";
  if (t.includes("oled") || t.includes("display") || t.includes("lcd") || t.includes("screen")) return <Icon name="monitor" className={cls} />;
  if (t.includes("esp32") || t.includes("arduino") || t.includes("pico") || t.includes("microcontroller") || t.includes("mcu")) return <Icon name="cpu" className={cls} />;
  if (t.includes("battery") || t.includes("lipo") || t.includes("li-ion") || t.includes("18650") || t.includes("16340")) return <Icon name="battery" className={cls} />;
  if (t.includes("sensor") || t.includes("sht31") || t.includes("dht") || t.includes("bme")) return <Icon name="thermometer" className={cls} />;
  if (t.includes("solar") || t.includes("panel")) return <Icon name="sun" className={cls} />;
  if (t.includes("wire") || t.includes("cable") || t.includes("connector")) return <Icon name="zap" className={cls} />;
  if (t.includes("charger") || t.includes("tp4056") || t.includes("charging") || t.includes("bms")) return <Icon name="zap" className={cls} />;
  if (t.includes("bamboo") || t.includes("wood") || t.includes("coaster")) return <Icon name="package" className={cls} />;
  if (t.includes("brass") || t.includes("copper") || t.includes("metal") || t.includes("tube")) return <Icon name="ruler" className={cls} />;
  if (t.includes("switch") || t.includes("button") || t.includes("touch")) return <Icon name="hand" className={cls} />;
  if (t.includes("resistor") || t.includes("capacitor") || t.includes("diode")) return <Icon name="package" className={cls} />;
  if (t.includes("solder") || t.includes("iron") || t.includes("cutter") || t.includes("plier") || t.includes("multimeter")) return <Icon name="wrench" className={cls} />;
  return <Icon name="package" className={cls} />;
}

// Badge's tone → className pairs (bg-*-soft / text-* / border-*/20), mirrored
// here since confidenceBadge returns a plain {label, className} object — not
// JSX — to keep its exported signature stable for existing callers.
const TONE_CLASS: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success border-success/20",
  info: "bg-info-soft text-info border-info/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  neutral: "bg-surface-overlay text-text-muted border-border-subtle",
};

// matchConfidence category → a representative score, so the copy comes from
// the same confidenceTier() thresholds used everywhere else (>=55 "Catalog
// match", >=30 "Likely match", else "Best guess") instead of a second,
// drifting copy of the same three tiers. Floors mirror matchPart()'s own
// high/medium bucket boundaries in catalog.ts.
const CONFIDENCE_SCORE: Partial<Record<MatchConfidence, number>> = {
  high: 55,
  medium: 35,
};

export function confidenceBadge(part: Part): { label: string; className: string } | null {
  // Honest, never "verified" — we know which part, we never tested it works.
  const tier = confidenceTier(part.matchConfidence ? CONFIDENCE_SCORE[part.matchConfidence] : undefined);
  return { label: tier.label, className: TONE_CLASS[tier.tone] };
}

export function PartRow({
  part,
  showImage,
  compact,
  onTooltip,
  strategy = "split",
}: {
  part: Part;
  showImage?: boolean;
  compact?: boolean;
  onTooltip?: (t: string | null) => void;
  strategy?: CartStrategy;
}) {
  const link = bestLink(part, strategy);
  const alts = resolveOffers(part).filter((o) => o.vendor !== link.vendor).slice(0, 3);
  const tip = glossaryTip(`${part.name} ${part.specification}`);
  const badge = !compact ? confidenceBadge(part) : null;
  const guidance = !compact ? buyGuidance(part) : null;
  const hasGuidance = !!(guidance && (guidance.lookFor || guidance.priceBand || guidance.avoid));
  const footgunTip = part.footguns?.[0];
  const priceLabel = formatUsdRange(
    part.unitPriceMin ?? link.priceUsd,
    part.unitPriceMax ?? link.priceMaxUsd ?? link.priceUsd
  );
  const linePrice =
    part.unitPriceMin != null
      ? formatUsdRange(
          part.unitPriceMin * (part.quantity || 1),
          (part.unitPriceMax ?? part.unitPriceMin) * (part.quantity || 1)
        )
      : null;

  return (
    <div className={`p-3 rounded-lg bg-surface border border-border-subtle ${compact ? "" : ""}`}>
      <div className="flex items-center gap-3">
        {showImage && (
          <span className="text-xl shrink-0" title={`${part.name}: ${part.specification}`}>
            {partIcon(part.name, part.specification)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm text-text font-medium truncate">{part.name}</span>
            {badge && (
              <span className={`text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.className}`}>
                {badge.label}
              </span>
            )}
            {part.priceSource === "live" && (
              <span className="text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-success-soft text-success border-success/20">
                Live $
              </span>
            )}
            {tip && onTooltip && (
              <button onClick={(e) => { e.stopPropagation(); onTooltip(tip); }}
                className="shrink-0 w-4 h-4 rounded-full bg-accent/10 text-accent text-2xs font-bold flex items-center justify-center cursor-help hover:bg-accent/20 transition-colors"
                title="What's this?">?</button>
            )}
            {footgunTip && onTooltip && (
              <button onClick={(e) => { e.stopPropagation(); onTooltip(footgunTip); }}
                className="shrink-0 text-2xs text-warning cursor-help hover:underline"
                title={footgunTip}>gotcha</button>
            )}
          </div>
          <div className="text-xs text-text-muted truncate">{part.specification}</div>
        </div>
        <div className="text-right shrink-0">
          {linePrice && linePrice !== "—" && (
            <div className="text-xs font-mono font-semibold text-text tabular-nums">{linePrice}</div>
          )}
          <div className="text-2xs text-text-muted">
            ×{part.quantity}
            {priceLabel !== "—" ? ` · ${priceLabel}/ea` : ""}
          </div>
        </div>
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-soft transition-all no-underline">
          {VENDOR_LABEL[link.vendor] || "Buy"} →
        </a>
      </div>
      {!compact && alts.length > 0 && (
        <div className="mt-2 ml-9 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-text-muted">Also:</span>
          {alts.map((o) => (
            <a
              key={`${o.vendor}-${o.url}`}
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xs px-2 py-0.5 rounded-md border border-border-subtle text-text-secondary hover:border-accent/40 hover:text-accent no-underline transition-colors"
            >
              {VENDOR_LABEL[o.vendor] || o.label}
              {o.kind === "product" ? " ★" : ""}
            </a>
          ))}
        </div>
      )}
      {hasGuidance && (
        <details className="mt-2 ml-9 group">
          <summary className="text-[11px] font-medium text-accent cursor-pointer min-h-[22px]">
            Know it when you see it
          </summary>
          <div className="mt-1 space-y-1 text-[11px] text-text-secondary">
            {guidance!.lookFor && (
              <p>
                <span className="text-text-muted">Look for:</span>{" "}
                <span className="text-text font-medium">{guidance!.lookFor}</span>
              </p>
            )}
            {guidance!.priceBand && (
              <p>
                <span className="text-text-muted">Expect:</span>{" "}
                <span className="text-text font-medium">{guidance!.priceBand}</span>
                <span className="text-text-muted"> — much cheaper usually means the wrong thing</span>
              </p>
            )}
            {guidance!.avoid && (
              <p className="text-warning">
                <span className="font-medium">Avoid:</span> {guidance!.avoid}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function FirmwareDrawer({
  fw,
  activeId,
  onSelect,
  onClose,
}: {
  fw: FirmwarePackage;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const sketch: FirmwareSketch | undefined =
    fw.sketches.find((s) => s.id === activeId) || fw.sketches[0];
  const showingPins = activeId === "pins" || activeId === "pio";
  const body =
    activeId === "pins"
      ? fw.pinDefines
      : activeId === "pio"
        ? fw.platformioIni
        : activeId === "readme"
          ? fw.readme
          : sketch?.code || "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      activeId === "pins"
        ? "pins.h"
        : activeId === "pio"
          ? "platformio.ini"
          : activeId === "readme"
            ? "README.md"
            : sketch?.filename.split("/").pop() || "sketch.ino";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DrawerShell
      title="Firmware package"
      onClose={onClose}
      width="lg"
      footer={
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold cursor-pointer hover:bg-accent-soft"
          >
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
          <button
            onClick={download}
            className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm text-text-secondary cursor-pointer hover:text-text"
          >
            Download
          </button>
        </div>
      }
    >
      <p className="text-xs text-text-muted mt-0.5">
        {fw.boardLabel} · {fw.arduinoBoard}
      </p>

      <div className="shrink-0 px-4 py-2 border-b border-border-subtle overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {fw.sketches.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`text-[11px] px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap ${
                (activeId || fw.sketches[0].id) === s.id
                  ? "bg-accent text-white font-semibold"
                  : "text-text-muted hover:text-text bg-surface-overlay"
              }`}
            >
              {s.name.split("·")[0].trim()}
            </button>
          ))}
          <button
            onClick={() => onSelect("pins")}
            className={`text-[11px] px-2.5 py-1 rounded-lg cursor-pointer ${
              activeId === "pins" ? "bg-accent text-white font-semibold" : "text-text-muted bg-surface-overlay"
            }`}
          >
            pins.h
          </button>
          <button
            onClick={() => onSelect("pio")}
            className={`text-[11px] px-2.5 py-1 rounded-lg cursor-pointer ${
              activeId === "pio" ? "bg-accent text-white font-semibold" : "text-text-muted bg-surface-overlay"
            }`}
          >
            PIO
          </button>
          <button
            onClick={() => onSelect("readme")}
            className={`text-[11px] px-2.5 py-1 rounded-lg cursor-pointer ${
              activeId === "readme" ? "bg-accent text-white font-semibold" : "text-text-muted bg-surface-overlay"
            }`}
          >
            README
          </button>
        </div>
      </div>

      {!showingPins && sketch && activeId !== "readme" && activeId !== "pio" && (
        <div className="shrink-0 px-5 py-3 border-b border-border-subtle bg-surface-raised">
          <p className="text-sm font-medium text-text">{sketch.name}</p>
          <p className="text-xs text-text-secondary mt-0.5">{sketch.description}</p>
          {sketch.libraries.length > 0 && (
            <p className="text-2xs text-text-muted mt-1">
              Libraries: {sketch.libraries.join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 bg-console-surface-raised">
        <pre className="text-[11px] leading-relaxed text-console-text font-mono whitespace-pre-wrap break-words">
          {body}
        </pre>
      </div>
    </DrawerShell>
  );
}

export function UnstickDrawer({
  plan,
  step,
  stepIndex,
  symptom,
  onSelectSymptom,
  onClose,
}: {
  plan: BuildPlan;
  step?: BuildStep;
  stepIndex: number;
  symptom: SymptomId | null;
  onSelectSymptom: (id: SymptomId | null) => void;
  onClose: () => void;
}) {
  const symptoms = relevantSymptoms(plan, step);
  const diagnoses: Diagnosis[] = symptom ? diagnose(plan, symptom, step) : [];

  return (
    <DrawerShell title="I'm stuck" onClose={onClose} width="md">
      <p className="text-xs text-text-muted mt-0.5">
        Step {stepIndex + 1}
        {step?.title ? ` · ${step.title}` : ""}
      </p>

      {!symptom && (
        <>
          <p className="text-sm text-text-secondary">
            What are you seeing? We&apos;ll walk through the most likely causes first — no random guessing.
          </p>
          <div className="space-y-2">
            {symptoms.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSelectSymptom(opt.id)}
                className="w-full text-left p-3 rounded-xl border border-border-subtle bg-surface hover:border-accent/40 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-sm font-medium text-text">{opt.label}</span>
                </div>
                <p className="text-xs text-text-muted mt-1 ml-8">{opt.hint}</p>
              </button>
            ))}
          </div>
          <IsolationWalkPanel plan={plan} />
        </>
      )}

      {symptom && (
        <>
          <button
            onClick={() => onSelectSymptom(null)}
            className="text-xs text-text-muted hover:text-text cursor-pointer"
          >
            ← Different symptom
          </button>

          {diagnoses[0]?.isolation && (
            <div className="p-4 rounded-xl bg-info-soft border border-info/20">
              <p className="text-2xs font-semibold text-info uppercase tracking-wider mb-1">Start here</p>
              <p className="text-sm text-text-secondary">{diagnoses[0].isolation}</p>
            </div>
          )}

          <div className="space-y-3">
            {diagnoses.map((diag, idx) => (
              <details key={diag.id} open={idx === 0} className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 hover:bg-surface-overlay/50">
                  <span className="shrink-0 mt-0.5 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{diag.title}</p>
                    <p className="text-2xs text-text-muted mt-0.5">
                      {likelihoodLabel(diag.likelihood)}
                      {diag.source === "step" ? " · from this step" : ""}
                      {diag.source === "catalog" ? " · catalog" : ""}
                    </p>
                  </div>
                </summary>
                <div className="px-4 pb-4 border-t border-border-subtle pt-3">
                  <p className="text-xs text-text-secondary mb-3">
                    <span className="font-medium text-text">Why: </span>
                    {diag.cause}
                  </p>
                  <ol className="space-y-3">
                    {diag.actions.map((a) => (
                      <li key={a.order} className="text-xs">
                        <p className="font-medium text-text">
                          {a.order}. {a.action}
                        </p>
                        <p className="text-success mt-0.5">Expect: {a.expect}</p>
                        {a.ifFail && (
                          <p className="text-text-muted mt-0.5">If not: {a.ifFail}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>

          {diagnoses.length === 0 && (
            <p className="text-sm text-text-secondary">
              No specific tree for this yet — try the general isolation path from &quot;Something else&quot;.
            </p>
          )}
        </>
      )}
    </DrawerShell>
  );
}

export function SafetyPanel({ report }: { report: NonNullable<BuildPlan["safetyReport"]> }) {
  const critical = report.findings.filter((f) => f.severity === "critical");
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const info = report.findings.filter((f) => f.severity === "info").slice(0, 4);

  if (report.findings.length === 0) {
    return (
      <div className="mb-8 p-4 rounded-xl bg-success-soft border border-success/20">
        <p className="text-sm font-medium text-success">Automated safety scan found no issues</p>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-3">
      {report.hazardTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.hazardTags.map((tag) => (
            <span key={tag} className="text-2xs font-mono font-semibold px-2 py-0.5 rounded bg-surface-overlay border border-border-subtle text-text-secondary">
              [{tag}]
            </span>
          ))}
        </div>
      )}
      {critical.map((f) => (
        <FindingCard key={f.id} finding={f} tone="critical" />
      ))}
      {warnings.map((f) => (
        <FindingCard key={f.id} finding={f} tone="warning" />
      ))}
      {info.length > 0 && (
        <details className="rounded-xl border border-border-subtle bg-surface p-4">
          <summary className="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer">
            Catalog notes ({info.length})
          </summary>
          <div className="mt-3 space-y-2">
            {info.map((f) => (
              <div key={f.id}>
                <p className="text-xs font-medium text-text">{f.title}</p>
                <p className="text-xs text-text-secondary">{f.detail}</p>
                {f.mitigation && <p className="text-xs text-success mt-0.5">{f.mitigation}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
      {report.requiresAttention && (
        <p className="text-xs text-danger font-medium">
          Resolve critical items above before first power-on.
        </p>
      )}
    </div>
  );
}

export function FindingCard({ finding, tone }: { finding: SafetyFinding; tone: "critical" | "warning" }) {
  const styles =
    tone === "critical"
      ? "bg-danger-soft border-danger/20"
      : "bg-warning-soft border-warning/20";
  const titleColor = tone === "critical" ? "text-danger" : "text-warning";
  return (
    <div className={`p-4 rounded-xl border ${styles}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${titleColor}`}>
        {tone === "critical" ? "Critical" : "Warning"} · {finding.title}
      </p>
      <p className="text-sm text-text-secondary">{finding.detail}</p>
      {finding.mitigation && (
        <p className="text-xs text-text mt-2">
          <span className="font-medium">Do this: </span>
          {finding.mitigation}
        </p>
      )}
    </div>
  );
}
