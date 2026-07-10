"use client";

/**
 * "Is this the part I'm holding?" — identity cards for the guided wire card.
 * A wire strip (color + net) plus the two parts it connects (size, sku, the one
 * footgun, a buy link to see a photo). Everything derives from the plan Part +
 * real-parts, so it can't drift from the BOM. Degrades: no match → name + spec only.
 */

import type { BuildPlan, MicroStep, Part } from "@/lib/types";
import type { RealPartSpec } from "@/lib/product-3d/real-parts";
import {
  realPartForPart,
  partCatalogId,
  sizeLabel,
  bestBuyLink,
  keyFootgun,
  sizeComparison,
  CSS_PX_PER_MM,
} from "@/lib/part-identity";
import { useProbedImage } from "./use-probed-image";

/**
 * Hold It Up To Check — the part drawn at true screen scale next to a quarter,
 * so a beginner literally holds the real thing to the glass and confirms. Draws
 * both at the same CSS mm scale (honest relative size on any screen; ≈ life-size
 * on a standard display); the strip scrolls for big parts rather than lying.
 */
function HoldItUp({ spec }: { spec: RealPartSpec }) {
  const { l, w } = spec.bboxMm;
  const longest = Math.max(l, w);
  const shortest = Math.min(l, w);
  const px = (mm: number) => Math.round(mm * CSS_PX_PER_MM);
  const coinMm = 24; // a US quarter
  const { phrase } = sizeComparison(spec.bboxMm);
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-text-secondary">
        📏 {phrase} — hold yours up to the screen.
      </p>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 py-1" style={{ minWidth: px(longest) + px(coinMm) + 24 }}>
          <div
            className="rounded-[3px] border-2 border-accent/70 bg-accent/10 shrink-0"
            style={{ width: px(longest), height: px(shortest) }}
            title={`${Math.round(l)} × ${Math.round(w)} mm`}
          />
          <div className="flex flex-col items-center shrink-0">
            <div
              className="rounded-full border border-text-muted/50 bg-surface-overlay"
              style={{ width: px(coinMm), height: px(coinMm) }}
            />
            <span className="text-[8px] text-text-muted mt-0.5">quarter</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Real bench photo of the part, if the founder has shot one:
 * public/build-photos/<planId>/part-<catalogId>.jpg. Renders nothing until it
 * decodes (no ghost card), so the 3D model stays the answer until a photo exists.
 */
function PartPhoto({ planId, part }: { planId: string; part: Part }) {
  const catalogId = partCatalogId(part);
  const src = catalogId ? `/build-photos/${planId}/part-${catalogId}.jpg` : "";
  const loaded = useProbedImage(src);
  if (!catalogId || !loaded) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Photo of ${part.name}`}
      className="w-full h-20 object-cover rounded-lg border border-border-subtle"
    />
  );
}

function PartIdentityCard({
  part,
  role,
  planId,
}: {
  part: Part;
  role: "from" | "to";
  planId: string;
}) {
  const real = realPartForPart(part);
  const buy = bestBuyLink(part);
  const footgun = keyFootgun(part);
  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5">
      <PartPhoto planId={planId} part={part} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-text leading-tight">{part.name}</p>
        <span className="text-[9px] uppercase tracking-wide text-text-muted shrink-0 mt-0.5">
          {role === "from" ? "one end" : "other end"}
        </span>
      </div>
      {real ? (
        <>
          <p className="text-xs text-text-secondary">
            About {sizeLabel(real)} · {real.mpnOrSku}
          </p>
          <HoldItUp spec={real} />
        </>
      ) : (
        part.specification && (
          <p className="text-xs text-text-secondary line-clamp-2">{part.specification}</p>
        )
      )}
      {footgun && (
        <p className="text-xs text-warning flex gap-1">
          <span aria-hidden>⚠</span>
          <span>{footgun}</span>
        </p>
      )}
      {buy && (
        <a
          href={buy.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent underline min-h-[24px]"
        >
          See what it looks like ({buy.vendor}) →
        </a>
      )}
    </div>
  );
}

export function WireAndPartsIdentity({ micro, plan }: { micro: MicroStep; plan: BuildPlan }) {
  const from = plan.parts.find((p) => p.id === micro.fromPartId);
  const to = plan.parts.find((p) => p.id === micro.toPartId);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-overlay p-2.5">
        <span
          className="w-4 h-4 rounded-full border border-black/10 shrink-0"
          style={{ background: micro.colorHex }}
          aria-hidden
        />
        <p className="text-xs text-text-secondary">
          This is the{" "}
          <span className="font-semibold text-text">
            {micro.colorName} {micro.netName}
          </span>{" "}
          wire.
        </p>
      </div>
      {from && <PartIdentityCard part={from} role="from" planId={plan.id} />}
      {to && <PartIdentityCard part={to} role="to" planId={plan.id} />}
    </div>
  );
}
