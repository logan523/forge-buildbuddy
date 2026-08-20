/**
 * Compact bench digest for the Ask helper (post-MCP-deferral scope, 2026-08-21).
 * The cheap truth-aware "can we do it this way?" — the existing single-turn
 * /api/step-help gets the builder's DECLARED world so answers stop being
 * generic: their form factor, their colors, their proven joints, and any
 * live board-check conflicts. Hard-capped small (the route's guard budget
 * is 8KB total); never includes photos or raw ids.
 */

import type { BuildPlan } from "@/lib/types";
import { BOARD_SPECS, type BoardSpec } from "@/lib/breadboard/spec";
import { checkBreadboard } from "@/lib/breadboard/erc";
import type { BuildReality } from "./types";

export function realityDigest(plan: BuildPlan, reality: BuildReality | undefined): string | null {
  if (!reality) return null;
  const parts: string[] = [];

  if (reality.formFactor === "breadboard" && reality.breadboard) {
    const spec = BOARD_SPECS[reality.breadboard.boardId as BoardSpec["id"]];
    parts.push(`FORM: breadboard (${spec?.label ?? reality.breadboard.boardId}) — instructions use hole coordinates, not solder pads`);
    const decls = Object.values(reality.breadboard.declarations);
    if (decls.length > 0) {
      const verdict = checkBreadboard(spec ?? BOARD_SPECS["half-400"], reality.breadboard.declarations);
      parts.push(
        `BOARD: ${decls.length} position${decls.length === 1 ? "" : "s"} declared` +
          (verdict.violations.length
            ? `; LIVE CONFLICT: ${verdict.violations.map((v) => v.title).join("; ").slice(0, 160)}`
            : "; no conflicts detected")
      );
    }
  } else {
    parts.push(`FORM: ${reality.formFactor}`);
  }

  const colorEntries = Object.entries(reality.wireColors.byNet).slice(0, 8);
  if (colorEntries.length > 0) {
    parts.push(
      "THEIR WIRE COLORS (already reflected in the connections list): " +
        colorEntries.map(([net, d]) => `${net.toUpperCase()}=${d.label ?? d.name}`).join(", ")
    );
  }

  const joints = Object.values(reality.joints).filter((j) => j.state !== "removed");
  if (joints.length > 0) {
    const made = joints.filter((j) => j.state === "made" || j.state === "verified").length;
    const proven = joints.filter((j) => j.state === "verified" && j.evidence?.tier === "instrument").length;
    const provenNets = [
      ...new Set(
        joints
          .filter((j) => j.state === "verified" && j.evidence?.tier === "instrument")
          .map((j) => j.netName.toUpperCase())
      ),
    ].slice(0, 6);
    parts.push(
      `PROGRESS: ${made} joint${made === 1 ? "" : "s"} made, ${proven} proven live by the board` +
        (provenNets.length ? ` (nets ${provenNets.join(", ")} answered — those wires are proven good)` : "")
    );
  }

  if (parts.length === 0) return null;
  return parts.join("\n").slice(0, 800);
}
