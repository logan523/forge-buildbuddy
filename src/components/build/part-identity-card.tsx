"use client";

/**
 * "Is this the part I'm holding?" — identity cards for the guided wire card.
 * A wire strip (color + net) plus the two parts it connects (size, sku, the one
 * footgun, a buy link to see a photo). Everything derives from the plan Part +
 * real-parts, so it can't drift from the BOM. Degrades: no match → name + spec only.
 */

import type { BuildPlan, MicroStep, Part } from "@/lib/types";
import { realPartForPart, partCatalogId, sizeLabel, bestBuyLink, keyFootgun } from "@/lib/part-identity";
import { useProbedImage } from "./use-probed-image";

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
        <p className="text-xs text-text-secondary">
          About {sizeLabel(real)} · {real.mpnOrSku}
        </p>
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
