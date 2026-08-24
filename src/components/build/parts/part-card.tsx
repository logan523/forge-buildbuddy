"use client";

/**
 * PartCard — the per-part shopping row (B5: shopping surface rebuild).
 *
 * Everything a beginner needs to tell they're buying the RIGHT thing lives
 * here, visible by default (no "Know it when you see it" <details> to miss):
 * icon, name, honest confidence badge, price, an honestly-labeled buy link
 * (search vs. real product page), buyGuidance's "Look for" / "Avoid" lines,
 * the catalog's mpnNote trust line, and — new — substituteIds finally
 * rendered as an "Also works" line.
 *
 * PartRow (build-ui.tsx) is now a thin wrapper over this component; the two
 * files import each other (PartRow → PartCard for rendering, PartCard →
 * build-ui's partIcon/confidenceBadge for the icon + badge). Both sides only
 * touch the cross-import inside function bodies (never at module-eval time),
 * which is the standard safe shape for a two-file cycle in ESM.
 */

import type { Part, ShoppingLink } from "@/lib/types";
import { Fact, OptionalFact } from "@/components/claim/fact";
import {
  bestLink,
  formatUsdRange,
  offersFromModule,
  resolveOffers,
  VENDOR_LABEL,
  type CartStrategy,
} from "@/lib/cart";
import { getModuleById, resolveSubstitutes } from "@/lib/catalog";
import { glossaryTip } from "@/lib/glossary";
import { buyGuidance } from "@/lib/part-identity";
import { confidenceBadge, partIcon } from "@/components/build-ui";

export interface PartCardProps {
  part: Part;
  /** Render the category icon (prep-screen's full list; omitted in compact rows). */
  showImage?: boolean;
  /**
   * Condensed row: no badge, no always-visible guidance/note/substitutes, no
   * alt-vendor chips — just icon-less name + price + one honest buy link.
   * Matches the space-constrained "Parts" quick-reference drawer during a
   * build (build-drawers.tsx), which this file does not otherwise touch.
   */
  compact?: boolean;
  onTooltip?: (t: string | null) => void;
  strategy?: CartStrategy;
}

/** "Search Amazon →" for search-result pages (true on every non-Nexar path);
 *  "Buy at Amazon →" only for a real kind==="product" deep link. Never claim
 *  a search page is a product page. */
function offerLabel(kind: ShoppingLink["kind"], vendorLabel: string): string {
  return kind === "product" ? `Buy at ${vendorLabel}` : `Search ${vendorLabel}`;
}

export function PartCard({ part, showImage, compact, onTooltip, strategy = "split" }: PartCardProps) {
  const link = bestLink(part, strategy);
  const alts = resolveOffers(part).filter((o) => o.vendor !== link.vendor).slice(0, 3);
  const tip = glossaryTip(`${part.name} ${part.specification}`);
  const badge = !compact ? confidenceBadge(part) : null;
  const guidance = !compact ? buyGuidance(part) : null;
  // "Look for" always renders when guidance exists -- if we do not know what
  // to look for, saying so is the point. Silently omitting the line is how a
  // beginner buys the wrong thing without ever learning we were unsure.
  const hasGuidance = !!guidance;
  const mod = part.catalogId ? getModuleById(part.catalogId) : undefined;
  const substitutes = !compact && mod ? resolveSubstitutes(mod) : [];
  const vendorLabel = VENDOR_LABEL[link.vendor] || link.label || "Buy";

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
    <div className="p-3 rounded-lg bg-surface border border-border-subtle">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTooltip(tip);
                }}
                className="shrink-0 w-4 h-4 rounded-full bg-accent/10 text-accent text-2xs font-bold flex items-center justify-center cursor-help hover:bg-accent/20 transition-colors"
                title="What's this?"
              >
                ?
              </button>
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
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-soft transition-all no-underline"
        >
          {offerLabel(link.kind, vendorLabel)} →
        </a>
      </div>

      {!compact && alts.length > 0 && (
        <div className="mt-2 ml-9 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-text-muted">Also:</span>
          {alts.map((o) => {
            const vLabel = VENDOR_LABEL[o.vendor] || o.label;
            return (
              <a
                key={`${o.vendor}-${o.url}`}
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xs px-2 py-0.5 rounded-md border border-border-subtle text-text-secondary hover:border-accent/40 hover:text-accent no-underline transition-colors"
              >
                {offerLabel(o.kind, vLabel)}
              </a>
            );
          })}
        </div>
      )}

      {!compact && hasGuidance && (
        <div className="mt-2 ml-9 space-y-1 text-[11px] text-text-secondary">
          <p>
            <span className="text-text-muted">Look for:</span>{" "}
            <Fact
              claim={guidance!.lookFor}
              render={(v) => <span className="text-text font-medium">{v}</span>}
            />
          </p>
          <OptionalFact label="Avoid:" claim={guidance!.avoid} />
        </div>
      )}

      {!compact && part.mpnNote && (
        <p className="mt-1.5 ml-9 text-[11px] text-text-muted">
          <span className="font-medium text-text-secondary">Note:</span> {part.mpnNote}
          {part.mpnVerifiedAt ? ` · checked ${part.mpnVerifiedAt}` : ""}
        </p>
      )}

      {!compact && substitutes.length > 0 && (
        <p className="mt-1.5 ml-9 text-[11px] text-text-secondary">
          <span className="text-text-muted">Also works:</span>{" "}
          {substitutes.map((s, i) => {
            // Every catalog module carries its own searchQuery — resolve a
            // tappable link scoped to THIS substitute (never the primary
            // part's query, which could point at the wrong thing).
            const href = s.searchQuery ? offersFromModule(s)[0]?.url : null;
            return (
              <span key={s.id}>
                {i > 0 && ", "}
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-accent underline decoration-dotted underline-offset-2"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="text-text">{s.name}</span>
                )}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
