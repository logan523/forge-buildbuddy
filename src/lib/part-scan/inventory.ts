/**
 * Bench inventory — localStorage per plan. Photos stay on-device (data URLs).
 */

import type { BenchInventory, BenchItem, ScanConfidence } from "./types";

const key = (planId: string) => `forge-bench-inventory-v1:${planId}`;

export function loadBenchInventory(planId: string): BenchInventory {
  if (typeof window === "undefined") {
    return { planId, items: [], updatedAt: new Date(0).toISOString() };
  }
  try {
    const raw = localStorage.getItem(key(planId));
    if (!raw) return { planId, items: [], updatedAt: new Date(0).toISOString() };
    const parsed = JSON.parse(raw) as BenchInventory;
    if (!parsed || parsed.planId !== planId || !Array.isArray(parsed.items)) {
      return { planId, items: [], updatedAt: new Date(0).toISOString() };
    }
    return parsed;
  } catch {
    return { planId, items: [], updatedAt: new Date(0).toISOString() };
  }
}

export function saveBenchInventory(inv: BenchInventory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(inv.planId), JSON.stringify(inv));
  } catch {
    // Quota — drop oldest photos first
    try {
      const slim: BenchInventory = {
        ...inv,
        items: inv.items.map((it, i) =>
          i < inv.items.length - 3 ? { ...it, photoDataUrl: "" } : it
        ),
      };
      localStorage.setItem(key(inv.planId), JSON.stringify(slim));
    } catch {
      /* give up silently */
    }
  }
}

export function upsertBenchItem(
  planId: string,
  item: Omit<BenchItem, "id" | "planId" | "scannedAt"> & { id?: string }
): BenchInventory {
  const inv = loadBenchInventory(planId);
  const now = new Date().toISOString();
  // One entry per plan partId — rescans replace the photo
  const rest = inv.items.filter((x) => x.partId !== item.partId);
  const full: BenchItem = {
    id: item.id ?? `scan-${item.partId}-${Date.now()}`,
    planId,
    partId: item.partId,
    catalogId: item.catalogId,
    name: item.name,
    photoDataUrl: item.photoDataUrl,
    confidence: item.confidence,
    cues: item.cues,
    orientationTips: item.orientationTips,
    silkscreenText: item.silkscreenText,
    visiblePins: item.visiblePins,
    scannedAt: now,
  };
  const next: BenchInventory = {
    planId,
    items: [...rest, full],
    updatedAt: now,
  };
  saveBenchInventory(next);
  return next;
}

export function removeBenchItem(planId: string, partId: string): BenchInventory {
  const inv = loadBenchInventory(planId);
  const next: BenchInventory = {
    planId,
    items: inv.items.filter((x) => x.partId !== partId),
    updatedAt: new Date().toISOString(),
  };
  saveBenchInventory(next);
  return next;
}

export function itemForPart(
  inv: BenchInventory,
  partId: string | undefined | null
): BenchItem | undefined {
  if (!partId) return undefined;
  return inv.items.find((x) => x.partId === partId);
}

export function itemsForWire(
  inv: BenchInventory,
  fromPartId?: string,
  toPartId?: string
): { from?: BenchItem; to?: BenchItem } {
  return {
    from: itemForPart(inv, fromPartId),
    to: itemForPart(inv, toPartId),
  };
}

export function coverageStats(
  inv: BenchInventory,
  partIds: string[]
): { scanned: number; total: number; missing: string[] } {
  const have = new Set(inv.items.map((i) => i.partId));
  const missing = partIds.filter((id) => !have.has(id));
  return {
    scanned: partIds.length - missing.length,
    total: partIds.length,
    missing,
  };
}

export function isTrustedScan(c: ScanConfidence): boolean {
  return c === "high" || c === "medium";
}
