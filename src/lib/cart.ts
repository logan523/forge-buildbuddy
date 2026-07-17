import type { Part, ShoppingLink, Vendor } from "./types";
import { getModuleById, type CatalogModule } from "./catalog";

export type CartStrategy = "fast" | "electronics" | "split";

// Single source of truth for vendor display names — was duplicated between
// build-ui.tsx and build-session.tsx; both now import this one.
export const VENDOR_LABEL: Record<Vendor, string> = {
  amazon: "Amazon",
  aliexpress: "AliExpress",
  digikey: "DigiKey",
  mouser: "Mouser",
  lcsc: "LCSC",
  other: "Buy",
};

const VENDOR_PRIORITY_FAST: Vendor[] = ["amazon", "aliexpress", "lcsc", "digikey", "mouser", "other"];
const VENDOR_PRIORITY_ELECTRONICS: Vendor[] = ["lcsc", "digikey", "mouser", "amazon", "aliexpress", "other"];

const MECHANICAL_HINTS = [
  "bamboo", "coaster", "brass", "copper", "wood", "tube", "wire spool",
  "enclosure", "case", "acrylic", "3d print", "frame",
];

export function isMechanicalPart(part: Part, mod?: CatalogModule | null): boolean {
  if (mod?.category === "mechanical" || mod?.category === "passive") {
    // jumpers/breadboard are electronic-adjacent — buy anywhere
    if (mod.id === "jumper-wires" || mod.id === "breadboard") return false;
    return mod.category === "mechanical";
  }
  const t = `${part.name} ${part.specification}`.toLowerCase();
  return MECHANICAL_HINTS.some((h) => t.includes(h));
}

function amazonSearch(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&s=price-asc-rank`;
}
function aliexpressSearch(query: string): string {
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}&SortType=price_asc`;
}
function lcscSearch(query: string): string {
  return `https://www.lcsc.com/search?q=${encodeURIComponent(query)}`;
}
function digikeySearch(query: string): string {
  return `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(query)}&stock=1`;
}
function mouserSearch(query: string): string {
  return `https://www.mouser.com/c/?q=${encodeURIComponent(query)}&instock=y`;
}

/** Build multi-vendor offers from a catalog module (precise queries + price bands). */
export function offersFromModule(mod: CatalogModule): ShoppingLink[] {
  const amazonQ = mod.amazonQuery || mod.searchQuery;
  const links: ShoppingLink[] = [];

  links.push({
    vendor: "amazon",
    label: "Amazon",
    url: amazonSearch(amazonQ),
    kind: "search",
    priceUsd: mod.priceMin,
    priceMaxUsd: mod.priceMax,
    currency: "USD",
    mpn: mod.mpn,
  });

  if (mod.category !== "mechanical" && mod.category !== "battery") {
    const lq = mod.lcscQuery || mod.mpn || mod.searchQuery;
    if (lq) {
      links.push({
        vendor: "lcsc",
        label: "LCSC",
        url: lcscSearch(lq),
        kind: "search",
        priceUsd: mod.priceMin,
        priceMaxUsd: mod.priceMax,
        currency: "USD",
        mpn: mod.mpn,
      });
    }
    const dq = mod.digikeyQuery || mod.mpn;
    if (dq) {
      links.push({
        vendor: "digikey",
        label: "DigiKey",
        url: digikeySearch(dq),
        kind: "search",
        mpn: mod.mpn,
      });
      links.push({
        vendor: "mouser",
        label: "Mouser",
        url: mouserSearch(dq),
        kind: "search",
        mpn: mod.mpn,
      });
    }
  }

  // Cheap mechanical / hobby modules also on AliExpress
  if (mod.category !== "mechanical" || mod.id.includes("wire") || mod.id.includes("tube")) {
    links.push({
      vendor: "aliexpress",
      label: "AliExpress",
      url: aliexpressSearch(amazonQ),
      kind: "search",
      priceUsd: mod.priceMin ? mod.priceMin * 0.7 : undefined,
      priceMaxUsd: mod.priceMax ? mod.priceMax * 0.85 : undefined,
      currency: "USD",
    });
  }

  return links;
}

