/**
 * Part identity for the guided "is this the part I'm holding?" cards.
 * Bridges a plan Part to its physical spec (size, sku) and pulls the one buy
 * link + the one footgun that help a beginner recognize the thing in their hand.
 * Pure; degrades to null when a part can't be matched (card then shows name + spec only).
 */

import type { Part, ShoppingLink } from "@/lib/types";
import { derivedOr, type Claim } from "@/lib/claim";
import {
  REAL_PARTS,
  getRealPart,
  type CatalogPartId,
  type RealPartSpec,
} from "@/lib/product-3d/real-parts";

/**
 * Catalog id -> the physical spec we have actually measured for it.
 *
 * EXPLICIT, and short on purpose. This replaces a list of seven regexes run
 * against the part's NAME, which is how, on 2026-08-24, the live prep screen
 * told a builder that a "1S Battery Level Indicator (capacity display)" was a
 * `0.96" SSD1306 OLED module`: the word "display" matched /oled|ssd1306|
 * display/. Two more went the same way -- "Solar Charging Controller" hit
 * /tp4056|charg/ because that rule sat above /solar/, and a 602535 LiPo pouch
 * hit /lipo|battery/ and came back a cylindrical 16340 cell.
 *
 * That mattered more than a wrong SKU. This spec also drives the life-size
 * "hold it up to the screen" card, so the one feature built to help a beginner
 * identify a part was drawing a different part at actual size.
 *
 * The 22 catalog ids NOT listed here have no measured spec, and that is a fact
 * to render, not a hole to fill from a neighbour. They resolve to null, which
 * becomes an `unknown` claim.
 */
const SPEC_FOR_CATALOG_ID: Record<string, CatalogPartId> = {
  "esp32-c3": "esp32_c3",
  "ssd1306-i2c": "oled_096",
  "tp4056-protected": "tp4056",
  "battery-16340": "cell_16340",
  sht31d: "sht30",
  "touch-switch": "ttp223",
  "solar-panel-5v": "solar_cell",
};

/**
 * The measured-spec key for a part, or null when we have not measured one.
 *
 * Two id namespaces exist in this repo: the module catalog's (`esp32-c3`) and
 * real-parts' (`esp32_c3`). They are bridged here, by hand, and nowhere else.
 */
export function partCatalogId(part: Part): CatalogPartId | null {
  if (!part.catalogId) return null;
  const mapped = SPEC_FOR_CATALOG_ID[part.catalogId];
  if (mapped) return mapped;
  // Callers inside the 3D code already hold real-parts keys; accept those too.
  return part.catalogId in REAL_PARTS ? (part.catalogId as CatalogPartId) : null;
}

export function realPartForPart(part: Part): RealPartSpec | null {
  const id = partCatalogId(part);
  return (id ? getRealPart(id) : null) ?? null;
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

const money = (n: number) => (n % 1 === 0 ? `${n}` : n.toFixed(2).replace(/0$/, ""));

/**
 * "Know It When You See It" — what to match, what to pay, what to avoid, BEFORE
 * a beginner is dumped on a page of 40 look-alikes. So they buy the right thing
 * on the first click. Derived from real-parts + the BOM; degrades field by field.
 */
export function buyGuidance(part: Part): {
  lookFor: Claim<string>;
  priceBand: Claim<string>;
  avoid: Claim<string>;
} {
  // Only a measured part or the plan's own MPN may name what to buy. The old
  // chain ended in `specification.split(".")[0]`, which turned a description
  // into a shopping instruction -- and before that, in another part's SKU.
  const real = realPartForPart(part);
  const lookFor = derivedOr<string>(
    real?.mpnOrSku ?? part.mpn,
    "real-parts + BOM",
    "we haven't matched this to a part we've measured — compare the specs yourself before buying",
  );

  const link = bestBuyLink(part);
  const lo = part.unitPriceMin ?? link?.priceUsd ?? null;
  const hi = part.unitPriceMax ?? link?.priceMaxUsd ?? lo;
  const priceBand = derivedOr<string>(
    lo != null ? (hi != null && hi > lo ? `$${money(lo)}–${money(hi)}` : `$${money(lo)}`) : null,
    "BOM + vendor offers",
    "no price yet",
  );

  return {
    lookFor,
    priceBand,
    avoid: derivedOr<string>(keyFootgun(part), "BOM footguns", "nothing specific to avoid"),
  };
}

/**
 * Honest confidence — how sure we are which exact part this is. NOT "verified"
 * (we never tested it works); "exact match" means we pinned it to a known
 * catalog part, "best guess" means check the specs yourself.
 */
export function confidenceLabel(part: Part): { label: string; known: boolean } {
  const c = part.matchConfidence;
  if (c === "high") return { label: "Exact match", known: true };
  if (c === "medium") return { label: "Likely match", known: false };
  return { label: "Best guess — check specs", known: false };
}

/**
 * Up to two plain-English "how to spot it in the pile" tells for a part — its
 * size vs a familiar object, then the one gotcha (or a spec clause). Powers the
 * parts-identification walk.
 */
export function spotTells(part: Part): string[] {
  const tells: string[] = [];
  const real = realPartForPart(part);
  if (real) tells.push(sizeComparison(real.bboxMm).phrase);
  const gun = keyFootgun(part);
  if (gun) tells.push(gun);
  else if (part.specification) {
    const clause = part.specification.split(/[.;]/)[0]!.trim();
    if (clause) tells.push(clause);
  }
  return tells.slice(0, 2);
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
