"use client";

/**
 * Stage post-processing — tiered, with a CONSTANT pass list per tier.
 *
 * The old composer changed its children count across modes (2/3/4/5), and
 * @react-three/postprocessing rebuilds the entire pass chain whenever the
 * children identity changes — a stutter exactly at quality-demotion moments.
 * Here the child list is fixed; modes tune uniforms, never mount/unmount
 * passes. Low tier renders raw (no composer at all).
 *
 * ACESFilmicToneMapping-equivalent filmic response comes from the ToneMapping
 * pass (ACES mode); Bloom threshold 1.3 keeps blooming to true emissive
 * displays (OLED, trace bead) — both carried over from the tuned legacy values.
 */
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { qualitySettings, type QualityTier } from "@/lib/product-3d";

export function StagePostFx({ tier }: { tier: QualityTier }) {
  const q = qualitySettings(tier);
  if (!q.effects) return null;
  return (
    <EffectComposer multisampling={q.multisampling}>
      <N8AO halfRes intensity={q.aoIntensity} aoRadius={q.aoRadius} distanceFalloff={0.5} />
      <Bloom
        mipmapBlur
        intensity={q.bloomIntensity}
        luminanceThreshold={1.3}
        luminanceSmoothing={0.2}
        radius={0.55}
      />
      <Vignette darkness={0.18} offset={0.3} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
