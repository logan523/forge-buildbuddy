/**
 * PBR material presets — Palantir-grade studio look for parametric parts.
 * Open-source Three.js MeshPhysicalMaterial parameters (no proprietary assets).
 */
import type { SceneMaterial } from "./types";

export type MaterialPresetId =
  | "bamboo"
  | "brass"
  | "copper"
  | "oled_glass"
  | "oled_bezel"
  | "pcb_green"
  | "solar_cell"
  | "solar_frame"
  | "plastic_soft"
  | "plastic_hard"
  | "battery_body"
  | "sensor_body"
  | "touch_pad"
  | "generic";

export interface PhysicalMatProps {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  emissive?: string;
  emissiveIntensity?: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  envMapIntensity?: number;
}

const PRESETS: Record<MaterialPresetId, PhysicalMatProps> = {
  bamboo: {
    color: "#c9a66b",
    metalness: 0.02,
    roughness: 0.72,
    clearcoat: 0.15,
    clearcoatRoughness: 0.55,
    sheen: 0.25,
    sheenRoughness: 0.7,
    sheenColor: "#e8d4a8",
    envMapIntensity: 0.55,
  },
  brass: {
    color: "#c9a227",
    metalness: 0.92,
    roughness: 0.28,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.15,
  },
  copper: {
    color: "#b87333",
    metalness: 0.95,
    roughness: 0.32,
    clearcoat: 0.2,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.1,
  },
  oled_glass: {
    color: "#0a1628",
    metalness: 0.15,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: "#0e7490",
    emissiveIntensity: 0.45,
    envMapIntensity: 1.4,
  },
  oled_bezel: {
    color: "#1a1a1e",
    metalness: 0.35,
    roughness: 0.45,
    clearcoat: 0.1,
    envMapIntensity: 0.6,
  },
  pcb_green: {
    color: "#14532d",
    metalness: 0.12,
    roughness: 0.55,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.7,
  },
  solar_cell: {
    color: "#0c1222",
    metalness: 0.55,
    roughness: 0.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.0,
  },
  solar_frame: {
    color: "#94a3b8",
    metalness: 0.85,
    roughness: 0.3,
    envMapIntensity: 1.0,
  },
  plastic_soft: {
    color: "#c4b5fd",
    metalness: 0.05,
    roughness: 0.48,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.65,
  },
  plastic_hard: {
    color: "#d6d3d1",
    metalness: 0.08,
    roughness: 0.55,
    clearcoat: 0.2,
    envMapIntensity: 0.5,
  },
  battery_body: {
    color: "#1e293b",
    metalness: 0.55,
    roughness: 0.38,
    clearcoat: 0.25,
    envMapIntensity: 0.9,
  },
  sensor_body: {
    color: "#d1fae5",
    metalness: 0.08,
    roughness: 0.42,
    clearcoat: 0.3,
    envMapIntensity: 0.6,
  },
  touch_pad: {
    color: "#a78bfa",
    metalness: 0.15,
    roughness: 0.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    emissive: "#6d28d9",
    emissiveIntensity: 0.12,
    envMapIntensity: 0.8,
  },
  generic: {
    color: "#94a3b8",
    metalness: 0.2,
    roughness: 0.5,
    envMapIntensity: 0.7,
  },
};

export function getMaterialPreset(id: MaterialPresetId | string | undefined): PhysicalMatProps {
  if (id && id in PRESETS) return PRESETS[id as MaterialPresetId];
  return PRESETS.generic;
}

/** Infer preset from geom kind + node material when no explicit preset. */
export function inferMaterialPreset(
  geomKind: string,
  material: SceneMaterial,
  nodeId?: string
): MaterialPresetId {
  const explicit = (material as SceneMaterial & { preset?: string }).preset;
  if (explicit && explicit in PRESETS) return explicit as MaterialPresetId;

  const c = (material.color || "").toLowerCase();
  const id = (nodeId || "").toLowerCase();

  if (geomKind === "oled_panel" || id === "face") return "oled_glass";
  if (geomKind === "solar_panel" || id.startsWith("solar")) return "solar_cell";
  if (geomKind === "wire_frame" || id === "frame") return "brass";
  if (geomKind === "tube" || id.includes("tube")) return "copper";
  if (geomKind === "disk" || id === "base") return "bamboo";
  if (geomKind === "cell_16340" || id === "battery") return "battery_body";
  if (geomKind === "touch_pad" || id === "touch") return "touch_pad";
  if (geomKind === "board" || id === "brain" || id === "charger") return "pcb_green";
  if (id === "sensor") return "sensor_body";
  if (id === "shell" || id === "body") return "plastic_hard";

  if (material.metalness != null && material.metalness > 0.7) {
    if (c.includes("b8") || c.includes("d4a") || c.includes("c9a")) return "brass";
    if (c.includes("b87") || c.includes("873")) return "copper";
  }
  if (c.includes("c4a") || c.includes("d4b") || c.includes("bamboo")) return "bamboo";

  return "generic";
}

/** Merge scene material color overrides onto preset (opacity applied at render). */
export function resolvePhysicalMaterial(
  geomKind: string,
  material: SceneMaterial,
  nodeId?: string,
  opacity = 1
): PhysicalMatProps & { transparent: boolean; opacity: number } {
  const presetId = inferMaterialPreset(geomKind, material, nodeId);
  const base = { ...getMaterialPreset(presetId) };
  // Allow explicit color override when not using strong metal presets
  if (material.color && presetId === "generic") {
    base.color = material.color;
  }
  if (material.emissive) base.emissive = material.emissive;
  if (material.emissiveIntensity != null) base.emissiveIntensity = material.emissiveIntensity;
  if (material.metalness != null && presetId === "generic") base.metalness = material.metalness;
  if (material.roughness != null && presetId === "generic") base.roughness = material.roughness;

  return {
    ...base,
    transparent: opacity < 0.99,
    opacity,
  };
}

export const MATERIAL_PRESET_IDS = Object.keys(PRESETS) as MaterialPresetId[];
