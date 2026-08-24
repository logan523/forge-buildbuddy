/**
 * Export/import — the insurance policy for the no-accounts decision (CEO
 * voice finding 3): a 12-day physical build's record cannot be regenerable
 * only from evictable browser storage. Photo-free by construction at
 * schemaVersion 1. Import validates loudly and DEMOTES evidence (eng E7):
 * a JSON file must never counterfeit an instrument-tier gate pass.
 */

import type { BuildReality } from "./types";
import { EVIDENCE_TIER, REALITY_SCHEMA_VERSION } from "./types";

export interface RealityImportError {
  ok: false;
  code: "bad-json" | "bad-shape" | "wrong-plan" | "newer-schema";
  problem: string;
  fix: string;
}
export interface RealityImportOk {
  ok: true;
  reality: BuildReality;
  demotedEvidence: number;
}

export function exportReality(reality: BuildReality): string {
  return JSON.stringify(reality, null, 2);
}

export function importReality(json: string, expectedPlanId: string): RealityImportOk | RealityImportError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, code: "bad-json", problem: "That file isn't valid JSON.", fix: "Re-export from the build screen and try again." };
  }
  const r = parsed as BuildReality;
  if (!r || typeof r !== "object" || typeof r.planId !== "string" || !r.wireColors || !r.joints) {
    return { ok: false, code: "bad-shape", problem: "That file doesn't look like a build backup.", fix: "Use a file exported by Forge's 'export my build' button." };
  }
  if (typeof r.schemaVersion !== "number" || r.schemaVersion > REALITY_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "newer-schema",
      problem: `This backup is from a newer Forge (schema ${r.schemaVersion}).`,
      // Never partial-parse a newer reality — partial state at a safety gate
      // is worse than no state (DX X6).
      fix: "Update the app, then import again.",
    };
  }
  if (r.planId !== expectedPlanId) {
    return {
      ok: false,
      code: "wrong-plan",
      problem: `This backup is for a different build (${r.planId}).`,
      fix: `Open that build and import there, or export a backup of ${expectedPlanId}.`,
    };
  }
  let demoted = 0;
  const joints = Object.fromEntries(
    Object.entries(r.joints).map(([k, j]) => {
      if (j.state === "verified" && j.evidence) {
        demoted++;
        return [
          k,
          {
            ...j,
            state: "made" as const,
            evidence: { source: "imported" as const, tier: EVIDENCE_TIER.imported, at: j.evidence.at },
          },
        ];
      }
      return [k, j];
    })
  );
  return { ok: true, reality: { ...r, joints }, demotedEvidence: demoted };
}
