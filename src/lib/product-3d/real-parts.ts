/**
 * Real-parts dimension authority — datasheet / vendor mm, not cage ratios.
 * Scene layout, catalog defaults, and sat-pins all derive from here.
 *
 * Units: 1 scene unit = 1 mm. GLB underlays (when ready) must match.
 * See docs/PRODUCT-3D-REAL-PARTS.md for SKU lock + citations.
 */
import type { GeomKind } from "./types";

/** Stable part ids shared with catalog / scene.nodes.catalogId */
export type CatalogPartId =
  | "esp32_c3"
  | "oled_096"
  | "tp4056"
  | "cell_16340"
  | "sht30"
  | "ttp223"
  | "solar_cell"
  | "generic_pcb";

export type Vec3Mm = [number, number, number];

export interface RealPin {
  name: string;
  /** Part-local mm (origin = part center; Z up from board face when flat) */
  local: Vec3Mm;
  netColor?: string;
  /**
   * Colocalized name for harness/recipe (e.g. SDA at the same pad as GPIO4).
   * Mesh pin stubs skip aliases so the board isn't double-stacked.
   */
  alias?: boolean;
}

export interface RealPartSpec {
  id: CatalogPartId;
  mpnOrSku: string;
  /** Citation / source class (URL or standard id) */
  source: string;
  /**
   * Bounding box mm.
   * Boards: l = long edge (X), w = short edge (Y), h = thickness (Z).
   * Cell: l = length (axis), w = diameter, h = diameter.
   */
  bboxMm: { l: number; w: number; h: number };
  pins: RealPin[];
  mesh: {
    glbUrl?: string;
    glbReady: boolean;
    scadOrDoc?: string;
  };
  materialPreset: string;
  geomFallback: GeomKind;
}

/** Craft clearances used when sizing the brass cage from contents. */
export const LIFE_LAYOUT = {
  /** Extra mm around cell / boards inside cage */
  cageClearanceMm: 7,
  /** Minimum craft cage edge even if parts are tiny */
  minCageEdgeMm: 46,
  /** Brass rod stock (craft wire / tube) */
  rodRadiusMm: 2.0,
  standStemHeightMm: 90,
  standFootRadiusMm: 18,
  standStemRadiusMm: 2.2,
  standFootHeightMm: 3.5,
} as const;

/**
 * Locked sat-line SKU set. One footprint per role — variants differ ±1–2 mm.
 */
