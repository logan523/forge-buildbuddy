export type MatchConfidence = "high" | "medium" | "low" | "none";

export type Vendor = "amazon" | "aliexpress" | "digikey" | "mouser" | "lcsc" | "other";
export type OfferKind = "product" | "search";
export type PriceSource = "catalog" | "live" | "unknown";

export interface Part {
  id: string;
  name: string;
  specification: string;
  quantity: number;
  notes?: string;
  shoppingLinks?: ShoppingLink[];
  /** Bound module from modules-catalog.json */
  catalogId?: string;
  matchConfidence?: MatchConfidence;
  footguns?: string[];
  /** Estimated unit price (USD) — catalog band or live quote */
  unitPriceMin?: number;
  unitPriceMax?: number;
  priceSource?: PriceSource;
  preferredVendor?: Vendor;
  /** Frozen identity from catalog */
  manufacturer?: string;
  mpn?: string;
  lcscPart?: string;
  mpnVerifiedAt?: string;
  mpnNote?: string;
  /** Designator once electrical model assigns refs (U1, BT1…) */
  ref?: string;
}

/** Structured netlist member — principal-EE preferred over free-text wiring */
export interface StructuredNetMember {
  /** Component ref (U1) or part id until refs assigned */
  ref: string;
  pin: string;
  /** Optional human label */
  label?: string;
}

export interface StructuredNet {
  name: string;
  members: StructuredNetMember[];
  /** power | gnd | signal | i2c | unknown */
  netClass?: string;
  wireColor?: string;
}

export type SafetySeverity = "critical" | "warning" | "info";

export interface SafetyFinding {
  id: string;
  severity: SafetySeverity;
  title: string;
  detail: string;
  mitigation?: string;
}

export interface SafetyReport {
  findings: SafetyFinding[];
  hazardTags: string[];
  requiresAttention: boolean;
}

export interface ShoppingLink {
  vendor: Vendor;
  label: string;
  url: string;
  /** product = deep link / distributor page; search = search results */
  kind?: OfferKind;
  priceUsd?: number;
  priceMaxUsd?: number;
  currency?: string;
  inStock?: boolean;
  priceSource?: PriceSource;
  mpn?: string;
}

export interface CommonMistake {
  symptom: string;
  cause: string;
  fix: string;
}

export interface ToolTechnique {
  tool: string;
  usage: string;
  safety: string;
  mistake: string;
}

/** One micro-step a beginner can follow without re-reading a paragraph */
export interface StepAction {
  n: number;
  text: string;
  /** Optional short warning for this micro-step */
  caution?: string;
}

/**
 * A wiring connection DERIVED from the electrical netlist by the instruction
 * compiler (src/lib/steps/compile.ts) — never authored by the LLM. Pins are
 * silkscreen labels only (no physical positions: vendor pin order varies).
 * grade "consistent" = a 2-member net rendered as-is; "derived" = one leg of
 * a 3+-member net (star from a hub — physically may be daisy-chained).
 */
export interface CompiledConnection {
  netName: string;
  netClass: string;
  fromRef: string;
  fromPin: string;
  fromLabel: string;
  toRef: string;
  toPin: string;
  toLabel: string;
  colorHex: string;
  colorName: string;
  grade: "consistent" | "derived";
}

export interface CompiledCheck {
  kind: "multimeter" | "visual";
  instruction: string;
  expected: string;
}

/** Per-step derived facts — recomputed on every load, stripped before share/persist. */
export interface CompiledStepFacts {
  connections: CompiledConnection[];
  checks: CompiledCheck[];
}

export interface StepContentIssue {
  id:
    | "STEP_UNKNOWN_PIN"
    | "STEP_COLOR_MISMATCH"
    | "STEP_SAFETY_CONTRADICTION"
    | "STEP_NET_UNCOVERED";
  severity: "error" | "warning";
  stepNumber?: number;
  detail: string;
}

