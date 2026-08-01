/**
 * Part Scan — camera identify → bench inventory → solder guidance.
 * Types only; pure match logic lives in match.ts / handle.ts.
 */

import type { CatalogPartId } from "@/lib/product-3d/real-parts";

export type ScanConfidence = "high" | "medium" | "low" | "unknown";

/** One plan part offered to the vision model as a legal match target. */
export interface ScanCandidate {
  /** Plan Part.id */
  partId: string;
  name: string;
  specification?: string;
  catalogId?: string;
  ref?: string;
}

export interface ScanImage {
  data: string; // base64, no data: prefix
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/** Vision model response after parsing (never invents partIds). */
export interface ScanMatchResult {
  /** Matched plan Part.id, or null if unknown / not in candidates */
  partId: string | null;
  confidence: ScanConfidence;
  /** Short cues the model saw (silkscreen, size, connectors) */
  cues: string[];
  /** What to verify by hand when confidence isn't high */
  manualCheck: string;
  /** Optional catalog id echo when model is sure of module class */
  catalogHint?: CatalogPartId | string | null;
  /** Silkscreen / package text the model read (OCR-style cues) */
  silkscreenText?: string[];
  /** Pin labels visible on the module edge */
  visiblePins?: string[];
}

/** One item on the builder's physical bench for this plan. */
export interface BenchItem {
  id: string;
  planId: string;
  partId: string;
  catalogId?: string;
  name: string;
  /** data URL (jpeg) captured at match time — local only */
  photoDataUrl: string;
  confidence: ScanConfidence;
  cues: string[];
  scannedAt: string; // ISO
  /** How to hold / orient this module for soldering */
  orientationTips: string[];
  silkscreenText?: string[];
  visiblePins?: string[];
}

export interface BenchInventory {
  planId: string;
  items: BenchItem[];
  updatedAt: string;
}
