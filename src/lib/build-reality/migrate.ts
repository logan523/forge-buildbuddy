/**
 * Migration: legacy step-partitioned wirechecks → reality joints (eng E9).
 * Keys are `forge-wirechecks-<planId>-<stepNumber>` and planIds contain
 * dashes — so enumeration is prefix-scoped to a KNOWN planId, never split
 * on dashes. Checked ids that no longer match a compiled edge migrate as
 * ORPHANS (endpoints parsed best-effort from the id) — preserved, never
 * dropped. Legacy keys are left in place: the workbench still dual-writes
 * them for one version, so a downgrade keeps working.
 */

import type { CompiledConnection } from "@/lib/types";
import type { BuildReality } from "./types";
import { emptyReality, setJointState, sortEndpoints } from "./reality";

export function migrateWirechecks(
  planId: string,
  edges: CompiledConnection[],
  now = new Date().toISOString()
): BuildReality {
  let reality = emptyReality(planId, now);
  if (typeof localStorage === "undefined") return reality;

  const prefix = `forge-wirechecks-${planId}-`;
  const checkedIds = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    // The remainder must be the bare stepNumber — otherwise a planId that
    // extends this one with another dash segment ("<planId>-extra") would be
    // swept in (caught by the dashed-planId test).
    if (!/^\d+$/.test(key.slice(prefix.length))) continue;
    try {
      const ids = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") checkedIds.add(id);
    } catch {
      // Corrupt entry — skip it, keep the rest (quarantine, don't crash).
    }
  }
  if (checkedIds.size === 0) return reality;

  const byId = new Map(edges.map((e) => [e.id, e]));
  for (const id of checkedIds) {
    const edge = byId.get(id);
    if (edge) {
      reality = setJointState(
        reality,
        {
          connectionId: id,
          netName: edge.netName,
          netClass: edge.netClass,
          endpoints: sortEndpoints(
            { ref: edge.fromRef, pin: edge.fromPin },
            { ref: edge.toRef, pin: edge.toPin }
          ),
        },
        "made",
        undefined,
        now
      );
    } else {
      // Orphan: id format is `net:ref:pin` (compile.ts:79). Parse the spoke
      // endpoint; the hub end is unknown at migration time — recorded as the
      // net itself so the joint is preserved for later reconciliation.
      const parts = id.split(":");
      const pin = parts.pop() ?? "?";
      const ref = parts.pop() ?? "?";
      const netName = parts.join(":") || "?";
      reality = setJointState(
        reality,
        {
          connectionId: id,
          netName,
          netClass: "other",
          endpoints: sortEndpoints({ ref, pin }, { ref: `net:${netName}`, pin: "*" }),
        },
        "made",
        undefined,
        now
      );
    }
  }
  return {
    ...reality,
    events: [
      ...reality.events.slice(-10),
      { at: now, kind: "migrated", detail: `${checkedIds.size} legacy wirechecks → joints` },
    ],
  };
}