/** Fallback offers when part is not in catalog. */
export function offersFromFreeText(part: Part): ShoppingLink[] {
  const q = `${part.name} ${part.specification}`.trim();
  const mechanical = isMechanicalPart(part);
  const links: ShoppingLink[] = [
    { vendor: "amazon", label: "Amazon", url: amazonSearch(q), kind: "search" },
  ];
  if (!mechanical) {
    links.push({ vendor: "lcsc", label: "LCSC", url: lcscSearch(q), kind: "search" });
    links.push({ vendor: "digikey", label: "DigiKey", url: digikeySearch(q), kind: "search" });
    links.push({ vendor: "mouser", label: "Mouser", url: mouserSearch(q), kind: "search" });
  }
  links.push({ vendor: "aliexpress", label: "AliExpress", url: aliexpressSearch(q), kind: "search" });
  return links;
}

export function resolveOffers(part: Part): ShoppingLink[] {
  if (part.shoppingLinks && part.shoppingLinks.length > 0) {
    return part.shoppingLinks;
  }
  const mod = part.catalogId ? getModuleById(part.catalogId) : undefined;
  if (mod) return offersFromModule(mod);
  return offersFromFreeText(part);
}

function vendorRank(vendor: Vendor, strategy: CartStrategy, part: Part): number {
  const mod = part.catalogId ? getModuleById(part.catalogId) : undefined;
  const mechanical = isMechanicalPart(part, mod);

  if (strategy === "fast" || mechanical) {
    return VENDOR_PRIORITY_FAST.indexOf(vendor);
  }
  if (strategy === "electronics") {
    return VENDOR_PRIORITY_ELECTRONICS.indexOf(vendor);
  }
  // split: mechanical → amazon first, electronics → lcsc first
  if (mechanical) return VENDOR_PRIORITY_FAST.indexOf(vendor);
  return VENDOR_PRIORITY_ELECTRONICS.indexOf(vendor);
}

/**
 * Pick the best single buy link for a part.
 * Preference: live product pages with price → preferred vendor → strategy rank.
 */
