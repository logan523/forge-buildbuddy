/**
 * Agent skill packs — knowledge half of docs/FORGE-AGENTIC-EXPANSION.md.
 * Skills load on demand (MathWorks lesson: fewer skills = better triggers).
 */

import type { StepKind } from "@/lib/steps/classify";

export type SkillGroup =
  | "core-build"
  | "buses"
  | "power-safety"
  | "flash-serial"
  | "stage-3d"
  | "debug";

/** Tool names from the tools facade / serial surface the skill may use. */
export type SkillToolId =
  | "get_step_facts"
  | "compile_plan"
  | "run_erc"
  | "audit_step_render"
  | "audit_plan_harness"
  | "build_wire_plan"
  | "isolate_step"
  | "part_identity"
  | "diagnose"
  | "verify_expected_devices"
  | "flash_firmware"
  | "serial_connect";

export interface SkillTriggers {
  /** Match step kinds (wiring, software, …). */
  stepKinds?: StepKind[];
  /** Match connection netClass values (i2c, power, gnd, …). */
  netClasses?: string[];
  /** Match unstick symptom ids. */
  symptoms?: string[];
  /** Substring match against step title+description blob. */
  keywords?: string[];
  /** Always load for this plan templateId (e.g. sat_clock). */
  templateIds?: string[];
}

export interface Skill {
  id: string;
  name: string;
  group: SkillGroup;
  /** One-line job statement. */
  summary: string;
  /** Expert guidance the agent/UI may inject. Keep short — not a novel. */
  guidance: string;
  triggers: SkillTriggers;
  tools: SkillToolId[];
  /** Golden ids documented in skills/goldens.test.ts. */
  goldenIds: string[];
}

export interface SkillMatchContext {
  stepKind?: StepKind;
  netClasses?: string[];
  symptom?: string | null;
  stepBlob?: string;
  templateId?: string | null;
}
