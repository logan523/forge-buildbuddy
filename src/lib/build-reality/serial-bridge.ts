/**
 * Serial verdicts → reality evidence (Slice 3, V1/E10). A device answering
 * at its I2C address is INSTRUMENT-tier proof that every one of its joints
 * conducts — the one evidence source a camera-LLM can't fake. One found
 * device fans out to N joint-level `verified(i2c-scan)` writes.
 *
 * Monotonic within a session: a later "missing" (unplug, flap past
 * MISSING_AFTER_MS) never rolls verification back — only explicit removal
 * or a re-plan demotes (eng E10). Idempotent: re-applying the same verdicts
 * bumps nothing.
 *
 * Provenance: the join is ExpectedDevice.catalogId ↔ ElectricalComponent
 * .catalogId — exactly bus-proof.ts's proven-sound join. Only expected
 * devices write; unexpected addresses never touch reality.
 */

import type { BuildPlan } from "@/lib/types";
import type { DeviceVerdict } from "@/lib/serial/verify";
import type { BuildReality } from "./types";
import { setJointState, sortEndpoints } from "./reality";

export function applyDeviceVerdictsToReality(
  plan: BuildPlan,
  reality: BuildReality,
  verdicts: DeviceVerdict[],
  now = new Date().toISOString()
): BuildReality {
  const model = plan.electrical;
  if (!model) return reality;
  let r = reality;
  for (const v of verdicts) {
    if (v.status !== "found") continue; // monotonic — missing never demotes
    const comp = model.components.find((c) => c.catalogId && c.catalogId === v.device.catalogId);
    if (!comp) continue;
    for (const step of plan.steps || []) {
      for (const c of step.compiled?.connections ?? []) {
        if (c.fromRef !== comp.ref && c.toRef !== comp.ref) continue;
        const existing = r.joints[c.id];
        if (existing?.state === "verified") continue; // idempotent
        if (existing?.state === "removed" || existing?.state === "failed") continue;
        const joint = {
          connectionId: c.id,
          netName: c.netName,
          netClass: c.netClass,
          endpoints: sortEndpoints({ ref: c.fromRef, pin: c.fromPin }, { ref: c.toRef, pin: c.toPin }),
        };
        // The device answered, so the joint physically exists even if the
        // builder never tapped "made" — pass through made (the state machine
        // keeps planned→verified unreachable on purpose).
        if (!existing || existing.state === "planned" || existing.state === "placed") {
          r = setJointState(r, joint, "made", undefined, now);
        }
        r = setJointState(r, joint, "verified", { source: "i2c-scan" }, now);
      }
    }
  }
  return r;
}
