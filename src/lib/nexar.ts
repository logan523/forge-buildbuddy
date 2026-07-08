import type { Part, ShoppingLink } from "./types";

/**
 * Optional Nexar (Octopart) live pricing.
 * Requires NEXAR_CLIENT_ID + NEXAR_CLIENT_SECRET in env.
 * When unset, returns parts unchanged — catalog estimates still work.
 */

interface NexarPartResult {
  mpn?: string;
  manufacturer?: { name?: string };
  bestDatasheet?: { url?: string };
  sellers?: Array<{
    company?: { name?: string };
    offers?: Array<{
      inventoryLevel?: number;
      prices?: Array<{ quantity: number; price: number; currency: string }>;
      clickUrl?: string;
    }>;
  }>;
}

function vendorFromSeller(name: string): ShoppingLink["vendor"] {
  const n = name.toLowerCase();
  if (n.includes("digi-key") || n.includes("digikey")) return "digikey";
  if (n.includes("mouser")) return "mouser";
  if (n.includes("lcsc") || n.includes("jlc")) return "lcsc";
  if (n.includes("amazon")) return "amazon";
  return "other";
}

async function getNexarToken(): Promise<string | null> {
  const id = process.env.NEXAR_CLIENT_ID;
  const secret = process.env.NEXAR_CLIENT_SECRET;
  if (!id || !secret) return null;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
  });

  const res = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.warn("Nexar token failed", res.status);
    return null;
  }
  const data = (await res.json()) as { access_token?: string };
  return data.access_token || null;
}

const SEARCH_QUERY = `
query Search($q: String!) {
  supSearch(q: $q, limit: 3) {
    results {
      part {
        mpn
        manufacturer { name }
        sellers(limit: 5) {
          company { name }
          offers(limit: 2) {
            inventoryLevel
            prices { quantity price currency }
            clickUrl
          }
        }
      }
    }
  }
}
`;

async function searchNexar(token: string, q: string): Promise<NexarPartResult[]> {
  const res = await fetch("https://api.nexar.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: { supSearch?: { results?: Array<{ part?: NexarPartResult }> } };
  };
  return (json.data?.supSearch?.results || []).map((r) => r.part!).filter(Boolean);
}

function offersFromNexar(part: NexarPartResult): ShoppingLink[] {
  const links: ShoppingLink[] = [];
  for (const seller of part.sellers || []) {
    const company = seller.company?.name || "Distributor";
    const vendor = vendorFromSeller(company);
    for (const offer of seller.offers || []) {
      if (!offer.clickUrl) continue;
      const priceRow = (offer.prices || []).slice().sort((a, b) => a.quantity - b.quantity)[0];
      links.push({
        vendor,
        label: company,
        url: offer.clickUrl,
        kind: "product",
        priceUsd: priceRow?.currency === "USD" ? priceRow.price : priceRow?.price,
        currency: priceRow?.currency || "USD",
        inStock: (offer.inventoryLevel ?? 0) > 0,
        priceSource: "live",
        mpn: part.mpn,
      });
    }
  }
  return links;
}

/** Enrich parts that have an MPN or strong catalog match with live offers. */
export async function enrichLivePrices(parts: Part[]): Promise<Part[]> {
  const token = await getNexarToken();
  if (!token) return parts;

  const out: Part[] = [];
  // sequential to respect rate limits; catalogs are small
  for (const part of parts) {
    const q =
      part.shoppingLinks?.find((l) => l.mpn)?.mpn ||
      part.specification ||
      part.name;

    try {
      const results = await searchNexar(token, q);
      const liveLinks = results.flatMap(offersFromNexar);
      if (liveLinks.length === 0) {
        out.push(part);
        continue;
      }

      const bestPrice = liveLinks
        .map((l) => l.priceUsd)
        .filter((p): p is number => p != null)
        .sort((a, b) => a - b)[0];

      out.push({
        ...part,
        shoppingLinks: [...liveLinks, ...(part.shoppingLinks || [])],
        unitPriceMin: bestPrice ?? part.unitPriceMin,
        unitPriceMax: part.unitPriceMax ?? bestPrice,
        priceSource: bestPrice != null ? "live" : part.priceSource,
      });
    } catch (err) {
      console.warn("Nexar search failed for", part.name, err);
      out.push(part);
    }
  }
  return out;
}

export function nexarConfigured(): boolean {
  return !!(process.env.NEXAR_CLIENT_ID && process.env.NEXAR_CLIENT_SECRET);
}
