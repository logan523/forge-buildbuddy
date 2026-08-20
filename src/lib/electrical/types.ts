/**
 * Principal-EE electrical model for Forge.
 *
 * Authority chain:
 *   catalog pin roles + wiringConnections
 *     → ElectricalModel (components, pins, nets)
 *       → ERC (errors/warnings)
 *         → gates for power-on, PCB export, kit publish
 *
 * Trust grades (claim hygiene):
 *   verified | derived | assumed
 */

export type TrustGrade = "verified" | "derived" | "assumed";

/** Simplified pin electrical roles (KiCad-inspired, hobby-scale). */
export type PinRole =
  | "power"
  | "gnd"
  | "digital_io"
  | "digital_in"
  | "digital_out"
  | "i2c_sda"
  | "i2c_scl"
  | "analog"
  | "passive"
  | "unknown";

export type NetClass = "power" | "gnd" | "signal" | "i2c" | "unknown";

export type ErcSeverity = "error" | "warning" | "info";

export interface ElectricalPin {
  name: string;
  role: PinRole;
  /** Absolute max or recommended rail voltage for this pin (V), if known */
  maxVoltage?: number;
  /** Typical operating voltage domain */
  domainV?: number;
}

export interface ElectricalComponent {
  ref: string;
  partId: string;
  name: string;
  catalogId?: string;
  matchConfidence?: string;
  /** How we know this component's pinout */
  pinoutGrade: TrustGrade;
  pins: ElectricalPin[];
  isLithiumCell?: boolean;
  providesChargeProtection?: boolean;
  logicVoltage?: number | null;
  maxIOVoltage?: number | null;
}

export interface NetMember {
  ref: string;
  pin: string;
  role: PinRole;
  domainV?: number;
  maxVoltage?: number;
}

export interface ElectricalNet {
  name: string;
  netClass: NetClass;
  members: NetMember[];
  /** How the net was named/classified */
  grade: TrustGrade;
  /**
   * Reality-resolved display color, stamped ONCE by applyTrustPipeline when
   * the builder has declared wire colors (R2 / eng E3). Every renderer reads
   * the stamp with a canonical `netColorFor` fallback — colors are resolved
   * in exactly one place, so surfaces can never disagree. Absent on plans
   * with no declarations (keeps no-reality output byte-identical).
   */
  displayColorHex?: string;
  displayColorName?: string;
  displayColorLabel?: string;
  displayColorSource?: "user" | "authority";
  /** Per-member (`"ref:pin"`) color overrides — a single leg the builder recolored. */
  memberColorOverrides?: Record<string, { hex: string; name: string; label?: string }>;
}

export interface ErcViolation {
  id: string;
  severity: ErcSeverity;
  rule: string;
  title: string;
  detail: string;
  mitigation: string;
  /** Nets / refs involved */
  refs?: string[];
  nets?: string[];
}

export interface ErcReport {
  errors: ErcViolation[];
  warnings: ErcViolation[];
  infos: ErcViolation[];
  /** True if any error — blocks PCB export & power-on without ack */
  clean: boolean;
  /** True if clean of errors (warnings OK) */
  canExportPcb: boolean;
  canPublishKit: boolean;
  summary: string;
}

export interface ElectricalModel {
  components: ElectricalComponent[];
  nets: ElectricalNet[];
  /** Unparsed wiring edges that could not be bound to refs */
  unboundEdges: { from: string; to: string; reason: string }[];
  erc: ErcReport;
  builtAt: string;
}
