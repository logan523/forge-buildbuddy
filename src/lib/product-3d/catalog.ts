/**
 * Electronics catalog — high-detail procedural parts + optional GLB URLs.
 * Sizes and mesh readiness come from RealPartSpec (real-parts.ts).
 * Drop real GLBs in public/models/parts/ and flip glbReady there.
 */
import type { SceneNode3D } from "./types";
import {
  REAL_PARTS,
  catalogDefaultSize,
  type CatalogPartId,
} from "./real-parts";
import { PART_MODELS, partModelFor } from "./part-models";

export type { CatalogPartId };

export interface CatalogEntry {
  id: CatalogPartId;
  label: string;
  /** Desired path under public/ once mesh is authored (OpenSCAD/FreeCAD) */
  assetUrl?: string;
  /**
   * Only attach assetUrl to scene nodes when true (file must exist under public/).
   * Prevents 404 GLB loads; flip after dropping FreeCAD/OpenSCAD exports.
   */
  assetReady?: boolean;
  /** mm default footprint — from RealPartSpec */
  defaultSize: { w: number; h: number; d: number };
  /** Geom kind override for parametric path */
  geomKind: SceneNode3D["geom"]["kind"];
  materialPreset: string;
}

function entryFromReal(id: CatalogPartId, label: string): CatalogEntry {
  const r = REAL_PARTS[id];
  return {
    id,
    label,
    assetUrl: r.mesh.glbUrl,
    assetReady: r.mesh.glbReady,
    defaultSize: catalogDefaultSize(r),
    geomKind: r.geomFallback,
    materialPreset: r.materialPreset,
  };
}

export const CATALOG: Record<CatalogPartId, CatalogEntry> = {
  esp32_c3: entryFromReal("esp32_c3", "ESP32-C3 SuperMini"),
  oled_096: entryFromReal("oled_096", '0.96" OLED'),
  tp4056: entryFromReal("tp4056", "TP4056"),
  cell_16340: entryFromReal("cell_16340", "16340 cell"),
  sht30: entryFromReal("sht30", "SHT30"),
  ttp223: entryFromReal("ttp223", "TTP223"),
  solar_cell: entryFromReal("solar_cell", "Solar module"),
  generic_pcb: entryFromReal("generic_pcb", "PCB"),
};

/**
 * Geometry kinds that are STRUCTURE, not electronics — spars, cages, stands,
 * panels, straps. They must never receive a catalog identity: since GLBs went
 * live, catalogId attaches a whole 3D body, so an overmatched structural node
 * renders as a phantom part (a wing SPAR on the "wings" layer became a full
 * solar panel — the floating "extra satellite" bug).
 */
const STRUCTURAL_KINDS = new Set<SceneNode3D["geom"]["kind"]>([
  "tube",
  "cylinder",
  "disk",
  "wire_cube_cage",
  "metal_stand",
  "battery_straps",
  "face_panel",
  "rear_panel",
  "shell_panel",
  "bamboo_base",
  "brass_frame",
  "wire_frame",
]);

/** Infer catalog id from node role / label. Structural geometry never matches. */
export function inferCatalogId(node: SceneNode3D): CatalogPartId | null {
  if (node.catalogId && node.catalogId in CATALOG) return node.catalogId as CatalogPartId;
  if (STRUCTURAL_KINDS.has(node.geom.kind)) return null;
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

/** Resolved GLB URL only when asset is marked ready (or node already has one). */
export function resolveCatalogAssetUrl(entry: CatalogEntry, nodeAssetUrl?: string): string | undefined {
  if (nodeAssetUrl) return nodeAssetUrl;
  if (entry.assetReady && entry.assetUrl) return entry.assetUrl;
  return undefined;
}

/** Stamp catalogId (+ optional ready assetUrl) onto nodes for renderer. */
export function applyCatalogHints(nodes: SceneNode3D[]): SceneNode3D[] {
  return nodes.map((n) => {
    const id = inferCatalogId(n);
    if (!id) return n;
    const entry = CATALOG[id];
    // OPEN model registry wins: any catalog id with a ready GLB resolves here,
    // independent of the closed union. Falls back to the real-parts asset (all
    // false today) so nothing regresses for parts without an open-registry model.
    const assetUrl = partModelFor(id)?.url ?? resolveCatalogAssetUrl(entry, n.assetUrl);
    return {
      ...n,
      catalogId: id,
      assetUrl,
      material: {
        ...n.material,
        preset: n.material.preset || entry.materialPreset,
      },
    };
  });
}

/**
 * Desired GLB paths (may not exist yet). See assets/scad/README.md for OpenSCAD/FreeCAD pipeline.
 */
export function catalogAssetPaths(): string[] {
  return Object.values(CATALOG)
    .map((e) => e.assetUrl)
    .filter((u): u is string => !!u);
}

/** Paths that are ready to load in the viewer (open registry is the authority). */
export function readyCatalogAssetPaths(): string[] {
  const fromModels = Object.values(PART_MODELS)
    .filter((m) => m.glbReady)
    .map((m) => m.url);
  const fromCatalog = Object.values(CATALOG)
    .filter((e) => e.assetReady && e.assetUrl)
    .map((e) => e.assetUrl!);
  return Array.from(new Set([...fromModels, ...fromCatalog]));
}
