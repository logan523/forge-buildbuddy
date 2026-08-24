"use client";

/**
 * "I'm stuck."
 *
 * The old UnstickDrawer lived in a 546-line grab-bag module alongside part
 * rows, safety panels and two firmware drawers. The diagnosis content itself
 * was never the problem — `diagnose()` is a real decision tree and it stays
 * untouched in src/lib/unstick.ts. This is only its surface.
 *
 * Reality-aware: an action the builder's own instrument evidence has already
 * ruled out is dropped, so a checklist never asks someone to re-check a bus a
 * sibling device just answered on.
 */

import { useMemo } from "react";
import type { BuildPlan } from "@/lib/types";
import type { BuildReality } from "@/lib/build-reality";
import { diagnose, filterDiagnosesByReality, type Diagnosis, type SymptomId } from "@/lib/unstick";

export function StuckSheet({
  plan,
  reality,
  symptomId,
  onClose,
}: {
  plan: BuildPlan;
  reality?: BuildReality;
  symptomId?: SymptomId;
  onClose: () => void;
}) {
  const diagnoses = useMemo(() => {
    const all = diagnose(plan, symptomId ?? ("blank_display" as SymptomId));
    return reality ? filterDiagnosesByReality(all, reality) : all;
  }, [plan, reality, symptomId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Troubleshooting">
      <button className="absolute inset-0 bg-black/30 cursor-pointer" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-md bg-surface-raised border-l border-border-subtle overflow-y-auto">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Let&apos;s find it</h2>
          <button onClick={onClose} className="text-sm text-text-muted cursor-pointer min-h-[44px] px-2">
            Close
          </button>
        </div>
        <div className="p-4 space-y-4">
          {diagnoses.map((d: Diagnosis, i: number) => (
            <section key={d.id} className="rounded-lg border border-border-subtle p-4 space-y-2">
              <h3 className="text-sm font-semibold text-text">
                {i + 1}. {d.title}
              </h3>
              {/* `cause` is the plain-words reason, and it is what a beginner
                  needs before a checklist means anything. */}
              <p className="text-xs text-text-secondary">{d.cause}</p>
              <ol className="space-y-1.5">
                {d.actions.map((act, j: number) => (
                  <li key={j} className="text-sm text-text flex gap-2">
                    <span className="text-text-muted shrink-0">{j + 1}.</span>
                    <span>
                      {act.action}
                      {act.expect && (
                        <span className="block text-xs text-text-muted">
                          You should see: {act.expect}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {diagnoses.length === 0 && (
            <p className="text-sm text-text-muted italic">
              Nothing here matches what you&apos;re seeing. Describe it and we&apos;ll work it out.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
