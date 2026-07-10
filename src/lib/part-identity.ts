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

/** CSS reference px per mm (96dpi / 25.4). Life-size on a standard display. */
export const CSS_PX_PER_MM = 96 / 25.4;

const SIZE_REFS = [
  { name: "a grain of rice", mm: 6 },
  { name: "a fingernail", mm: 14 },
  { name: "a quarter", mm: 24 },
  { name: "a AA battery", mm: 50 },
  { name: "a credit card", mm: 86 },
];

/**
 * A relatable size comparison — device-independent and honest (real 1:1 depends
 * on the screen, so we anchor to a physical object everyone owns). "Smaller than
 * a quarter" tells a beginner what to expect in their palm before it arrives.
 */
export function sizeComparison(bbox: { l: number; w: number; h: number }): {
  longestMm: number;
  phrase: string;
} {
  const longest = Math.max(bbox.l, bbox.w);
  let ref = SIZE_REFS[0]!;
  for (const r of SIZE_REFS) {
    if (Math.abs(r.mm - longest) < Math.abs(ref.mm - longest)) ref = r;
  }
  const ratio = longest / ref.mm;
  const rel = ratio < 0.8 ? "smaller than" : ratio > 1.3 ? "bigger than" : "about the size of";
  return { longestMm: Math.round(longest), phrase: `${rel} ${ref.name}` };
}
