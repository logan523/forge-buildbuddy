"use client";

import { likelihoodLabel, type Diagnosis } from "@/lib/unstick";

/**
 * One diagnosis rendered as a collapsible card — title, likelihood/source,
 * cause, and the ordered action checklist. Shared by UnstickDrawer (the
 * generic "I'm stuck" flow, build-ui.tsx) and MissingDeviceDebugPanel (the
 * topology-aware inline panel on a failed I2C scan,
 * components/flash/missing-device-panel.tsx), so both stay visually
 * identical without copy-pasting the markup.
 */
export function DiagnosisCard({
  diag,
  index,
  defaultOpen = false,
}: {
  diag: Diagnosis;
  index: number;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 hover:bg-surface-overlay/50">
        <span className="shrink-0 mt-0.5 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
          #{index + 1}
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
              {a.ifFail && <p className="text-text-muted mt-0.5">If not: {a.ifFail}</p>}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