export const REAL_PARTS: Record<CatalogPartId, RealPartSpec> = {
  esp32_c3: {
    id: "esp32_c3",
    mpnOrSku: "ESP32-C3 SuperMini",
    source:
      "https://mischianti.org/esp32-c3-super-mini-high-resolution-pinout-datasheet-and-specs/ (~22.5×18 board class)",
    bboxMm: { l: 22.5, w: 18, h: 3.2 },
    /**
     * Dual-header SuperMini silkscreen (USB at +Y). Left / right columns at
     * 2.54 mm pitch — GPIO4 and GPIO5 are DISTINCT pads so pin-focus / "show me"
     * lands on the letter the builder reads, not a single abstract GPIO blob.
     * SDA/SCL are colocalized aliases (harness nets still resolve; mesh skips them).
     */
    pins: (() => {
      const lx = 22.5 / 2 - 1.0; // header inset from long edge
      const pitch = 2.54;
      const z = 1.6;
      // 8 pads/side: top (USB) → bottom. y = (3.5 - i) * pitch
      const yAt = (i: number) => (3.5 - i) * pitch;
      const L = (i: number): Vec3Mm => [-lx, yAt(i), z];
      const R = (i: number): Vec3Mm => [lx, yAt(i), z];
      const left: { name: string; i: number; netColor?: string }[] = [
        { name: "5V", i: 0, netColor: "#d97706" },
        { name: "GND", i: 1, netColor: "#1e293b" },
        { name: "3V3", i: 2, netColor: "#dc2626" },
        { name: "GPIO4", i: 3, netColor: "#2563eb" }, // often I2C SDA on this kit
        { name: "GPIO3", i: 4, netColor: "#0891b2" },
        { name: "GPIO2", i: 5, netColor: "#0891b2" },
        { name: "GPIO1", i: 6, netColor: "#0891b2" },
        { name: "GPIO0", i: 7, netColor: "#0891b2" },
      ];
      const right: { name: string; i: number; netColor?: string }[] = [
        { name: "GPIO5", i: 0, netColor: "#eab308" }, // often I2C SCL on this kit
        { name: "GPIO6", i: 1, netColor: "#0891b2" },
        { name: "GPIO7", i: 2, netColor: "#0891b2" },
        { name: "GPIO8", i: 3, netColor: "#0891b2" },
        { name: "GPIO9", i: 4, netColor: "#0891b2" },
        { name: "GPIO10", i: 5, netColor: "#0891b2" },
        { name: "GPIO20", i: 6, netColor: "#0891b2" },
        { name: "GPIO21", i: 7, netColor: "#0891b2" },
      ];
      const pins: RealPin[] = [
        ...left.map((p) => ({ name: p.name, local: L(p.i), netColor: p.netColor })),
        ...right.map((p) => ({ name: p.name, local: R(p.i), netColor: p.netColor })),
      ];
      // Harness / recipe still use SDA & SCL names (electrical story). Same mm as GPIO4/5.
      const g4 = pins.find((p) => p.name === "GPIO4")!;
      const g5 = pins.find((p) => p.name === "GPIO5")!;
      pins.push(
        { name: "SDA", local: [...g4.local] as Vec3Mm, netColor: g4.netColor, alias: true },
        { name: "SCL", local: [...g5.local] as Vec3Mm, netColor: g5.netColor, alias: true },
        // Bare silkscreen numbers (many clones print "4" not "GPIO4")
        { name: "4", local: [...g4.local] as Vec3Mm, netColor: g4.netColor, alias: true },
        { name: "5", local: [...g5.local] as Vec3Mm, netColor: g5.netColor, alias: true }
      );
      return pins;
    })(),
    mesh: {
      glbUrl: "/models/parts/esp32_c3.glb",
      glbReady: false,
      scadOrDoc: "assets/scad/sat_pcb.scad",
    },
    materialPreset: "pcb_green",
    geomFallback: "pcb_module",
  },

  oled_096: {
    id: "oled_096",
    mpnOrSku: '0.96" SSD1306 OLED module',
    source: "Common 4-pin I2C module footprint ~27×27×~4 mm (active area ~21.7 mm class)",
    bboxMm: { l: 27, w: 27, h: 4 },
    pins: (() => {
      // 4-pin header along bottom edge of module PCB
      const y = -(27 / 2) + 1.2;
      const z = -1.5;
      const pitch = 2.54;
      return [
        { name: "VCC", local: [-pitch * 1.5, y, z] as Vec3Mm, netColor: "#dc2626" },
        { name: "GND", local: [-pitch * 0.5, y, z] as Vec3Mm, netColor: "#1e293b" },
        { name: "SCL", local: [pitch * 0.5, y, z] as Vec3Mm, netColor: "#2563eb" },
        { name: "SDA", local: [pitch * 1.5, y, z] as Vec3Mm, netColor: "#2563eb" },
      ];
    })(),
    mesh: {
      glbUrl: "/models/parts/oled_096.glb",
      glbReady: false,
      scadOrDoc: "assets/scad/sat_oled.scad",
    },
    materialPreset: "oled_glass",
    geomFallback: "oled_module",
  },

  tp4056: {
    id: "tp4056",
    mpnOrSku: "TP4056 micro-USB charge module",
    source: "Common Ali/module boards ~25×19×3–4 mm",
    bboxMm: { l: 25, w: 19, h: 3.5 },
    pins: (() => {
      const hx = 25 / 2 - 2.5;
      const hy = 19 / 2 - 2.5;
      const z = 1.2;
      return [
        { name: "B+", local: [hx, hy, z] as Vec3Mm, netColor: "#dc2626" },
        { name: "B-", local: [-hx, hy, z] as Vec3Mm, netColor: "#1e293b" },
        { name: "OUT+", local: [hx, -hy, z] as Vec3Mm, netColor: "#dc2626" },
        { name: "OUT-", local: [-hx, -hy, z] as Vec3Mm, netColor: "#1e293b" },
        { name: "IN+", local: [0, hy + 0.5, z] as Vec3Mm, netColor: "#d97706" },
        { name: "IN-", local: [0, -(hy + 0.5), z] as Vec3Mm, netColor: "#1e293b" },
      ];
    })(),
    mesh: {
      glbUrl: "/models/parts/tp4056.glb",
      glbReady: false,
      scadOrDoc: "assets/scad/sat_pcb.scad",
    },
    materialPreset: "pcb_green",
    geomFallback: "pcb_module",
  },

  cell_16340: {
    id: "cell_16340",
    mpnOrSku: "16340 / RCR123A Li-ion",
    source: "IEC-class 16340: Ø16.5 × ~34 mm",
    bboxMm: { l: 34, w: 16.5, h: 16.5 },
    pins: (() => {
      const half = 34 / 2; // ±17 terminal centers along cell axis (Y local before scene rot)
      return [
        { name: "+", local: [0, half - 0.2, 0] as Vec3Mm, netColor: "#dc2626" },
        { name: "-", local: [0, -(half - 0.2), 0] as Vec3Mm, netColor: "#1e293b" },
        { name: "body", local: [0, 0, 0] as Vec3Mm },
      ];
    })(),
    mesh: {
      glbUrl: "/models/parts/cell_16340.glb",
      glbReady: false,
      scadOrDoc: "assets/scad/sat_cell.scad",
    },
    materialPreset: "battery_body",
    geomFallback: "cell_16340",
  },

  sht30: {
    id: "sht30",
    mpnOrSku: "SHT3x breakout",
    source: "Typical small humidity breakout ~16×16×3 mm (lock one SKU)",
    bboxMm: { l: 16, w: 16, h: 3 },
    pins: [
      { name: "VCC", local: [0, 5, 1.5], netColor: "#dc2626" },
      { name: "GND", local: [0, -5, 1.5], netColor: "#1e293b" },
      { name: "SDA", local: [5, 0, 1.5], netColor: "#2563eb" },
    ],
    mesh: {
      glbUrl: "/models/parts/sht30.glb",
      glbReady: false,
    },
    materialPreset: "sensor_body",
    geomFallback: "pcb_module",
  },

  ttp223: {
    id: "ttp223",
    mpnOrSku: "TTP223 capacitive touch module",
    source: "Common touch module board ~15×11×~3 mm",
    bboxMm: { l: 15, w: 11, h: 3 },
    pins: [
      { name: "SIG", local: [0, -3.5, 0.8], netColor: "#0891b2" },
      { name: "VCC", local: [4, -3.5, 0.8], netColor: "#dc2626" },
      { name: "GND", local: [-4, -3.5, 0.8], netColor: "#1e293b" },
    ],
    mesh: {
      glbUrl: "/models/parts/ttp223.glb",
      glbReady: false,
    },
    materialPreset: "touch_pad",
    geomFallback: "touch_pad",
  },

  solar_cell: {
    id: "solar_cell",
    mpnOrSku: "Craft epoxy solar panel 60×45",
    source: "Locked craft SKU 60×45×~3 mm (not cage-proportional wings)",
    bboxMm: { l: 60, w: 45, h: 3 },
    pins: [
      // Root edge toward cage; solar-l uses +X, solar-r mirrored in sat-pins
      { name: "+", local: [28, 0, 0.8], netColor: "#d97706" },
      { name: "-", local: [28, -8, 0.8], netColor: "#1e293b" },
      { name: "root", local: [30, 0, 0] },
    ],
    mesh: {
      glbUrl: "/models/parts/solar_cell.glb",
      glbReady: false,
      scadOrDoc: "assets/scad/sat_pcb.scad",
    },
    materialPreset: "solar_cell",
    geomFallback: "solar_module",
  },

  generic_pcb: {
    id: "generic_pcb",
    mpnOrSku: "Generic PCB",
    source: "Fallback only",
    bboxMm: { l: 28, w: 18, h: 2 },
    pins: [],
    mesh: { glbReady: false },
    materialPreset: "pcb_green",
    geomFallback: "pcb_module",
  },
};

