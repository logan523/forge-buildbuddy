/**
 * Map silkscreen pin names → UV coordinates on the board face (0–1).
 * Derived from real-parts local mm when catalog is known; generic header
 * layouts otherwise so AR still places a useful highlight.
 */

import type { CatalogPartId } from "@/lib/product-3d/real-parts";
import { getRealPart } from "@/lib/product-3d/real-parts";
import type { Pt } from "./homography";

export interface PinUv {
  name: string;
  /** 0–1 along board width (left→right when silkscreen upright) */
  u: number;
  /** 0–1 along board height (top→bottom in image space) */
  v: number;
}

function normalizePin(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, "");
}

/** Local mm (origin center) → UV with Y flipped for image coords. */
function localToUv(
  x: number,
  y: number,
  l: number,
  w: number
): { u: number; v: number } {
  const u = (x + l / 2) / l;
  const v = 1 - (y + w / 2) / w; // image Y grows downward
  return {
    u: Math.min(0.95, Math.max(0.05, u)),
    v: Math.min(0.95, Math.max(0.05, v)),
  };
}

export function pinLayoutForCatalog(
  catalogId: string | undefined | null
): PinUv[] {
  if (!catalogId) return genericHeaderPins(4);
  const real = getRealPart(catalogId as CatalogPartId);
  if (!real || !real.pins.length) return genericHeaderPins(4);
  const { l, w } = real.bboxMm;
  return real.pins
    .filter((p) => p.name.toLowerCase() !== "body")
    .map((p) => {
      const { u, v } = localToUv(p.local[0], p.local[1], l, w);
      return { name: p.name, u, v };
    });
}

/** Fallback: single-row header along bottom edge. */
function genericHeaderPins(n: number): PinUv[] {
  const names = ["GND", "VCC", "SCL", "SDA", "SIG", "OUT", "IN", "3V3"];
  const out: PinUv[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: names[i] ?? `P${i}`,
      u: 0.15 + (0.7 * i) / Math.max(1, n - 1),
      v: 0.88,
    });
  }
  return out;
}

/**
 * Find UV for a pin label (fuzzy). Prefers exact match, then includes.
 */
export function resolvePinUv(
  pinName: string,
  catalogId?: string | null
): PinUv {
  const layout = pinLayoutForCatalog(catalogId);
  const target = normalizePin(pinName);
  if (!target) {
    return layout[0] ?? { name: "?", u: 0.5, v: 0.5 };
  }

  const exact = layout.find((p) => normalizePin(p.name) === target);
  if (exact) return exact;

  // GPIO4 vs GPIO, SDA, etc.
  const partial = layout.find(
    (p) =>
      normalizePin(p.name).includes(target) ||
      target.includes(normalizePin(p.name))
  );
  if (partial) return partial;

  // Common aliases
  if (target === "GND" || target === "-") {
    const g = layout.find((p) => /GND|BAT-|OUT-|IN-|^-$/i.test(p.name));
    if (g) return g;
  }
  if (/^(VCC|3V3|VIN|\+|BAT\+|OUT\+|IN\+)$/.test(target)) {
    const pwr = layout.find((p) => /VCC|3V3|VIN|\+|BAT\+|OUT\+|IN\+/i.test(p.name));
    if (pwr) return pwr;
  }

  // Heuristic placement by name class for unknown catalogs
  if (/GND|-$/i.test(target)) return { name: pinName, u: 0.2, v: 0.85 };
  if (/VCC|3V3|\+/i.test(target)) return { name: pinName, u: 0.35, v: 0.85 };
  if (/SDA|DATA/i.test(target)) return { name: pinName, u: 0.8, v: 0.85 };
  if (/SCL|CLK/i.test(target)) return { name: pinName, u: 0.65, v: 0.85 };
  if (/GPIO|SIG/i.test(target)) return { name: pinName, u: 0.5, v: 0.2 };

  return { name: pinName, u: 0.5, v: 0.75 };
}

/** UV → board plane point (for homography src). */
export function uvToPt(uv: { u: number; v: number }): Pt {
  return { x: uv.u, y: uv.v };
}