/** Plan-level compiler status — instruction-coverage channel, NOT the safety banner. */
export interface CompiledPlanFacts {
  status: "ok" | "failed" | "unavailable";
  unassigned: CompiledConnection[];
  issues: StepContentIssue[];
}

export interface BuildStep {
  stepNumber: number;
  title: string;
  description: string;
  /** One sentence for experienced builders (quick detail level) */
  quickSummary?: string;
  /** Beginner goal — one line, what this step achieves */
  goal?: string;
  /** Parts/tools to grab before starting */
  youNeed?: string[];
  /** Numbered micro-actions (IKEA-style checklist) */
  actions?: StepAction[];
  /** Success criteria — preferred over afterState for UI */
  doneWhen?: string;
  /** Plain-English explanation of why this technique/pin is used */
  whyThisWorks?: string;
  /** What should be on the bench before starting */
  beforeState?: string;
  /** What success looks like when the step is done */
  afterState?: string;
  commonMistakes?: CommonMistake[];
  toolTechnique?: ToolTechnique;
  verification?: {
    description: string;
    expectedOutput?: string;
  };
  safetyNotes?: string[];
  /** Optional step result photo (local or CDN) */
  photoUrl?: string;
  /**
   * Action diagram kind (oled_desolder, i2c_wiring, …).
   * When omitted, inferred from title/description.
   */
  mediaKind?: import("./step-media/types").StepMediaKind;
  /** Derived by the instruction compiler on load — never serialized. */
  compiled?: CompiledStepFacts;
}

export interface WiringConnection {
  from: string;
  to: string;
  wireColor?: string;
}

export interface BuildPlan {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedTime: string;
  estimatedCost: string;
  parts: Part[];
  tools: { name: string; required: boolean }[];
  steps: BuildStep[];
  wiringConnections: WiringConnection[];
  /**
   * Preferred electrical connectivity (LLM or derived).
   * When present, ERC/netlist prefer this over free-text wiringConnections.
   */
  structuredNets?: StructuredNet[];
  /** Instruction-compiler status + coverage issues. Derived; never serialized. */
  compiledFacts?: CompiledPlanFacts;
  /**
   * Physical product look (FormSpec) — hero SVG authority.
   * Resolved from demo golden, template match, or LLM.
   */
  formSpec?: import("./product-visual/formspec/types").FormSpec;
  /**
   * Optional 3D pose overrides (mm / rad). Keys = node id or FormLayerId.
   * Values may include absolute position/rotation or additive `delta` (see PoseHint).
   * From LLM enrichment, share payload, or user edit export.
   * Applied on top of parametric ProductScene3D template.
   */
  scenePoses?: import("./product-3d/enrich-poses").PoseHintMap;
  /**
   * Optional AI/external beauty mesh (GLB). DISPLAY ONLY — never product authority.
   * Layers / FormSpec / ProductScene3D remain the real model.
   */
  beautyMesh?: import("./product-3d/beauty-mesh").BeautyMeshSpec;
  warnings: string[];
  sourceUrl?: string;
  generatedAt?: string;
  /** Hardcoded post-LLM safety analysis */
  safetyReport?: SafetyReport;
  hazardTags?: string[];
  /** Roll-up BOM estimate after buy enrichment */
  bomEstimate?: {
    totalMin: number;
    totalMax: number;
    currency: string;
    pricedCount: number;
    unpricedCount: number;
  };
  /**
   * Formal electrical model + ERC (principal-EE authority).
   * Built deterministically from parts + wiringConnections.
   */
  electrical?: import("./electrical/types").ElectricalModel;
  /** Set by 6-layer (or fallback) analyze pipeline */
  pipelineMeta?: {
    layers: { layer: number; name: string; ok: boolean; durationMs: number; detail?: string }[];
    durationMs: number;
    hazardTags: string[];
    mode: "six-layer" | "single-pass-fallback";
    principles?: {
      functionalGoal: string;
      constraints: string[];
      risks: string[];
      simplicityNotes: string[];
    };
  };
}
