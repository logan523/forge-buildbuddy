/**
 * Adaptive quality tiers for the technical-light Stage.
 *
 * The photoreal era's tier knobs (AO, bloom, composer MSAA, env intensity)
 * are gone with the post-processing pipeline — tiers now only scale what the
 * flat CAD-style renderer still spends on: pixel ratio, geometry segments,
 * MSAA, and the contact-shadow catcher.
 */
export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  shadowBlur: number;
  shadowOpacity: number;
  segments: number; // cylinder radial segments
  showGround: boolean;
  antialias: boolean;
}

export function qualitySettings(tier: QualityTier): QualitySettings {
  switch (tier) {
    case "high":
      return {
        tier,
        dpr: [1, 1.75],
        shadowBlur: 2.8,
        shadowOpacity: 0.42,
        segments: 48,
        showGround: true,
        antialias: true,
      };
    case "medium":
      return {
        tier,
        dpr: [1, 1.35],
        shadowBlur: 2.2,
        shadowOpacity: 0.36,
        segments: 32,
        showGround: true,
        antialias: true,
      };
    case "low":
    default:
      return {
        tier: "low",
        dpr: [1, 1.1],
        shadowBlur: 1.5,
        shadowOpacity: 0.28,
        segments: 20,
        showGround: false,
        antialias: false,
      };
  }
}

/** Infer initial tier from viewport / coarse hardware hints (client only). */
export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const w = window.innerWidth;
  // Narrow viewport ≠ weak GPU (eng V3): phones default to "medium" so the
  // kitchen-table device gets the graphics; genuinely low-end hardware still
  // starts low, and the monitor demotes honestly at runtime.
  if (cores <= 4 || (mem != null && mem <= 4)) return "low";
  if (w < 640) return "medium";
  if (cores >= 8 && w >= 1200 && (mem == null || mem >= 8)) return "high";
  return "medium";
}
