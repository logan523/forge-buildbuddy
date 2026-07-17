import catalogData from "@/data/modules-catalog.json";
import type { Part, Vendor } from "./types";

export interface CatalogModule {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  logicVoltage: number | null;
  maxIOVoltage: number | null;
  interface: string[];
  pins: string[];
  defaultI2c?: { sda: string; scl: string };
  i2cAddress?: string;
  i2cAddressAlt?: string;
  requiresPullups?: boolean;
  hazards: string[];
  footguns: string[];
  providesProtection?: boolean;
  isLithiumCell?: boolean;
  searchQuery: string;
  typicalPrice: string;
  specs: string;
  /** Buy-loop fields */
  preferredVendor?: Vendor;
  mpn?: string;
  manufacturer?: string;
  lcscPart?: string;
  mpnVerifiedAt?: string;
  mpnNote?: string;
  priceMin?: number;
  priceMax?: number;
  amazonQuery?: string;
  lcscQuery?: string;
  digikeyQuery?: string;
  substituteIds?: string[];
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface PartMatch {
  catalogId: string | null;
  confidence: MatchConfidence;
  score: number;
  module: CatalogModule | null;
}

const modules = catalogData.modules as CatalogModule[];

export function getCatalog(): CatalogModule[] {
  return modules;
}

export function getModuleById(id: string): CatalogModule | undefined {
  return modules.find((m) => m.id === id);
}

/**
 * Resolve a module's substituteIds to their catalog entries — the field has
 * existed since the schema shipped but nothing read it (PartCard is the
 * first consumer). Unknown/typo'd ids drop silently rather than showing a
 * broken "also works" line.
 */
export function resolveSubstitutes(mod: CatalogModule): CatalogModule[] {
  if (!mod.substituteIds?.length) return [];
  return mod.substituteIds
    .map((id) => getModuleById(id))
    .filter((m): m is CatalogModule => !!m);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Score how well a free-text part name/spec matches a catalog module. */
export function scoreMatch(partText: string, mod: CatalogModule): number {
  const text = normalize(partText);
  if (!text) return 0;

  let score = 0;
  const idNorm = normalize(mod.id.replace(/-/g, " "));
  if (text.includes(idNorm) || idNorm.split(" ").every((w) => w.length > 2 && text.includes(w))) {
    score += 40;
  }

  for (const alias of mod.aliases) {
    const a = normalize(alias);
    if (!a) continue;
    if (text === a) score += 50;
    else if (text.includes(a)) score += 30 + Math.min(a.length, 20);
  }

  const nameNorm = normalize(mod.name);
  for (const token of nameNorm.split(" ")) {
    if (token.length < 3) continue;
    if (text.includes(token)) score += 4;
  }

  // Strong chip/part numbers
  for (const token of ["ssd1306", "esp32", "sht31", "tp4056", "hc sr04", "nrf24", "bme280", "dht22", "16340", "18650"]) {
    if (text.includes(token) && (normalize(mod.name).includes(token) || mod.aliases.some((a) => normalize(a).includes(token)))) {
      score += 15;
    }
  }

  return score;
}

export function matchPart(part: Pick<Part, "name" | "specification">): PartMatch {
  const text = `${part.name} ${part.specification || ""}`;
  let best: { mod: CatalogModule; score: number } | null = null;

  for (const mod of modules) {
    const score = scoreMatch(text, mod);
    if (!best || score > best.score) best = { mod, score };
  }

  if (!best || best.score < 20) {
    return { catalogId: null, confidence: "none", score: best?.score ?? 0, module: null };
  }
  if (best.score >= 55) {
    return { catalogId: best.mod.id, confidence: "high", score: best.score, module: best.mod };
  }
  if (best.score >= 35) {
    return { catalogId: best.mod.id, confidence: "medium", score: best.score, module: best.mod };
  }
  return { catalogId: best.mod.id, confidence: "low", score: best.score, module: best.mod };
}

/**
 * Bind catalog IDs and footguns. Call attachBuyData() next for offers/prices.
 * Pure function — does not call LLMs or Nexar.
 */
export function enrichParts(parts: Part[]): Part[] {
  return parts.map((part, index) => {
    const match = matchPart(part);
    const id = part.id || `part-${index + 1}`;

    if (!match.module || match.confidence === "none") {
      return {
        ...part,
        id,
        catalogId: part.catalogId,
        matchConfidence: (part.matchConfidence || "none") as MatchConfidence,
      };
    }

    const mod = match.module;
    return {
      ...part,
      id,
      catalogId: match.catalogId ?? undefined,
      matchConfidence: match.confidence,
      footguns: mod.footguns?.length ? mod.footguns : part.footguns,
      specification: part.specification || mod.specs,
      manufacturer: mod.manufacturer || part.manufacturer,
      mpn: mod.mpn || part.mpn,
      lcscPart: mod.lcscPart || part.lcscPart,
      mpnVerifiedAt: mod.mpnVerifiedAt || part.mpnVerifiedAt,
      mpnNote: mod.mpnNote || part.mpnNote,
      // Clear weak prior search links so attachBuyData builds precise offers
      shoppingLinks: undefined,
      notes: part.notes,
    };
  });
}
