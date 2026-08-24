/**
 * The action cursor (Slice 3, A1 — wiring-scoped). ONE monotonic, build-wide
 * ordered list of wiring actions with ONE position: the answer to the
 * transcript's most-repeated question, "which do I pick up next / i did GND
 * to G what next". Derived every time from compiled facts + BuildReality —
 * never stored, so it can't drift from either.
 *
 * Wiring-scoped on purpose (eng E11): prep/mechanical/software steps
 * decompose by authored content, not derivation — the deterministic claim
 * only holds for the netlist. Chapters (steps) remain the navigation
 * skeleton; the cursor is the action-level truth inside them.
 *
 * Ordering: chapter order (step assignment), then safest-first inside a
 * chapter (gnd → power → i2c → signal — the same rank micro-steps use),
 * then stable by connection id. Property: every compiled wiring connection
 * appears EXACTLY once, and ordering never changes when reality updates —
 * only the cursor position moves.
 */

import type { BuildPlan, CompiledConnection, MicroStep } from "@/lib/types";
import type { BuildReality, JointState } from "@/lib/build-reality/types";

export interface CursorAction {
  /** Stable id = connection id. */
  id: string;
  stepNumber: number;
  stepTitle: string;
  micro: MicroStep | null;
  connection: CompiledConnection;
  /** Reality's current state for this joint (planned when undeclared). */
  state: JointState;
  /** True when reality holds instrument/assisted evidence for the joint. */
  verified: boolean;
  index: number;
  total: number;
}

export interface ActionCursor {
  actions: CursorAction[];
  /** First action not yet made/verified — the ONE next thing. Null when all done. */
  current: CursorAction | null;
  madeCount: number;
  verifiedCount: number;
}

const CLASS_RANK: Record<string, number> = { gnd: 0, power: 1, i2c: 2, spi: 3, uart: 3, analog: 4, digital: 4, signal: 4, other: 5, unknown: 5 };

export function buildActionCursor(plan: BuildPlan, reality?: BuildReality): ActionCursor {
  const rows: Omit<CursorAction, "index" | "total">[] = [];
  for (const step of plan.steps || []) {
    const conns = step.compiled?.connections ?? [];
    if (conns.length === 0) continue;
    const microById = new Map((step.compiled?.microSteps ?? []).map((m) => [m.id, m]));
    const sorted = [...conns].sort(
      (a, b) =>
        (CLASS_RANK[a.netClass] ?? 9) - (CLASS_RANK[b.netClass] ?? 9) || a.id.localeCompare(b.id)
    );
    for (const c of sorted) {
      const joint = reality?.joints[c.id];
      const state: JointState = joint?.state ?? "planned";
      rows.push({
        id: c.id,
        stepNumber: step.stepNumber,
        stepTitle: step.title,
        micro: microById.get(c.id) ?? null,
        connection: c,
        state,
        verified: state === "verified",
      });
    }
  }
  const actions = rows.map((r, i) => ({ ...r, index: i, total: rows.length }));
  const current = actions.find((a) => a.state !== "made" && a.state !== "verified" && a.state !== "removed") ?? null;
  return {
    actions,
    current,
    madeCount: actions.filter((a) => a.state === "made" || a.state === "verified").length,
    verifiedCount: actions.filter((a) => a.verified).length,
  };
}
