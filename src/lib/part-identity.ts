/**
 * Part identity for the guided "is this the part I'm holding?" cards.
 * Bridges a plan Part to its physical spec (size, sku) and pulls the one buy
 * link + the one footgun that help a beginner recognize the thing in their hand.
 * Pure; degrades to null when a part can't be matched (card then shows name + spec only).
 */

import type { Part, ShoppingLink } from "@/lib/types";
import {
  REAL_PARTS,
  getRealPart,
  type CatalogPartId,
  type RealPartSpec,
} from "@/lib/product-3d/real-parts";

// Same signal as inferCatalogId (catalog.ts) but keyed off Part text, since the
// guided card has the Part, not a scene node. Order matters: specific before generic.
const TEXT_RULES: [RegExp, CatalogPartId][] = [
  [/esp|xiao|\bc3\b|\bmcu\b/, "esp32_c3"],
  [/oled|ssd1306|display/, "oled_096"],
  [/tp4056|charg/, "tp4056"],
  [/16340|li-?ion|lipo|\bcell\b|battery/, "cell_16340"],
  [/\bsht\b|sht3|bme|dht|temp|humid/, "sht30"],
  [/ttp|touch/, "ttp223"],
  [/solar|photovolta/, "solar_cell"],
];

export function partCatalogId(part: Part): CatalogPartId | null {
  if (part.catalogId && part.catalogId in REAL_PARTS) {
    return part.catalogId as CatalogPartId;
  }
  const t = `${part.name} ${part.specification}`.toLowerCase();
  for (const [re, id] of TEXT_RULES) if (re.test(t)) return id;
  return null;
}

export function realPartForPart(part: Part): RealPartSpec | null {
  const id = partCatalogId(part);
  return id ? getRealPart(id) : null;
}

/** Human size, e.g. "23 × 18 mm" (boards) or "34 mm × ⌀17 mm" (cells). */
export function sizeLabel(spec: RealPartSpec): string {
  const { l, w, h } = spec.bboxMm;
  // Cells encode diameter twice (w === h); show length × diameter.
  if (Math.abs(w - h) < 0.5 && w > 8) return `${Math.round(l)} mm long, ⌀${Math.round(w)} mm`;
  return `${Math.round(l)} × ${Math.round(w)} mm`;
}

/** Best buy link: a product deep-link if any, else the first search link. */
export function bestBuyLink(part: Part): ShoppingLink | null {
  const links = part.shoppingLinks || [];
  if (!links.length) return null;
  return links.find((l) => l.kind === "product") ?? links[0]!;
}

/** The one "how to tell it apart" note, if the part carries footguns. */
export function keyFootgun(part: Part): string | null {
  return part.footguns?.find((f) => f.trim().length > 0) ?? null;
}