export function bestLink(part: Part, strategy: CartStrategy = "split"): ShoppingLink {
  const offers = resolveOffers(part);
  if (offers.length === 0) {
    return {
      vendor: "amazon",
      label: "Amazon",
      url: amazonSearch(`${part.name} ${part.specification}`),
      kind: "search",
    };
  }

  const mod = part.catalogId ? getModuleById(part.catalogId) : undefined;
  const preferred = (mod?.preferredVendor as Vendor | undefined) || undefined;

  const scored = offers.map((o, i) => {
    let score = 100 - i;
    // Product pages beat search
    if (o.kind === "product") score += 50;
    if (o.kind === "product" && o.priceUsd != null) score += 20;
    if (o.inStock === true) score += 15;
    if (o.inStock === false) score -= 40;
    // Preferred vendor (catalog default) — weaker under electronics strategy
    if (preferred && o.vendor === preferred) {
      score += strategy === "electronics" ? 8 : 25;
    }
    // Strategy rank (lower index better)
    const rank = vendorRank(o.vendor, strategy, part);
    score += Math.max(0, 12 - rank) * 4;
    return { o, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].o;
}

export interface LineEstimate {
  partId: string;
  name: string;
  quantity: number;
  unitMin?: number;
  unitMax?: number;
  lineMin?: number;
  lineMax?: number;
  currency: string;
  priceSource: "catalog" | "live" | "unknown";
  best: ShoppingLink;
}

export interface BomEstimate {
  lines: LineEstimate[];
  totalMin: number;
  totalMax: number;
  currency: string;
  pricedCount: number;
  unpricedCount: number;
}

export function estimateBom(parts: Part[], strategy: CartStrategy = "split"): BomEstimate {
  const lines: LineEstimate[] = [];
  let totalMin = 0;
  let totalMax = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  for (const part of parts) {
    const best = bestLink(part, strategy);
    const qty = part.quantity || 1;
    const unitMin = part.unitPriceMin ?? best.priceUsd;
    const unitMax = part.unitPriceMax ?? best.priceMaxUsd ?? best.priceUsd;
    const priceSource = part.priceSource || (unitMin != null ? "catalog" : "unknown");

    let lineMin: number | undefined;
    let lineMax: number | undefined;
    if (unitMin != null) {
      lineMin = unitMin * qty;
      lineMax = (unitMax ?? unitMin) * qty;
      totalMin += lineMin;
      totalMax += lineMax;
      pricedCount += 1;
    } else {
      unpricedCount += 1;
    }

    lines.push({
      partId: part.id,
      name: part.name,
      quantity: qty,
      unitMin,
      unitMax,
      lineMin,
      lineMax,
      currency: best.currency || "USD",
      priceSource,
      best,
    });
  }

  return { lines, totalMin, totalMax, currency: "USD", pricedCount, unpricedCount };
}

export interface CartOpenItem {
  part: Part;
  link: ShoppingLink;
  vendor: Vendor;
}

/** Group buy actions by vendor for fewer context switches. */
export function planCartOpens(parts: Part[], strategy: CartStrategy = "split"): CartOpenItem[] {
  const items = parts.map((part) => {
    const link = bestLink(part, strategy);
    return { part, link, vendor: link.vendor };
  });

  // Sort so same vendor tabs open together
  const order = strategy === "electronics" ? VENDOR_PRIORITY_ELECTRONICS : VENDOR_PRIORITY_FAST;
  items.sort((a, b) => order.indexOf(a.vendor) - order.indexOf(b.vendor));
  return items;
}

export function formatUsdRange(min?: number, max?: number): string {
  if (min == null) return "—";
  const fmt = (n: number) => {
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(2);
  };
  const a = fmt(min);
  if (max == null || Math.abs(max - min) < 0.01) return `$${a}`;
  return `$${a}–$${fmt(max)}`;
}

/** Midpoint of a price band — a single number reads faster than a bare range. */
export function usdMidpoint(min?: number, max?: number): number | undefined {
  if (min == null) return undefined;
  if (max == null) return min;
  return (min + max) / 2;
}

/**
 * Cart estimate headline: a midpoint first ("~$65"), with the honest range
 * kept alongside instead of hidden ("~$65 · typically $41–$127 depending on
 * vendor") whenever the band is wide enough to matter. A bare "$41–$127"
 * forces the reader to average it themselves; a bare midpoint alone hides
 * how much vendor actually moves the price.
 */
export function formatUsdMidpoint(min?: number, max?: number): string {
  const mid = usdMidpoint(min, max);
  if (mid == null) return "—";
  const headline = `~${formatUsdRange(mid)}`;
  if (min == null || max == null) return headline;
  // Suppress the range clause whenever the FORMATTED endpoints collapse to the
  // same string — a raw epsilon misses bands like 65..65.02, which the dollar
  // rounding would otherwise render as the nonsense "typically $65–$65".
  if (formatUsdRange(min) === formatUsdRange(max)) return headline;
  return `${headline} · typically ${formatUsdRange(min, max)} depending on vendor`;
}

/** Attach catalog offers + price estimates onto parts (used by trust pipeline). */
export function attachBuyData(parts: Part[]): Part[] {
  return parts.map((part) => {
    const mod = part.catalogId ? getModuleById(part.catalogId) : undefined;
    const offers = mod ? offersFromModule(mod) : offersFromFreeText(part);

    // Merge any live-priced product links already on the part (Nexar)
    const live = (part.shoppingLinks || []).filter((l) => l.kind === "product" || l.priceSource === "live");
    const merged = [...live, ...offers.filter((o) => !live.some((l) => l.vendor === o.vendor && l.kind === "product"))];

    const unitMin = part.unitPriceMin ?? mod?.priceMin ?? live.find((l) => l.priceUsd != null)?.priceUsd;
    const unitMax = part.unitPriceMax ?? mod?.priceMax ?? unitMin;

    return {
      ...part,
      shoppingLinks: merged.length ? merged : offers,
      unitPriceMin: unitMin,
      unitPriceMax: unitMax,
      priceSource: part.priceSource || (live.length ? "live" : unitMin != null ? "catalog" : "unknown"),
      preferredVendor: part.preferredVendor || mod?.preferredVendor,
    };
  });
}
