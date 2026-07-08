/**
 * Electronics catalog — high-detail procedural parts + optional GLB URLs.
 * Drop real files in public/models/parts/ and register assetUrl; otherwise parametric catalog meshes render.
 */
import type { SceneNode3D } from "./types";

export type CatalogPartId =
  | "esp32_c3"
  | "oled_096"
  | "tp4056"
  | "cell_16340"
  | "sht30"
  | "ttp223"
  | "solar_cell"
  | "generic_pcb";

export interface CatalogEntry {
  id: CatalogPartId;
  label: string;
  /** Optional real GLB under public/ */
  assetUrl?: string;
  /** mm default footprint */
  defaultSize: { w: number; h: number; d: number };
  /** Geom kind override for parametric path */
  geomKind: SceneNode3D["geom"]["kind"];
  materialPreset: string;
}

export const CATALOG: Record<CatalogPartId, CatalogEntry> = {
  esp32_c3: {
    id: "esp32_c3",
    label: "ESP32-C3",
    assetUrl: "/models/parts/esp32_c3.glb",
    defaultSize: { w: 32, h: 22, d: 3.5 },
    geomKind: "pcb_module",
    materialPreset: "pcb_green",
  },
  oled_096: {
    id: "oled_096",
    label: '0.96" OLED',
    assetUrl: "/models/parts/oled_096.glb",
    defaultSize: { w: 28, h: 28, d: 4 },
    geomKind: "oled_module",
    materialPreset: "oled_glass",
  },
  tp4056: {
    id: "tp4056",
    label: "TP4056",
    assetUrl: "/models/parts/tp4056.glb",
    defaultSize: { w: 26, h: 18, d: 2.5 },
    geomKind: "pcb_module",
    materialPreset: "pcb_green",
  },
  cell_16340: {
    id: "cell_16340",
    label: "16340 cell",
    assetUrl: "/models/parts/cell_16340.glb",
    defaultSize: { w: 17, h: 34, d: 17 },
    geomKind: "cell_16340",
    materialPreset: "battery_body",
  },
  sht30: {
    id: "sht30",
    label: "SHT30",
    assetUrl: "/models/parts/sht30.glb",
    defaultSize: { w: 14, h: 12, d: 6 },
    geomKind: "box",
    materialPreset: "sensor_body",
  },
  ttp223: {
    id: "ttp223",
    label: "TTP223",
    assetUrl: "/models/parts/ttp223.glb",
    defaultSize: { w: 16, h: 3, d: 16 },
    geomKind: "touch_pad",
    materialPreset: "touch_pad",
  },
  solar_cell: {
    id: "solar_cell",
    label: "Solar module",
    assetUrl: "/models/parts/solar_cell.glb",
    defaultSize: { w: 48, h: 32, d: 3 },
    geomKind: "solar_module",
    materialPreset: "solar_cell",
  },
  generic_pcb: {
    id: "generic_pcb",
    label: "PCB",
    defaultSize: { w: 28, h: 18, d: 2 },
    geomKind: "pcb_module",
    materialPreset: "pcb_green",
  },
};

/** Infer catalog id from node role / label. */
export function inferCatalogId(node: SceneNode3D): CatalogPartId | null {
  if (node.catalogId && node.catalogId in CATALOG) return node.catalogId as CatalogPartId;
  const t = `${node.id} ${node.label} ${node.ref || ""}`.toLowerCase();
  if (node.id === "brain" || /esp|mcu|c3|xiao/.test(t)) return "esp32_c3";
  if (node.id === "face" || /oled|ssd1306|display/.test(t)) return "oled_096";
  if (node.id === "charger" || /tp4056|charg/.test(t)) return "tp4056";
  if (node.id === "battery" || /16340|li-ion|lipo|cell/.test(t)) return "cell_16340";
  if (node.id === "sensor" || /sht|bme|dht|temp/.test(t)) return "sht30";
  if (node.id === "touch" || /ttp|touch/.test(t)) return "ttp223";
  if (node.layer === "wings" || /solar/.test(t)) return "solar_cell";
  if (node.geom.kind === "pcb_module" || node.geom.kind === "board") return "generic_pcb";
  return null;
}

/** Stamp catalogId (+ optional assetUrl) onto nodes for renderer. */
export function applyCatalogHints(nodes: SceneNode3D[]): SceneNode3D[] {
  return nodes.map((n) => {
    const id = inferCatalogId(n);
    if (!id) return n;
    const entry = CATALOG[id];
    return {
      ...n,
      catalogId: id,
      assetUrl: n.assetUrl || entry.assetUrl,
      material: {
        ...n.material,
        preset: n.material.preset || entry.materialPreset,
      },
    };
  });
}

/**
 * Known missing GLBs — renderer uses parametric catalog mesh.
 * Real files: drop under public/models/parts/ matching assetUrl.
 */
export function catalogAssetPaths(): string[] {
  return Object.values(CATALOG)
    .map((e) => e.assetUrl)
    .filter((u): u is string => !!u);
}
