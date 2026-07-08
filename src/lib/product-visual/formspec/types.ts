/** FormSpec — physical product look (authority for hero SVG). */

export const FORM_TEMPLATE_IDS = [
  "sat_clock",
  "weather_stick",
  "robot_chassis",
  "sensor_pod",
  "boxed_gadget",
  "breadboard",
] as const;

export type FormTemplateId = (typeof FORM_TEMPLATE_IDS)[number];

export type FormSource = "demo_golden" | "template_match" | "llm" | "fallback";
export type FormGrade = "high" | "medium" | "assumed";

export type FormMaterialBase = "bamboo" | "pla" | "acrylic" | "metal" | "unknown";
export type FormMaterialFrame = "brass" | "copper" | "pla" | "unknown";
export type FormMaterialFace = "oled" | "lcd" | "none";

export interface FormMaterials {
  base?: FormMaterialBase;
  frame?: FormMaterialFrame;
  face?: FormMaterialFace;
}

/**
 * Layer ids shared across templates (templates ignore unknown layers).
 * Maps to partIds that solidify that layer during assembly stages.
 */
export type FormLayerId =
  | "base"
  | "frame"
  | "face"
  | "brain"
  | "power"
  | "wings"
  | "sensor"
  | "touch"
  | "wheels"
  | "body"
  | "mast"
  | "shell";

/** User/LLM offset for a form layer (px in template space) */
export interface FormLayoutOffset {
  x: number;
  y: number;
  rot?: number;
}

export interface FormSpec {
  templateId: FormTemplateId;
  /** Composition knobs 0–2 (1 = default) */
  params: Record<string, number>;
  materials: FormMaterials;
  layers: Partial<Record<FormLayerId, string[]>>;
  /**
   * Optional per-layer position offsets (drag-to-edit).
   * Applied on top of template default anchors.
   */
  layout?: Partial<Record<FormLayerId, FormLayoutOffset>>;
  productCaption: string;
  source: FormSource;
  grade: FormGrade;
}

export type LayerPaint = "ghost" | "placed" | "highlight";
