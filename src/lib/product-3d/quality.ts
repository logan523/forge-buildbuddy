/**
 * Adaptive quality tiers for responsive 3D (Palantir-smooth on weak hardware).
 */
export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  shadowBlur: number;
  shadowOpacity: number;
  envIntensity: number;
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
        shadowOpacity: 0.5,
        envIntensity: 0.85,
        segments: 48,
        showGround: true,
        antialias: true,
      };
    case "medium":
      return {
        tier,
        dpr: [1, 1.35],
        shadowBlur: 2.2,
        shadowOpacity: 0.4,
        envIntensity: 0.7,
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
        shadowOpacity: 0.3,
        envIntensity: 0.55,
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
  if (w < 640 || cores <= 4 || (mem != null && mem <= 4)) return "low";
  if (cores >= 8 && w >= 1200 && (mem == null || mem >= 8)) return "high";
  return "medium";
}
