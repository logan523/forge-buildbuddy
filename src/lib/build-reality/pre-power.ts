/**
 * The soft pre-power gate (Slice 3, A5 + design D2 + eng E12/E13). The
 * ritual that makes power-on safe — a filling checklist of reassurances,
 * NEVER a locked door. Electrically fail-closed (unknown ≠ safe, audit row
 * 18) but emotionally open: the override is explicit, demoted, honest, and
 * logged. Framing rule: this check exists so nothing gets hot — the copy
 * protects, never gatekeeps, and raw net names never reach the builder.
 */

import type { BuildPlan } from "@/lib/types";
import type { BenchCapability } from "@/lib/capability";
import type { BreadboardVerdict } from "@/lib/breadboard/erc";
import { buildActionCursor } from "@/lib/actions/cursor";
import type { BuildReality } from "./types";
import { MAX_EVENTS } from "./types";

export interface GateRow {
  id: string;
  label: string;
  state: "pass" | "pending" | "unknown" | "unavailable";
  detail: string;
}

export interface PrePowerVerdict {
  /** safe = all rows pass · almost = pendings/unknowns remain · blocked = a real violation. */
  status: "safe" | "almost" | "blocked";
  rows: GateRow[];
  /** Named reasons when blocked — already human-labeled, never raw net names. */
  blockers: string[];
}

export function prePowerGate(
  plan: BuildPlan,
  reality: BuildReality | undefined,
  capability: BenchCapability,
  breadboardVerdict?: BreadboardVerdict
): PrePowerVerdict {
  const rows: GateRow[] = [];
  const blockers: string[] = [];

  // Not hydrated is UNKNOWN, never clean (eng E1).
  if (reality === undefined) {
    return {
      status: "almost",
      rows: [
        {
          id: "hydrate",
          label: "Loading your build record",
          state: "unknown",
          detail: "One moment — checking what you've already done.",
        },
      ],
      blockers: [],
    };
  }

  // Row 1 — power & ground joints exist. Per-formFactor criteria (E13):
  // the SOFT gate accepts made (asserted) joints; the instrument tier is
  // shown as its own row, never demanded here.
  const cursor = buildActionCursor(plan, reality);
  const powerActions = cursor.actions.filter(
    (a) => a.connection.netClass === "power" || a.connection.netClass === "gnd"
  );
  const powerDone = powerActions.filter((a) => a.state === "made" || a.state === "verified");
  if (powerActions.length > 0) {
    const missing = powerActions.length - powerDone.length;
    rows.push({
      id: "power-joints",
      label: "Power and ground wires in place",
      state: missing === 0 ? "pass" : "pending",
      detail:
        missing === 0
          ? `All ${powerActions.length} power/ground connections marked done.`
          : `${missing} power/ground ${missing === 1 ? "wire isn't" : "wires aren't"} marked done yet — those are the ones that matter before power.`,
    });
    if (missing > 0) blockers.push("finish (or mark) the remaining power/ground wires");
  }

  // Row 2 — no shorts on the board (breadboard mode only).
  if (reality.formFactor === "breadboard") {
    if (!breadboardVerdict) {
      rows.push({
        id: "board-check",
        label: "No shorts on the breadboard",
        state: "unknown",
        detail: "Tell me where your wires are plugged in and I'll check the board's hidden connections.",
      });
      blockers.push("declare your breadboard positions so the short-check can run");
    } else if (breadboardVerdict.status === "blocked") {
      rows.push({
        id: "board-check",
        label: "No shorts on the breadboard",
        state: "pending",
        detail: breadboardVerdict.violations[0]?.title ?? "The board is joining wires that must stay separate.",
      });
      blockers.push(...breadboardVerdict.violations.map((v) => v.title));
    } else if (breadboardVerdict.status === "unknown") {
      rows.push({
        id: "board-check",
        label: "No shorts on the breadboard",
        state: "unknown",
        detail: `${breadboardVerdict.unknowns.length} wire position${breadboardVerdict.unknowns.length === 1 ? "" : "s"} not declared yet — unknown is never assumed safe.`,
      });
      blockers.push("declare the remaining wire positions");
    } else {
      rows.push({
        id: "board-check",
        label: "No shorts on the breadboard",
        state: "pass",
        detail: "Every declared position checks out — nothing the board secretly joins should be separate.",
      });
    }
  }

  // Row 3 — the live check: instrument evidence, capability-conditional.
  // NEVER a wall: unavailable is informative, not blocking (design 3d).
  if (capability.webSerial) {
    rows.push({
      id: "live-check",
      label: "Devices answered live",
      state: cursor.verifiedCount > 0 ? "pass" : "pending",
      detail:
        cursor.verifiedCount > 0
          ? `${cursor.verifiedCount} connection${cursor.verifiedCount === 1 ? "" : "s"} proven by the board itself.`
          : "Optional but golden: open Live check with the board plugged in — devices answering is the strongest proof there is.",
    });
  } else {
    rows.push({
      id: "live-check",
      label: "Devices answered live",
      state: "unavailable",
      detail: "Not possible in this browser — use desktop Chrome/Edge for the live check. Tug checks still count.",
    });
  }

  const hasBlockers = blockers.length > 0;
  const status: PrePowerVerdict["status"] =
    breadboardVerdict?.status === "blocked" ? "blocked" : hasBlockers ? "almost" : "safe";
  return { status, rows, blockers };
}

/** The explicit, demoted, honest override — logged forever (eng E12). */
export function acknowledgeOverride(reality: BuildReality, reason: string, now = new Date().toISOString()): BuildReality {
  const events = [...reality.events, { at: now, kind: "gate-override" as const, detail: reason }];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return { ...reality, revision: reality.revision + 1, events, updatedAt: now };
}
