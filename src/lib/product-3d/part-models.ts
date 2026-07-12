/**
 * OPEN 3D-model registry — decoupled from the closed `CatalogPartId` union so
 * ANY project's part can carry a GLB without editing a union or a switch.
 *
 * `real-parts.ts` stays the authority for datasheet dimensions + pin positions.
 * This file is the authority for "is there a model, where, and how to fit it".
 *
 * Adding a part to the library = drop a GLB under public/models/parts/, add one
 * entry here keyed by the (normalized) catalog id, set `glbReady: true`. No other
 * code changes: applyCatalogHints resolves it, CatalogGlbUnderlay normalizes +
 * loads it, and any part with no entry falls back to the parametric mesh.
 */

export interface PartModel {
  /** GLB path under public/ (e.g. "/models/parts/esp32_c3.glb"). */
  url: string;
  /**
   * Only stamp onto scene nodes when true (the file must exist under public/).
   * Flip after the GLB is authored/vetted; false keeps the parametric fallback.
   */
  glbReady: boolean;
  /** Source units → scaled to mm on load. Most CAD is mm; some Sketchfab is m. */
  unit?: "mm" | "cm" | "m";
  /**
   * Extra rotation (degrees, XYZ) applied on load. Forge's part-local frame is
   * board-in-XY / component-side +Z. Most CAD exports Z-up → rotationDeg [-90,0,0].
   */
  rotationDeg?: [number, number, number];
  /**
   * Recenter the GLB to its bbox center at the node origin. Use for SOURCED
   * models whose origin is unknown (a corner, a datum). Leave false for models
   * authored in Forge's pin frame — recentering would slide the pins off.
   */
  centerToBbox?: boolean;
  /** Attribution / license, mirrored into public/models/parts/CREDITS.md. */
  credit?: string;
}

/**
 * Keyed by normalized catalog id (see normalizeModelId). Hyphen/underscore/case
 * all collapse, so the logical catalog's `esp32-c3` and real-parts' `esp32_c3`
 * resolve the same model.
 */
export const PART_MODELS: Record<string, PartModel> = {
  esp32_c3: {
    url: "/models/parts/esp32_c3.glb",
    glbReady: true,
    unit: "mm",
    // Authored in Forge's real-parts pin frame (board-in-XY, +Z up, board-center
    // origin) by scripts/author-esp32c3.mjs — identity normalization on purpose.
    centerToBbox: false,
    credit: "ESP32-C3 SuperMini — authored for Forge in three.js (scripts/author-esp32c3.mjs). CC0.",
  },
  oled_096: {
    url: "/models/parts/oled_096.glb",
    glbReady: true,
    unit: "mm",
    // Module BODY only (blue PCB, black glass, 4-pin header) authored in the
    // real-parts frame; the live SSD1306 clock is overlaid by the renderer, so
    // the animated screen survives on top of the real model.
    centerToBbox: false,
    credit: "0.96\" SSD1306 OLED module — authored for Forge in three.js (scripts/author-oled096.mjs). CC0.",
  },
};

/** Collapse hyphen/underscore/case so `esp32-c3` and `esp32_c3` are one key. */
export function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Source unit → millimetre scale factor. */
export function unitToMm(unit?: PartModel["unit"]): number {
  switch (unit) {
    case "m":
      return 1000;
    case "cm":
      return 10;
    default:
      return 1; // mm
  }
}

/** Resolve a ready model for a catalog id (hyphen or underscore), else null. */
export function partModelFor(catalogId?: string | null): PartModel | null {
  if (!catalogId) return null;
  const m = PART_MODELS[normalizeModelId(catalogId)];
  return m && m.glbReady ? m : null;
}
