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
  /** Post-processing composer on at all (low tier renders raw for weak GPUs) */
  effects: boolean;
  /** Ambient occlusion pass (contact/crevice darkening — the cheapest realism win) */
  ao: boolean;
  /** N8AO strength + radius, tier-scaled so medium gets a lighter pass than high */
  aoIntensity: number;
  aoRadius: number;
  bloomIntensity: number;
  /** Composer MSAA samples (0 = off) */
  multisampling: number;
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
        effects: true,
        ao: true,
        aoIntensity: 2,
        aoRadius: 0.4,
        bloomIntensity: 0.55,
        multisampling: 4,
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
        effects: true,
        // AO ungated to medium (eng review): phones/most laptops land here, and
        // contact/crevice darkening is the cheapest realism win. Lighter than
        // high (half the strength, tighter radius) to stay in the frame budget.
        ao: true,
        aoIntensity: 1.1,
        aoRadius: 0.32,
        bloomIntensity: 0.4,
        multisampling: 2,
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
        effects: false,
        ao: false,
        aoIntensity: 0,
        aoRadius: 0,
        bloomIntensity: 0,
        multisampling: 0,
      };
  }
}

/** Infer initial tier from viewport / coarse hardware hints (client only). */
export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const w = window.innerWidth;
  // Narrow viewport ≠ weak GPU (eng V3): phones default to "medium" (bloom,
  // no AO) so the kitchen-table device gets the graphics; genuinely low-end
  // hardware still starts low, and the monitor demotes honestly at runtime.
  if (cores <= 4 || (mem != null && mem <= 4)) return "low";
  if (w < 640) return "medium";
  if (cores >= 8 && w >= 1200 && (mem == null || mem >= 8)) return "high";
  return "medium";
}
