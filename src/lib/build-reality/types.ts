/**
 * BuildReality — the builder's world, as a first-class data model (Slice 2,
 * R1-minimal). The plan says what SHOULD exist; this records what DOES:
 * which joints are physically made, what the builder's actual wire colors
 * are, which real parts sit on the bench. The trust pipeline consumes it as
 * an explicit optional parameter (never an ambient read — eng row 15) and
 * the builder's observed facts outrank pedagogy (R2).
 *
 * Named "reality", not "ledger" — this repo already has a Conformance Ledger
 * (render↔netlist audit) and a friction ledger (rock counts); a third
 * "ledger" would collide (CEO audit row 17).
 */

export type FormFactor = "solder" | "breadboard" | "dupont";

export type JointState = "planned" | "placed" | "made" | "verified" | "failed" | "removed";

/** Evidence tiers (design-voice 5.9): instruments beat assistance beats say-so. */
export type EvidenceTier = "instrument" | "assisted" | "self-report";
export type EvidenceSource = "tug" | "continuity" | "voltage" | "photo" | "i2c-scan" | "imported";

export const EVIDENCE_TIER: Record<EvidenceSource, EvidenceTier> = {
  "i2c-scan": "instrument",
  continuity: "instrument",
  voltage: "instrument",
  photo: "assisted",
  tug: "self-report",
  // Imported evidence can never counterfeit a gate (eng E7) — it re-enters
  // as self-report no matter what tier it claimed in the exporting session.
  imported: "self-report",
};

export interface Endpoint {
  ref: string;
  pin: string;
}

/**
 * A physical joint. Identity is the UNORDERED endpoint pair + net identity —
 * never the hub-relative connection id alone, because pickHub is
 * member-order-dependent and a re-derive can flip from/to or re-pick the hub
 * (eng E2, settled before this schema shipped as the one-way door).
 * `endpoints` is stored sorted by `${ref}:${pin}` so equality is order-free.
 */
export interface JointRecord {
  /** The compiled connection id at declaration time (`net:ref:pin`) — a hint, not the identity. */
  connectionId: string;
  netName: string;
  netClass: string;
  endpoints: [Endpoint, Endpoint];
  state: JointState;
  evidence?: { source: EvidenceSource; tier: EvidenceTier; at: string };
  at: string;
}

export interface WireColorDecl {
  hex: string;
  /** Short name for prose ("brown"). */
  name: string;
  /** The builder's own words ("the short orange one") — prose prefers it when present. */
  label?: string;
  at: string;
}

export interface ActualPart {
  planPartId: string;
  catalogId?: string;
  name: string;
  silkscreenText?: string[];
  visiblePins?: string[];
  note?: string;
  at: string;
}

export interface RealityEvent {
  at: string;
  kind:
    | "color-declared"
    | "color-cleared"
    | "joint-state"
    | "part-recorded"
    | "form-factor"
    | "imported"
    | "migrated"
    | "gate-override";
  detail: string;
}

export interface BuildReality {
  schemaVersion: 1;
  planId: string;
  /**
   * Monotonic revision counter — bumps on every mutation. Recompile
   * memoization keys on this, never on content hashes (eng E6: plans embed
   * ~1MB firmware source; a hash per keystroke is waste and a stale-hash bug
   * is invisible).
   */
  revision: number;
  formFactor: FormFactor;
  /** Keyed by connectionId (hint key); identity checks go through endpoints. */
  joints: Record<string, JointRecord>;
  wireColors: {
    byConnection: Record<string, WireColorDecl>;
    /** "GND is brown" is a NET-level statement — the transcript's own shape. */
    byNet: Record<string, WireColorDecl>;
  };
  actualParts: Record<string, ActualPart>;
  /** Breadboard mode state — which board, and where the builder says things are plugged in. */
  breadboard?: {
    boardId: string;
    declarations: import("../breadboard/declarations").Declarations;
  };
  /** Slim append-only history (capped) — the correction trail ("D14 sorry"). */
  events: RealityEvent[];
  updatedAt: string;
}

export const REALITY_SCHEMA_VERSION = 1 as const;
/** Events kept per reality — enough for a correction trail, not a log store. */
export const MAX_EVENTS = 200;
