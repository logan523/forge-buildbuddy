"use client";

/**
 * Principles checkpoint (B2 #5) — rendered by generation-progress.tsx the
 * moment layer 2's "done" progress event carries pipelineMeta.principles.
 * Non-blocking: layers 3-6 keep running underneath it no matter what the
 * user does here. Two ways out:
 *   - "Looks right"            -> dismiss only, generation continues.
 *   - "Not quite — let me rephrase" -> abort in-flight (same AbortController
 *     the Cancel button uses) and hand control back to the form.
 */

import { Card, Button } from "@/components/ui";
import type { PrinciplesResult } from "@/lib/pipeline/types";

export function PrinciplesCheck({
  principles,
  onLooksRight,
  onRephrase,
}: {
  principles: PrinciplesResult;
  onLooksRight: () => void;
  onRephrase: () => void;
}) {
  const risks = principles.risks.slice(0, 3);

  return (
    <Card elevated className="text-left">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        Quick check before we keep going
      </p>
      <p className="text-sm text-text leading-relaxed">
        Here&apos;s what we&apos;re building:{" "}
        <span className="font-medium">{principles.functionalGoal}</span>
      </p>

      {risks.length > 0 && (
        <ul className="mt-3 space-y-1">
          {risks.map((risk, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-text-secondary">
              <span className="text-warning shrink-0" aria-hidden="true">
                !
              </span>
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={onLooksRight}>
          Looks right
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onRephrase}>
          Not quite — let me rephrase
        </Button>
      </div>
    </Card>
  );
}
