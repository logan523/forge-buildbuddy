"use client";

import type { BuildPlan, BuildStep } from "@/lib/types";
import type { PcbPackage } from "@/lib/pcb";
import type { EnclosurePackage } from "@/lib/enclosure";
import type { FirmwarePackage } from "@/lib/firmware";
import type { CartStrategy } from "@/lib/cart";
import type { SymptomId } from "@/lib/unstick";
import { presentErc } from "@/lib/electrical/present";
import { publishKit } from "@/lib/kits/store";
import { PartRow, FirmwareDrawer, UnstickDrawer } from "@/components/build-ui";
import type { DrawerId } from "./use-build-state";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface BuildDrawersProps {
  drawer: DrawerId | null;
  plan: BuildPlan;
  step: BuildStep | undefined;
  stepIndex: number;
  onBuyAll: (parts: BuildPlan["parts"]) => void;
  firmware: FirmwarePackage | null;
  pcb: PcbPackage | null;
  enclosure: EnclosurePackage;
  cartStrategy: CartStrategy;
  fwSketchId: string | null;
  unstickSymptom: SymptomId | null;
  authorName: string;
  publishMsg: string;
  onClose: () => void;
  onSetFwSketch: (id: string | null) => void;
  onSetUnstickSymptom: (s: SymptomId | null) => void;
  onSetAuthorName: (name: string) => void;
  onSetPublishMsg: (msg: string) => void;
  onOpenPrep: () => void;
}

/** All right-side sheets for the build view. Exactly one is open at a time. */
export function BuildDrawers({
  drawer,
  plan,
  step,
  stepIndex,
  onBuyAll,
  firmware,
  pcb,
  enclosure,
  cartStrategy,
  fwSketchId,
  unstickSymptom,
  authorName,
  publishMsg,
  onClose,
  onSetFwSketch,
  onSetUnstickSymptom,
  onSetAuthorName,
  onSetPublishMsg,
  onOpenPrep,
}: BuildDrawersProps) {
  if (!drawer) return null;

  return (
    <>
      {drawer === "firmware" && firmware && (
        <FirmwareDrawer fw={firmware} activeId={fwSketchId} onSelect={onSetFwSketch} onClose={onClose} />
      )}
      {drawer === "pcb" && pcb && <PcbDrawer pcb={pcb} onClose={onClose} />}
      {drawer === "pcbBlocked" && plan.electrical && (
        <PcbBlockedDrawer electrical={plan.electrical} onClose={onClose} onOpenPrep={onOpenPrep} />
      )}
      {drawer === "case" && <CaseDrawer enc={enclosure} onClose={onClose} />}
      {drawer === "publish" && (
        <PublishDrawer
          authorName={authorName}
          setAuthorName={onSetAuthorName}
          message={publishMsg}
          onClose={onClose}
          onPublish={() => {
            if (plan.electrical && !plan.electrical.erc.canPublishKit) {
              onSetPublishMsg("Blocked: ERC has errors — fix electrical issues first.");
              return;
            }
            const kit = publishKit({ plan, authorName, tags: [plan.difficulty, "community"] });
            onSetPublishMsg(`Published /kits/${kit.slug}`);
          }}
          ercBlocked={!!(plan.electrical && !plan.electrical.erc.canPublishKit)}
        />
      )}
      {drawer === "unstick" && (
        <UnstickDrawer
          plan={plan}
          step={step}
          stepIndex={stepIndex}
          symptom={unstickSymptom}
          onSelectSymptom={onSetUnstickSymptom}
          onClose={onClose}
        />
      )}
      {drawer === "parts" && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-surface border-l border-border shadow-raised z-50 overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border-subtle px-5 py-4 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-text">Parts ({plan.parts.length})</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onBuyAll(plan.parts)}
                  className="text-xs px-3 py-1.5 min-h-9 rounded-lg bg-accent text-white font-medium hover:bg-accent-soft cursor-pointer"
                >
                  Buy all →
                </button>
                <button onClick={onClose} className="text-text-muted text-lg cursor-pointer min-w-9 min-h-9" aria-label="Close parts">×</button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {plan.parts.map((p) => (
                <PartRow key={p.id} part={p} compact strategy={cartStrategy} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
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
