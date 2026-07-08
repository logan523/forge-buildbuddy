"use client";

import { useState, useEffect } from "react";
import type { BuildPlan, BuildStep, Part, SafetyFinding } from "@/lib/types";
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

const VENDOR_LABEL: Record<string, string> = {
  amazon: "Amazon", aliexpress: "AliExpress", digikey: "DigiKey", mouser: "Mouser", lcsc: "LCSC", other: "Buy",
};

// ── Beginner glossary ──
const GLOSSARY: Record<string, string> = {
  "i2c": "A way for components to talk to each other using just 2 wires (SDA and SCL). Very common for displays and sensors. Your board sends data; the component responds.",
  "spi": "A faster way for components to communicate using 4 wires. Used for SD cards, some displays, and high-speed sensors.",
  "uart": "The simplest communication — one wire sends, one receives. Used for GPS modules, some sensors, and debugging.",
  "gpio": "General Purpose Input/Output — a pin on your board that you can control. Think of it like a light switch or a sensor that the board can turn on/off or read.",
  "sda": "Serial Data — the wire that carries the actual information in an I2C connection. One of the two I2C wires.",
  "scl": "Serial Clock — the wire that keeps timing in an I2C connection. Like a metronome keeping the data in sync.",
  "ssd1306": "The chip inside most small OLED displays. It controls the pixels. If you search for 'SSD1306 OLED', you'll find the right display.",
  "esp32": "A tiny, cheap computer with WiFi and Bluetooth built in. Popular for DIY projects because it's powerful and costs under $5.",
  "esp32-c3": "A newer, smaller version of the ESP32. Uses less power. Great for battery-powered projects.",
  "tp4056": "A charging chip for lithium batteries. Automatically stops charging when full so the battery doesn't overheat or catch fire.",
  "sht31d": "A precise temperature and humidity sensor. More accurate than the cheaper DHT11/DHT22 sensors.",
  "16340": "A size of lithium battery — 16mm wide, 34mm long. About the size of a AA battery but rechargeable and 3.7 volts.",
  "18650": "A larger lithium battery — 18mm wide, 65mm long. Common in laptops and power banks. Holds more power than a 16340.",
  "jst": "A type of small white plastic connector. Common on batteries and small electronics. They click into place so they don't come loose.",
  "dupont": "The little black rectangular connectors used on breadboard jumper wires. Named after the company that invented them.",
  "bms": "Battery Management System — a safety circuit that prevents overcharging, over-discharging, and short circuits. Essential for lithium batteries.",
};

