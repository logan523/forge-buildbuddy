/** Deterministic product assembly scene — schematic fidelity (not photoreal). */

export type ModuleRole =
  | "mcu"
  | "display"
  | "sensor"
  | "power"
  | "battery"
  | "input"
  | "solar"
  | "mech"
  | "other";

export type AssemblyMode = "full" | "reveal" | "explode" | "wire" | "verify";

export interface ProductNode {
  partId: string;
  ref?: string;
  role: ModuleRole;
  /** Beginner label */
  label: string;
  /** Expert: U2 · ESP32-C3 */
  techLabel: string;
  /** Emoji / short glyph for SVG text */
  glyph: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** First step (1-based) where this part is actively introduced; 0 = always in full product */
  appearsAtStep: number;
}

export interface ProductWire {
  id: string;
  fromPartId: string;
  toPartId: string;
  color: string;
  label?: string;
}

export interface AssemblyStage {
  /** 0 = prep / full end product */
  stepNumber: number;
  /**
   * Always the full BOM for end-product silhouette.
   * Non-placed parts render as ghosts so you always see what you’re building.
   */
  visiblePartIds: string[];
  /** Parts already “installed” through this step (solid) */
  placedPartIds: string[];
  /** Focus of the current step */
  highlightPartIds: string[];
  mode: AssemblyMode;
  caption: string;
  modulesInPlace: number;
  modulesTotal: number;
}

export interface ProductScene {
  id: string;
  title: string;
  bounds: { w: number; h: number };
  nodes: ProductNode[];
  wires: ProductWire[];
  stages: AssemblyStage[];
  estimatedTime?: string;
}

export interface ProductVisual {
  scene: ProductScene;
  /** Full product SVG (stage 0) — physical form, not block diagram */
  heroSvg: string;
  /** Detected form archetype (sat_clock, boxed, …) */
  form?: string;
  /** Resolved FormSpec (materials, layers, grade) */
  formSpec?: import("./formspec/types").FormSpec;
  /** SVG for a given step index (0-based) or prep */
  svgForStep: (stepIndex: number | "prep", showTech?: boolean) => string;
  stageForStep: (stepIndex: number | "prep") => AssemblyStage;
}
