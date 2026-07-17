"use client";

/**
 * ShoppingList — the parts section of prep (B5: shopping surface rebuild).
 *
 * A top summary row (part count, midpoint cart estimate headline, Buy-all
 * trigger) over the list of PartCards. This is a lift-and-shift of prep-
 * screen's old separate "Parts cart estimate" card + bare parts map into one
 * component — same card chrome, same tokens, now feeding PartCard instead of
 * PartRow and formatUsdMidpoint instead of a bare formatUsdRange.
 *
 * Cart-strategy switching (Smart/Amazon/LCSC) stays a prep-screen concern —
 * this component takes the resolved strategy, it doesn't offer to change it.
 */

import type { Part } from "@/lib/types";
import { formatUsdMidpoint, type CartStrategy } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { PartCard } from "./part-card";

export interface ShoppingListEstimate {
  totalMin: number;
  totalMax: number;
  pricedCount: number;
  unpricedCount: number;
}

export interface ShoppingListProps {
  parts: Part[];
  strategy: CartStrategy;
  estimate: ShoppingListEstimate;
  onTooltip?: (t: string | null) => void;
  onBuyAll: (parts: Part[]) => void;
}

export function ShoppingList({ parts, strategy, estimate, onTooltip, onBuyAll }: ShoppingListProps) {
  return (
    <div>
      <div className="mb-5 p-5 rounded-xl bg-surface border border-border-subtle shadow-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              Parts ({parts.length})
            </p>
            {estimate.pricedCount > 0 ? (
              <>
                <p className="text-2xl font-bold text-text font-serif tabular-nums">
                  {formatUsdMidpoint(estimate.totalMin, estimate.totalMax)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {estimate.pricedCount}/{parts.length} parts priced · catalog estimates
                </p>
              </>
            ) : (
              <p className="text-sm text-text-secondary mt-1">Prices not available yet</p>
            )}
          </div>
          {estimate.pricedCount > 0 && (
            <Button variant="primary" onClick={() => onBuyAll(parts)}>
              Buy all parts →
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {parts.map((p) => (
          <PartCard key={p.id} part={p} showImage onTooltip={onTooltip} strategy={strategy} />
        ))}
      </div>
    </div>
  );
}
