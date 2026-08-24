"use client";

/**
 * What to buy, and how sure we are.
 *
 * This is where the Phase-1b fix becomes visible. Three parts on this exact
 * screen used to name a different product entirely — a 1S battery level
 * indicator listed as `0.96" SSD1306 OLED module` — because a regex matched
 * the word "display" in its name. Now every line is a Claim, so a part we
 * have not matched says so instead of borrowing a neighbour's part number.
 *
 * A sheet, not a gate. The old prep screen made eleven parts' worth of
 * shopping the price of admission to seeing a single instruction. You reach
 * this when you want it.
 */

import type { BuildPlan, Part } from "@/lib/types";
import { buyGuidance, confidenceLabel, bestBuyLink } from "@/lib/part-identity";
import { planCostClaim } from "@/lib/cost";
import { Fact, OptionalFact } from "@/components/claim/fact";

function PartRow({ part }: { part: Part }) {
  const g = buyGuidance(part);
  const conf = confidenceLabel(part);
  const link = bestBuyLink(part);

  return (
    <li className="rounded-lg border border-border-subtle p-4 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-text">{part.name}</p>
        <span className="text-xs text-text-muted shrink-0">×{part.quantity}</span>
      </div>

      {/* Honest confidence: "exact match" means pinned to a known catalog part,
          never that anyone tested it works. */}
      <p className={`text-[11px] ${conf.known ? "text-success" : "text-text-muted"}`}>{conf.label}</p>

      <p className="text-xs">
        <span className="text-text-muted">Look for:</span>{" "}
        <Fact claim={g.lookFor} render={(v) => <span className="text-text font-medium">{v}</span>} />
      </p>
      <p className="text-xs text-warning">
        <OptionalFact label="Avoid:" claim={g.avoid} />
      </p>
      <p className="text-xs">
        <OptionalFact label="Price:" claim={g.priceBand} />
      </p>

      {link && (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent font-medium mt-1"
        >
          {link.label} →
        </a>
      )}
    </li>
  );
}

export function PartsSheet({ plan, onClose }: { plan: BuildPlan; onClose: () => void }) {
  const parts = plan.parts ?? [];
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Parts">
      <button className="absolute inset-0 bg-black/30 cursor-pointer" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-md bg-surface-raised border-l border-border-subtle overflow-y-auto">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Parts</h2>
            <Fact claim={planCostClaim(plan)} className="text-xs text-text-muted" />
          </div>
          <button onClick={onClose} className="text-sm text-text-muted cursor-pointer min-h-[44px] px-2">
            Close
          </button>
        </div>
        <ul className="p-3 space-y-2">
          {parts.map((p) => (
            <PartRow key={p.id} part={p} />
          ))}
        </ul>
        {parts.length === 0 && (
          <p className="px-5 py-8 text-sm text-text-muted italic">No parts listed for this build.</p>
        )}
      </aside>
    </div>
  );
}