export function glossaryTip(term: string): string | null {
  const key = term.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(GLOSSARY)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// ── Part category icons ──
export function partIcon(name: string, spec: string): string {
  const t = `${name} ${spec}`.toLowerCase();
  if (t.includes("oled") || t.includes("display") || t.includes("lcd") || t.includes("screen")) return "🖥";
  if (t.includes("esp32") || t.includes("arduino") || t.includes("pico") || t.includes("microcontroller") || t.includes("mcu")) return "🧠";
  if (t.includes("battery") || t.includes("lipo") || t.includes("li-ion") || t.includes("18650") || t.includes("16340")) return "🔋";
  if (t.includes("sensor") || t.includes("sht31") || t.includes("dht") || t.includes("bme")) return "🌡";
  if (t.includes("solar") || t.includes("panel")) return "☀️";
  if (t.includes("wire") || t.includes("cable") || t.includes("connector")) return "🔌";
  if (t.includes("charger") || t.includes("tp4056") || t.includes("charging") || t.includes("bms")) return "⚡";
  if (t.includes("bamboo") || t.includes("wood") || t.includes("coaster")) return "🪵";
  if (t.includes("brass") || t.includes("copper") || t.includes("metal") || t.includes("tube")) return "🔧";
  if (t.includes("switch") || t.includes("button") || t.includes("touch")) return "🔘";
  if (t.includes("resistor") || t.includes("capacitor") || t.includes("diode")) return "📦";
  if (t.includes("solder") || t.includes("iron") || t.includes("cutter") || t.includes("plier") || t.includes("multimeter")) return "🛠";
  return "📦";
}


export function confidenceBadge(part: Part): { label: string; className: string } | null {
  const c = part.matchConfidence;
  if (!c || c === "none") return { label: "ASSUMED", className: "bg-surface-overlay text-text-muted border-border-subtle" };
  if (c === "high") return { label: "VERIFIED", className: "bg-success-soft text-success border-success/20" };
  if (c === "medium") return { label: "MATCHED", className: "bg-info-soft text-info border-info/20" };
  return { label: "LOW", className: "bg-warning-soft text-warning border-warning/20" };
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
              <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.className}`}>
                {badge.label}
              </span>
            )}
            {part.priceSource === "live" && (
              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-success-soft text-success border-success/20">
                Live $
              </span>
            )}
            {tip && onTooltip && (
              <button onClick={(e) => { e.stopPropagation(); onTooltip(tip); }}
                className="shrink-0 w-4 h-4 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center cursor-help hover:bg-accent/20 transition-colors"
                title="What's this?">?</button>
            )}
            {footgunTip && onTooltip && (
              <button onClick={(e) => { e.stopPropagation(); onTooltip(footgunTip); }}
                className="shrink-0 text-[10px] text-warning cursor-help hover:underline"
                title={footgunTip}>gotcha</button>
            )}
          </div>
          <div className="text-xs text-text-muted truncate">{part.specification}</div>
        </div>
        <div className="text-right shrink-0">
          {linePrice && linePrice !== "—" && (
            <div className="text-xs font-mono font-semibold text-text tabular-nums">{linePrice}</div>
          )}
          <div className="text-[10px] text-text-muted">
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
          <span className="text-[10px] text-text-muted">Also:</span>
          {alts.map((o) => (
            <a
              key={`${o.vendor}-${o.url}`}
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-2 py-0.5 rounded-md border border-border-subtle text-text-secondary hover:border-accent/40 hover:text-accent no-underline transition-colors"
            >
              {VENDOR_LABEL[o.vendor] || o.label}
              {o.kind === "product" ? " ★" : ""}
            </a>
          ))}
        </div>
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
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text font-serif">Firmware package</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {fw.boardLabel} · {fw.arduinoBoard}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg cursor-pointer px-2">×</button>
        </div>

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
              <p className="text-[10px] text-text-muted mt-1">
                Libraries: {sketch.libraries.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 bg-[#1a1f2e]">
          <pre className="text-[11px] leading-relaxed text-[#e2e8f0] font-mono whitespace-pre-wrap break-words">
            {body}
          </pre>
        </div>

        <div className="shrink-0 border-t border-border-subtle px-5 py-3 flex items-center gap-2">
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
      </div>
    </>
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
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface border-l border-border shadow-raised z-50 flex flex-col">
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text font-serif">I&apos;m stuck</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Step {stepIndex + 1}
              {step?.title ? ` · ${step.title}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg cursor-pointer px-2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
                  <p className="text-[10px] font-semibold text-info uppercase tracking-wider mb-1">Start here</p>
                  <p className="text-sm text-text-secondary">{diagnoses[0].isolation}</p>
                </div>
              )}

              <div className="space-y-3">
                {diagnoses.map((diag, idx) => (
                  <details key={diag.id} open={idx === 0} className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
                    <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 hover:bg-surface-overlay/50">
                      <span className="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text">{diag.title}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
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
        </div>
      </div>
    </>
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
            <span key={tag} className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-surface-overlay border border-border-subtle text-text-secondary">
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

// ── Multi-Modal Step Visual System ──

export function StepVisual({
  step,
  stepIndex,
  totalSteps,
  connections,
  parts,
  assemblySvg,
  assemblyCaption,
}: {
  step: BuildStep;
  stepIndex: number;
  totalSteps: number;
  connections: { from: string; to: string; wireColor?: string }[];
  parts: Part[];
  /** Primary schematic from product-visual (same canvas as hero) */
  assemblySvg?: string;
  assemblyCaption?: string;
}) {
  const text = `${step.title || ""} ${step.description || ""}`.toLowerCase();
  const title = step.title || "";
  const photoUrl = step.photoUrl;

  // Step type detection
  const isMechanical = /\b(bend|cut|drill|mount|prepare|mark|assemble|install|strip|sand)\b/.test(text) &&
    !/\b(connect|solder|pin|wire\s+up|upload|code|flash)\b/.test(text);
  const isWiring = /\b(connect|solder|pin|attach|wire\s+up|wiring)\b/.test(text) &&
    !/\b(brass|copper)\s+wire|bend.*wire|wire.*frame/i.test(text);
  const isSoftware = /\b(upload|code|program|compile|flash|firmware|arduino\s*ide|platformio)\b/.test(text);
  const isVerify = /\b(verify|test|check|measure|confirm|calibrat)\b/.test(text);

  // Extract structured data from step text
  const fullText = step.description || "";
  const dimensions = fullText.match(/(\d+\.?\d*\s*(?:mm|cm|inch)[\s\w]*)/gi) || [];
  const angles = fullText.match(/(\d+)\s*°\s*(?:angle|bend|turn)/gi) || [];
  const pinRefs = fullText.match(/(?:Pin|GPIO|GND|VCC|VIN|SDA|SCL|3\.3V|5V)\s*\d*/gi) || [];
  const wireColors = fullText.match(/(?:red|black|blue|yellow|green|white|orange|brown|purple)\s+(?:wire|cable|jumper)/gi) || [];

  // Find relevant parts for this step
  const stepParts = parts.filter((p) => {
    const pt = `${p.name} ${p.specification}`.toLowerCase();
    const words = p.name.toLowerCase().split(/\s+/);
    return words.some((w: string) => w.length > 3 && text.includes(w));
  });

  // Build Graphviz DOT for component layout
  const dotSource = buildComponentLayout(stepParts, connections, text);

  return (
    <div className="w-full h-full overflow-y-auto">
      {/* Primary: deterministic product assembly (end product decomposing by step) */}
      {assemblySvg && (
        <div className="p-2 space-y-2">
          {assemblyCaption && (
            <p className="text-xs text-text-secondary px-1 leading-relaxed">{assemblyCaption}</p>
          )}
          <div
            className="rounded-lg border border-border-subtle overflow-hidden bg-[#fafaf9]"
            dangerouslySetInnerHTML={{ __html: assemblySvg }}
          />
          <p className="text-[10px] text-text-muted text-center uppercase tracking-wider font-semibold">
            Step {stepIndex + 1} of {totalSteps} · schematic assembly
          </p>
        </div>
      )}

      {/* Real photo — shown for any step that has one */}
      {photoUrl && (
        <div className="p-2">
          <img
            src={photoUrl}
            alt={title}
            className="w-full rounded-lg border border-border-subtle object-cover"
            style={{ maxHeight: "280px" }}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}

      {/* Secondary detail: wiring / mechanical diagrams */}
      {isWiring && connections.length > 0 && (
        <div className="space-y-4 p-2">
          <details className={assemblySvg ? "" : "open"}>
            <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer px-1 py-1">
              Wiring detail
            </summary>
          {/* Component layout diagram */}
          {dotSource && (
            <div className="rounded-lg border border-border-subtle overflow-hidden mt-2">
              <div className="px-3 py-1.5 bg-surface-raised border-b border-border-subtle">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Component Layout</span>
              </div>
              <GraphvizDiagram dot={dotSource} />
            </div>
          )}
          {/* Connection flow diagram */}
          <div className="rounded-lg border border-border-subtle overflow-hidden mt-2">
            <div className="px-3 py-1.5 bg-surface-raised border-b border-border-subtle">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Wiring Connections</span>
            </div>
            <WiringDiagram connections={connections} />
          </div>
          {/* Pin mapping table */}
          {pinRefs.length > 0 && (
            <div className="rounded-lg border border-border-subtle overflow-hidden mt-2">
              <div className="px-3 py-1.5 bg-surface-raised border-b border-border-subtle">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Pin Reference</span>
              </div>
              <div className="p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  {[...new Set(pinRefs)].slice(0, 12).map((pin, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-accent/5 text-text-secondary font-mono border border-border-subtle">{pin}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          </details>
        </div>
      )}

      {isMechanical && (
        <div className="space-y-4 p-2">
          <details className={assemblySvg ? "" : "open"}>
            <summary className="text-[10px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer px-1 py-1">
              Dimensions & parts
            </summary>
          {(dimensions.length > 0 || angles.length > 0) && (
            <div className="rounded-lg border border-border-subtle overflow-hidden mt-2">
              <div className="px-3 py-1.5 bg-surface-raised border-b border-border-subtle">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Dimensions</span>
              </div>
              <ShapeSVG description={fullText} dimensions={dimensions} angles={angles} />
            </div>
          )}
          {stepParts.length > 0 && (
            <div className="rounded-lg border border-border-subtle overflow-hidden mt-2">
              <div className="px-3 py-1.5 bg-surface-raised border-b border-border-subtle">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Parts for this step</span>
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {stepParts.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-surface border border-border-subtle min-w-[60px]">
                    <span className="text-xl">{partIcon(p.name, p.specification)}</span>
                    <span className="text-[9px] text-text-secondary font-mono text-center leading-tight max-w-[70px] truncate">{p.name}</span>
                    <span className="text-[10px] text-accent font-semibold">×{p.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </details>
        </div>
      )}

      {isSoftware && !assemblySvg && (
        <div className="space-y-4 p-2 text-center">
          <div className="text-4xl">💻</div>
          <p className="text-sm text-text font-medium">{title}</p>
          <p className="text-xs text-text-secondary">Connect your board via USB and follow the instructions on the right.</p>
          <p className="text-[10px] text-text-muted">Make sure the correct board and port are selected in your IDE</p>
        </div>
      )}

      {isVerify && (
        <div className="space-y-4 p-2 text-center">
          {!assemblySvg && <div className="text-4xl">✅</div>}
          <p className="text-sm text-text font-medium">Verification Checkpoint</p>
          {step.verification && (
            <div className="p-3 rounded-lg bg-success-soft border border-success/20 text-left">
              <p className="text-xs text-text-secondary">{step.verification.description}</p>
              {step.verification.expectedOutput && (
                <p className="text-xs text-success font-medium mt-1">Expected: {step.verification.expectedOutput}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fallback only when no assembly svg */}
      {!assemblySvg && !isWiring && !isMechanical && !isSoftware && !isVerify && (
        <div className="space-y-4 p-2 text-center">
          {stepParts.length > 0 ? (
            <>
              <p className="text-sm text-text font-medium">{title}</p>
              <p className="text-xs text-text-secondary">Step {stepIndex + 1} of {totalSteps}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {stepParts.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-surface border border-border-subtle min-w-[60px]">
                    <span className="text-xl">{partIcon(p.name, p.specification)}</span>
                    <span className="text-[9px] text-text-secondary font-mono text-center leading-tight max-w-[70px] truncate">{p.name}</span>
                  </div>
                ))}
              </div>
              {dimensions.length > 0 && (
                <div className="mt-2">
                  {dimensions.map((d: string, i: number) => (
                    <span key={i} className="text-xs font-mono text-accent font-semibold block">{d}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-text font-medium">{title}</p>
              <p className="text-xs text-text-secondary">Step {stepIndex + 1} of {totalSteps}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Build a Graphviz DOT diagram for component layout
export function buildComponentLayout(
  stepParts: Part[],
  connections: { from: string; to: string; wireColor?: string }[],
  stepText: string
): string | null {
  if (stepParts.length < 2) return null;

  const nodes = new Set<string>();
  const edges: string[] = [];

  // Add nodes from step-relevant parts
  for (const p of stepParts) {
    const id = p.name.replace(/[^a-zA-Z0-9]/g, "_");
    if (!nodes.has(id)) {
      nodes.add(id);
    }
  }

  // Add nodes from connections that reference these parts
  for (const c of connections) {
    const fromId = c.from.replace(/[^a-zA-Z0-9]/g, "_");
    const toId = c.to.replace(/[^a-zA-Z0-9]/g, "_");
    if (!nodes.has(fromId)) nodes.add(fromId);
    if (!nodes.has(toId)) nodes.add(toId);
    const color = c.wireColor || "black";
    edges.push(`  ${fromId} -> ${toId} [color=${color}, fontcolor=${color}];`);
  }

  if (nodes.size === 0) return null;

  const nodeDecls = Array.from(nodes).map((n) => {
    const label = n.replace(/_/g, " ");
    return `  ${n} [label="${label}", shape=box, style=rounded];`;
  });

  return `digraph Layout {
  rankdir=LR;
  node [fontsize=10, fontname="sans-serif"];
  edge [fontsize=8];
${nodeDecls.join("\n")}
${edges.join("\n")}
}`;
}

// Inline SVG for mechanical dimensions and angles
// Shape-aware SVG for mechanical steps — renders the actual form, not just a line
export function ShapeSVG({ description, dimensions, angles }: { description: string; dimensions: string[]; angles: string[] }) {
  if (dimensions.length === 0 && angles.length === 0) return null;

  const text = description.toLowerCase();
  const w = 340;
  const h = 200;
  const cx = w / 2;
  const cy = h / 2;

  // Extract numeric values from dimensions
  const nums = dimensions.map((d) => parseFloat(d.replace(/[^0-9.]/g, "")) || 1);
  const maxDim = Math.max(...nums, 1);

  // Scale factor: map max dimension to ~60% of SVG width
  const scale = (w * 0.5) / maxDim;

  // Detect shape
  const isUShape = /\bu[-\s]?shape\b|u-bend|two\s+(?:90°|ninety)/i.test(text) ||
    (angles.length >= 2 && nums.length >= 3 && /\bleg/i.test(text));
  const isLShape = /\bl[-\s]?shape\b|l-bend|single\s+(?:90°|ninety)|right\s+angle/i.test(text) ||
    (angles.length >= 1 && nums.length >= 2 && !isUShape);
  const isFrame = /\bframe\b|\brectangle\b|\bsquare\s+shape\b/i.test(text);
  const isCoil = /\bcoil\b|\bwrap\b|\bspiral\b/i.test(text);
  const isStraight = /\bcut\b|\bstraight\b|\bstrip\b|\blength\b/i.test(text) && !isUShape && !isLShape && !isFrame;

  const strokeColor = "#1a2744";
  const accentColor = "#0891b2";
  const dimColor = "#0e7490";

  return (
    <div className="p-4 bg-[#fafaf9] rounded-lg">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: "220px" }}>
        {/* Grid dots for spatial reference */}
        {Array.from({ length: 8 }).map((_, i) =>
          Array.from({ length: 6 }).map((_, j) => (
            <circle key={`${i}-${j}`} cx={20 + i * 45} cy={15 + j * 35} r="0.8" fill="#d4c8b8" />
          ))
        )}

        {isUShape && (
          <>
            {/* U-shape: left leg down → base across → right leg up */}
            {(() => {
              const leg = nums[0] || nums[2] || maxDim; // leg length = first or last dimension
              const base = nums[1] || maxDim / 2; // base = middle dimension
              const lx = cx - (base * scale) / 2;
              const rx = cx + (base * scale) / 2;
              const top = cy - (leg * scale) / 2;
              const bot = cy + (leg * scale) / 2;
              return (
                <g>
                  {/* Path: start at top-left → down → right → up to top-right */}
                  <path d={`M ${lx} ${top} L ${lx} ${bot} L ${rx} ${bot} L ${rx} ${top}`}
                    fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Start marker */}
                  <circle cx={lx} cy={top} r="4" fill={accentColor} />
                  {/* Leg labels */}
                  <text x={lx - 15} y={cy} textAnchor="end" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[0] || `${leg}cm leg`}
                  </text>
                  <text x={rx + 15} y={cy} textAnchor="start" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[2] || `${leg}cm leg`}
                  </text>
                  {/* Base label */}
                  <text x={cx} y={bot + 20} textAnchor="middle" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[1] || `${base}cm base`}
                  </text>
                  {/* Angle markers */}
                  <text x={lx - 10} y={bot - 6} fontSize="9" fill="#dc2626" fontFamily="monospace">90°</text>
                  <text x={rx + 4} y={bot - 6} fontSize="9" fill="#dc2626" fontFamily="monospace">90°</text>
                </g>
              );
            })()}
          </>
        )}

        {isLShape && !isUShape && (
          <>
            {/* L-shape: vertical arm → horizontal arm */}
            {(() => {
              const vert = nums[0] || maxDim;
              const horiz = nums[1] || maxDim * 0.7;
              const sx = cx - (horiz * scale) / 2;
              const top = cy - (vert * scale) / 2;
              const corner = cy + (vert * scale) / 2;
              const ex = sx + horiz * scale;
              return (
                <g>
                  <path d={`M ${sx} ${top} L ${sx} ${corner} L ${ex} ${corner}`}
                    fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={sx} cy={top} r="4" fill={accentColor} />
                  <text x={sx - 15} y={cy} textAnchor="end" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[0] || `${vert}cm`}
                  </text>
                  <text x={sx + (ex - sx) / 2} y={corner + 20} textAnchor="middle" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[1] || `${horiz}cm`}
                  </text>
                  <text x={sx + 8} y={corner - 6} fontSize="9" fill="#dc2626" fontFamily="monospace">90°</text>
                </g>
              );
            })()}
          </>
        )}

        {isFrame && (
          <>
            {/* Rectangle frame */}
            {(() => {
              const fw = (nums[0] || maxDim) * scale;
              const fh = (nums[1] || nums[0] || maxDim * 0.6) * scale;
              const fx = cx - fw / 2;
              const fy = cy - fh / 2;
              return (
                <g>
                  <rect x={fx} y={fy} width={fw} height={fh} fill="none" stroke={strokeColor} strokeWidth="3" rx="2" />
                  <circle cx={fx} cy={fy} r="4" fill={accentColor} />
                  {dimensions.slice(0, 4).map((d, i) => {
                    const positions: { x: number; y: number; ta: "start" | "middle" | "end" }[] = [
                      { x: cx, y: fy - 8, ta: "middle" },
                      { x: fx + fw + 15, y: cy, ta: "start" },
                      { x: cx, y: fy + fh + 18, ta: "middle" },
                      { x: fx - 15, y: cy, ta: "end" },
                    ];
                    const pos = positions[i] || positions[0];
                    return (
                      <text key={i} x={pos.x} y={pos.y} textAnchor={pos.ta} fontSize="10" fill={dimColor} fontFamily="monospace" fontWeight="bold">{d}</text>
                    );
                  })}
                </g>
              );
            })()}
          </>
        )}

        {isCoil && (
          <>
            {/* Spiral/coil approximation */}
            {(() => {
              const r = (maxDim * scale) / 3;
              return (
                <g>
                  <path
                    d={`M ${cx} ${cy}
                        C ${cx + r} ${cy - r} ${cx + r * 2} ${cy - r} ${cx + r * 2} ${cy}
                        C ${cx + r * 2} ${cy + r} ${cx + r} ${cy + r} ${cx} ${cy + r}
                        C ${cx - r} ${cy + r} ${cx - r} ${cy} ${cx} ${cy}`}
                    fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round"
                  />
                  <circle cx={cx} cy={cy} r="3" fill={accentColor} />
                  <text x={cx + r * 2 + 12} y={cy} textAnchor="start" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
                    {dimensions[0] || `${maxDim}cm dia`}
                  </text>
                </g>
              );
            })()}
          </>
        )}

        {isStraight && !isUShape && !isLShape && !isFrame && !isCoil && (
          <>
            {/* Straight cut piece */}
            <line x1="40" y1={cy} x2={w - 40} y2={cy} stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
            <circle cx="40" cy={cy} r="4" fill={accentColor} />
            <circle cx={w - 40} cy={cy} r="4" fill={accentColor} />
            {/* Cut lines */}
            <line x1="40" y1={cy - 12} x2="40" y2={cy + 12} stroke={strokeColor} strokeWidth="1" />
            <line x1={w - 40} y1={cy - 12} x2={w - 40} y2={cy + 12} stroke={strokeColor} strokeWidth="1" />
            <text x={cx} y={cy + 22} textAnchor="middle" fontSize="11" fill={dimColor} fontFamily="monospace" fontWeight="bold">
              {dimensions[0] || `${maxDim}cm total`}
            </text>
            {dimensions.slice(1).map((d, i) => (
              <text key={i} x={cx} y={cy + 22 + (i + 1) * 16} textAnchor="middle" fontSize="10" fill="#78716c" fontFamily="monospace">{d}</text>
            ))}
          </>
        )}

        {/* Fallback: no shape detected */}
        {!isUShape && !isLShape && !isFrame && !isCoil && !isStraight && (
          <>
            <line x1="30" y1={cy} x2={w - 30} y2={cy} stroke={strokeColor} strokeWidth="2" />
            {dimensions.map((dim, i) => {
              const x = 30 + ((i + 0.5) / dimensions.length) * (w - 60);
              return (
                <g key={i}>
                  <line x1={x} y1={cy - 12} x2={x} y2={cy + 12} stroke={accentColor} strokeWidth="1" />
                  <text x={x} y={cy + 26} textAnchor="middle" fontSize="10" fill={dimColor} fontFamily="monospace" fontWeight="bold">{dim}</text>
                </g>
              );
            })}
            {angles.map((angle, i) => {
              const x = 50 + i * 80;
              return (
                <g key={`a-${i}`}>
                  <text x={x} y={cy - 18} textAnchor="middle" fontSize="10" fill="#dc2626" fontFamily="monospace" fontWeight="bold">{angle}</text>
                  <path d={`M ${x} ${cy} L ${x + 12} ${cy - 12} L ${x} ${cy - 20}`} fill="none" stroke="#dc2626" strokeWidth="1.5" />
                </g>
              );
            })}
            <text x={22} y={cy + 4} textAnchor="end" fontSize="8" fill="#78716c" fontFamily="monospace">start</text>
            <text x={w - 22} y={cy + 4} textAnchor="start" fontSize="8" fill="#78716c" fontFamily="monospace">end</text>
          </>
        )}

        {/* Material indicator */}
        <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="8" fill="#a8a29e" fontFamily="monospace">
          {text.includes("wire") ? "wire" : text.includes("tube") ? "tube" : text.includes("wood") || text.includes("bamboo") ? "material" : ""}
        </text>
      </svg>
    </div>
  );
}

// Kroki Graphviz renderer
export function GraphvizDiagram({ dot }: { dot: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!dot) return;
    let cancelled = false;
    setFailed(false); setSvg(null);
    (async () => {
      try {
        const res = await fetch("https://kroki.io/graphviz/svg", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: dot,
        });
        if (!cancelled && res.ok) setSvg(await res.text());
        else if (!cancelled) setFailed(true);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [dot]);

  if (!dot) return null;
  if (svg) return <div className="p-3 bg-[#fafaf9] overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
  if (failed) return <div className="p-4 text-center"><p className="text-xs text-text-muted">Layout diagram unavailable</p></div>;
  return <div className="p-4 text-center"><div className="w-5 h-5 mx-auto border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
}

// Kroki Mermaid renderer (existing, kept for wiring)
export function WiringDiagram({ connections }: { connections: { from: string; to: string; wireColor?: string }[] }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!connections?.length) return;
    let cancelled = false;
    setFailed(false); setSvg(null);
    (async () => {
      try {
        const lines = ["flowchart LR"];
        const seen = new Set<string>();
        connections.forEach((c) => {
          const fromId = (c.from || "").replace(/[^a-zA-Z0-9]/g, "_");
          const toId = (c.to || "").replace(/[^a-zA-Z0-9]/g, "_");
          const key = `${fromId}_${toId}`;
          if (!seen.has(key)) { seen.add(key); lines.push(`  ${fromId}["${c.from}"] --> ${toId}["${c.to}"]`); }
        });
        const res = await fetch("https://kroki.io/mermaid/svg", { method: "POST", headers: { "Content-Type": "text/plain" }, body: lines.join("\n") });
        if (!cancelled && res.ok) setSvg(await res.text()); else if (!cancelled) setFailed(true);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [connections]);

  if (!connections?.length) return <div className="p-4 text-center"><p className="text-xs text-text-muted">No wiring connections</p></div>;
  if (svg) return <div className="p-3 bg-[#fafaf9] overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
  if (failed) return <div className="p-4 text-center"><p className="text-xs text-text-muted">Wiring diagram unavailable</p></div>;
  return <div className="p-4 text-center"><div className="w-5 h-5 mx-auto border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
}
