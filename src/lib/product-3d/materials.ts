/**
 * Matte technical material presets — the CAD/MATLAB look for parametric parts.
 *
 * Flat colors, roughness ≈ 1, metalness 0, no clearcoat/sheen/transmission:
 * form reads from silhouette + ink edge lines (parts-layer), not from glossy
 * highlights. Per-part color identity stays data (pcb green, brass, copper) —
 * only the photoreal response was removed.
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
  emissive?: string;
  emissiveIntensity?: number;
}

const PRESETS: Record<MaterialPresetId, PhysicalMatProps> = {
  bamboo: { color: "#c9a66b", metalness: 0, roughness: 0.95 },
  brass: { color: "#d4a84b", metalness: 0, roughness: 0.85 },
  copper: { color: "#c47a3a", metalness: 0, roughness: 0.85 },
  // The OLED face is the one surface allowed to read as emissive — it's a
  // display, and the screen content carries information, not decoration.
  oled_glass: {
    color: "#060c14",
    metalness: 0,
    roughness: 0.6,
    emissive: "#0a3d32",
    emissiveIntensity: 0.4,
  },
  oled_bezel: { color: "#121218", metalness: 0, roughness: 0.85 },
  pcb_green: { color: "#0f3d24", metalness: 0, roughness: 0.95 },
  solar_cell: { color: "#070b14", metalness: 0, roughness: 0.7 },
  solar_frame: { color: "#8b96a5", metalness: 0, roughness: 0.9 },
  plastic_soft: { color: "#c4b5fd", metalness: 0, roughness: 0.95 },
  plastic_hard: { color: "#d6d3d1", metalness: 0, roughness: 0.95 },
  battery_body: { color: "#1e293b", metalness: 0, roughness: 0.9 },
  sensor_body: { color: "#d1fae5", metalness: 0, roughness: 0.95 },
  touch_pad: { color: "#a78bfa", metalness: 0, roughness: 0.95 },
  generic: { color: "#94a3b8", metalness: 0, roughness: 0.95 },
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
  if (
    geomKind === "wire_frame" ||
    geomKind === "wire_cube_cage" ||
    geomKind === "brass_frame" ||
    id === "frame"
  )
    return "brass";
  if (geomKind === "pcb_module" || geomKind === "board") return "pcb_green";
  if (geomKind === "tube" || id.includes("tube")) return "copper";
  if (geomKind === "disk" || id === "base") return "bamboo";
  if (geomKind === "cell_16340" || id === "battery") return "battery_body";
  if (geomKind === "touch_pad" || id === "touch") return "touch_pad";
  if (geomKind === "board" || id === "brain" || id === "charger") return "pcb_green";
  if (id === "sensor") return "sensor_body";
  if (id === "shell" || id === "body") return "plastic_hard";

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
  // Allow explicit color override when not using strong identity presets
  if (material.color && presetId === "generic") {
    base.color = material.color;
  }
  if (material.emissive) base.emissive = material.emissive;
  if (material.emissiveIntensity != null) base.emissiveIntensity = material.emissiveIntensity;

  return {
    ...base,
    transparent: opacity < 0.99,
    opacity,
  };
}

export const MATERIAL_PRESET_IDS = Object.keys(PRESETS) as MaterialPresetId[];
