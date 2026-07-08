export type HazardTag =
  | "LIPO"
  | "MAINS"
  | "ESD_SENSITIVE"
  | "HIGH_CURRENT"
  | "HEAT"
  | "SOLDERING"
  | "MOVING";

export interface LayerResult {
  layer: number;
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

export interface PrinciplesResult {
  functionalGoal: string;
  constraints: string[];
  risks: string[];
  simplicityNotes: string[];
}

export interface ExtractedPart {
  name: string;
  specification: string;
  quantity: number;
  notes?: string;
  confidence: "CERTAIN" | "IMPLIED" | "ASSUMED";
}

export interface ExtractResult {
  title: string;
  description: string;
  parts: ExtractedPart[];
  tools: { name: string; required: boolean }[];
  openQuestions: string[];
}

export interface GapResult {
  catalogHints: string[];
  missingSpecs: string[];
  blockers: string[];
  enrichedPartNotes: Record<string, string>;
}

export interface PipelineMeta {
  layers: LayerResult[];
  durationMs: number;
  hazardTags: HazardTag[];
  principles?: PrinciplesResult;
  mode: "six-layer" | "single-pass-fallback";
}
