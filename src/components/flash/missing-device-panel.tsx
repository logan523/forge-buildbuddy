"use client";

/**
 * Inline debug panel for a missing I2C device on the Wiring check card
 * (flash-console.tsx) — the topology-aware, visual version of the reasoning
 * that used to only happen in chat: which of this device's wires are
 * already proven good by a sibling that DID answer, shown as a focused
 * picture, plus the relevant physical checklist. Mounts inline (no drawer
 * swap), so the live serial connection and the scan's re-check loop keep
 * running underneath it — reflow a joint and watch the row above flip to
 * found without losing this panel.
 */

import { useEffect, useMemo, useRef } from "react";
import type { BuildPlan } from "@/lib/types";
import type { DeviceVerdict } from "@/lib/serial/verify";
import {
  busProofForMissingDevice,
  describeBusProof,
  filterDiagnosesByProof,
  friendlyNetName,
} from "@/lib/serial/bus-proof";
import { diagnose } from "@/lib/unstick";
import { svgCircuitDiagram } from "@/lib/step-media/circuit-diagram";
import { netColorFor } from "@/lib/wire-colors";
import { DiagnosisCard } from "./diagnosis-card";

export function MissingDeviceDebugPanel({
  plan,
  verdict,
  verdicts,
  onOpenFullUnstick,
}: {
  plan: BuildPlan;
  verdict: DeviceVerdict;
  verdicts: DeviceVerdict[];
  onOpenFullUnstick?: () => void;
}) {
  const device = verdict.device;

  // FlashConsole recomputes `verdicts` fresh every render (its 1s scan tick
  // isn't memoized) — key on a cheap signature of catalogId+status pairs,
  // not the array/object references, so the work below only reruns when a
  // device's actual state changes.
  const signature = verdicts.map((v) => `${v.device.catalogId}:${v.status}`).join("|");

  const proof = useMemo(
    () => busProofForMissingDevice(plan, device, verdicts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, device.catalogId, signature]
  );

  const diagram = useMemo(() => {
    if (!proof) return null;
    // Cropped sheet: only this device + the wires that connect it, drawn
    // large at native pixel size — the focused picture the panel is about.
    return svgCircuitDiagram(plan, {
      crop: true,
      focusPartIds: proof.focusPartIds,
      highlightWireIds: proof.highlightWireIds,
      doneWireIds: proof.doneWireIds,
      title: `${device.label} — what's proven so far`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, proof, device.label]);

  const summary = proof ? describeBusProof(device.label, proof) : null;

  // The sheet is native-pixel and crops to the failed device's neighborhood,
  // but if it still overflows the drawer, start scrolled to the right edge —
  // I2C devices sit in the diagram's rightmost column (columnFor), so the
  // failed device stays in view, not the power chain at the far left.
  const diagramRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = diagramRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [diagram]);

  const diagnoses = useMemo(() => {
    const base = diagnose(plan, device.symptomHint);
    return proof ? filterDiagnosesByProof(base, proof) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, device.symptomHint, proof]);

  return (
    <div className="mt-2 p-3 rounded-lg border border-border-subtle bg-surface-raised space-y-3">
      {summary && (
        <div className="p-3 rounded-lg bg-info-soft border border-info/20">
          <p className="text-sm font-semibold text-text">{summary.headline}</p>
          <p className="text-xs text-text-secondary mt-1">{summary.detail}</p>
        </div>
      )}

      {proof && proof.nets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {proof.nets.map((n) => (
            <span
              key={n.net.name}
              className={`inline-flex items-center gap-1.5 text-2xs font-medium px-2 py-1 rounded-full border ${
                n.proven
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-border-subtle bg-surface text-text-muted"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: n.net.displayColorHex ?? netColorFor(n.net.netClass, undefined, n.net.name) }}
                aria-hidden="true"
              />
              {friendlyNetName(n.net)} {n.proven ? "proven" : "unproven"}
            </span>
          ))}
        </div>
      )}

      {diagram && (
        // Native-pixel sheet: labels keep their authored size, and a drawer
        // narrower than the sheet scrolls it instead of squishing the text.
        <div
          ref={diagramRef}
          className="rounded-lg border border-border-subtle overflow-x-auto bg-surface [&_svg]:block [&_svg]:mx-auto"
          dangerouslySetInnerHTML={{ __html: diagram }}
        />
      )}

      <div className="space-y-2">
        {diagnoses.map((diag, idx) => (
          <DiagnosisCard key={diag.id} diag={diag} index={idx} defaultOpen={idx === 0} />
        ))}
      </div>

      {onOpenFullUnstick && (
        <button
          type="button"
          onClick={onOpenFullUnstick}
          className="text-xs text-text-muted hover:text-text cursor-pointer underline"
        >
          Open full troubleshooting →
        </button>
      )}
    </div>
  );
}