export function getRealPart(id: CatalogPartId): RealPartSpec {
  return REAL_PARTS[id];
}

/** Cell radius (half of diameter bbox.w). */
export function cellRadiusMm(spec: RealPartSpec = REAL_PARTS.cell_16340): number {
  return spec.bboxMm.w / 2;
}

/** Cell length along axis. */
export function cellLengthMm(spec: RealPartSpec = REAL_PARTS.cell_16340): number {
  return spec.bboxMm.l;
}

/**
 * Craft cage edge from real parts (mm).
 * Fits horizontal 16340 + clearance; never drives electronics sizes.
 */
export function deriveCageEdgeMm(
  parts: Pick<RealPartSpec, "bboxMm">[] = [
    REAL_PARTS.cell_16340,
    REAL_PARTS.esp32_c3,
    REAL_PARTS.oled_096,
  ]
): number {
  const clear = LIFE_LAYOUT.cageClearanceMm;
  const cell = REAL_PARTS.cell_16340;
  const fromCell = Math.max(cell.bboxMm.l + clear * 2, cell.bboxMm.w + clear * 2);
  const fromBoards = Math.max(...parts.map((p) => Math.max(p.bboxMm.l, p.bboxMm.w) + clear));
  return Math.max(LIFE_LAYOUT.minCageEdgeMm, fromCell, fromBoards);
}

/** Geom params for flat board modules (width × height × depth). */
export function boardGeomParams(spec: RealPartSpec): {
  width: number;
  height: number;
  depth: number;
} {
  return {
    width: spec.bboxMm.l,
    height: spec.bboxMm.w,
    depth: spec.bboxMm.h,
  };
}

/** Geom params for 16340 cell (cylinder radius + height). */
export function cellGeomParams(spec: RealPartSpec = REAL_PARTS.cell_16340): {
  radius: number;
  height: number;
} {
  return {
    radius: cellRadiusMm(spec),
    height: cellLengthMm(spec),
  };
}

/** Solar panel geom (width × height × depth). */
export function solarGeomParams(spec: RealPartSpec = REAL_PARTS.solar_cell): {
  width: number;
  height: number;
  depth: number;
  cells: number;
} {
  return {
    width: spec.bboxMm.l,
    height: spec.bboxMm.w,
    depth: spec.bboxMm.h,
    cells: 4,
  };
}

/** Catalog-facing defaultSize from RealPartSpec (w/h/d convention). */
export function catalogDefaultSize(spec: RealPartSpec): { w: number; h: number; d: number } {
  if (spec.id === "cell_16340") {
    return { w: spec.bboxMm.w, h: spec.bboxMm.l, d: spec.bboxMm.h };
  }
  return { w: spec.bboxMm.l, h: spec.bboxMm.w, d: spec.bboxMm.h };
}

/**
 * Map scene node id → RealPartSpec (sat_clock roles).
 */
export function realPartForNodeId(nodeId: string): RealPartSpec | null {
  switch (nodeId) {
    case "brain":
      return REAL_PARTS.esp32_c3;
    case "face":
      return REAL_PARTS.oled_096;
    case "charger":
      return REAL_PARTS.tp4056;
    case "battery":
      return REAL_PARTS.cell_16340;
    case "sensor":
      return REAL_PARTS.sht30;
    case "touch":
      return REAL_PARTS.ttp223;
    case "solar-l":
    case "solar-r":
      return REAL_PARTS.solar_cell;
    default:
      return null;
  }
}
