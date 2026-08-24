/**
 * Breadboard ERC — the rules that catch the real build's near-fire from
 * coordinates alone (the A1/B1/C1/D1 short: four wires of four different
 * nets in one column = the board joins them all; power met ground and "the
 * ESP got super fucking hot").
 *
 * Contract (DX X5): a failed CHECK is not an error. This returns verdict
 * DATA — `blocked` with named violations, or `unknown` when declarations
 * are missing (fail-closed: unknown is NEVER clean; audit row 18), or
 * `clean`. Copy rules (design voice 3e): causal teaching in plain words,
 * never-blame framing — the board's hidden wiring did it, not the builder.
 */

import type { BoardSpec } from "./spec";
import { describeHole, holeNode } from "./spec";
import type { Declarations, HoleDeclaration } from "./declarations";

export interface BreadboardViolation {
  id: string;
  rule: "SHARED_COLUMN_SHORT" | "RAIL_MIXED_NETS" | "OPEN_ACROSS_GAP" | "OPEN_ACROSS_RAIL_BREAK";
  severity: "error" | "warning";
  title: string;
  /** Causal plain-words teaching — what the board secretly does and why it matters. */
  teach: string;
  /** One concrete action. */
  fix: string;
  holes: string[];
  nets: string[];
}

export interface BreadboardVerdict {
  status: "clean" | "blocked" | "unknown";
  violations: BreadboardViolation[];
  /** Declaration keys we still know nothing about — the reason `unknown` is never `clean`. */
  unknowns: string[];
}

export function checkBreadboard(
  spec: BoardSpec,
  decls: Declarations,
  expectedKeys: string[] = []
): BreadboardVerdict {
  const violations: BreadboardViolation[] = [];
  const byNode = new Map<string, HoleDeclaration[]>();
  for (const d of Object.values(decls)) {
    const node = holeNode(spec, d.hole);
    byNode.set(node, [...(byNode.get(node) ?? []), d]);
  }

  // RULE 1 — SHARED_COLUMN_SHORT / RAIL_MIXED_NETS: two different nets on
  // one node means the board itself has joined them.
  for (const [node, ds] of byNode) {
    const nets = [...new Set(ds.map((d) => d.netName))];
    if (nets.length < 2) continue;
    const classes = new Set(ds.map((d) => d.netClass));
    const powerMeetsGround = classes.has("power") && classes.has("gnd");
    const holes = [...new Set(ds.map((d) => describeHole(d.hole)))];
    const isRail = node.startsWith("rail:");
    violations.push({
      id: `${isRail ? "rail" : "short"}:${node}`,
      rule: isRail ? "RAIL_MIXED_NETS" : "SHARED_COLUMN_SHORT",
      severity: "error",
      title: powerMeetsGround
        ? "Power and ground are touching"
        : `${nets.join(" and ")} are joined by the board`,
      teach: isRail
        ? `The whole ${node.includes("+") ? "+" : "−"} rail is one long strip of metal — everything plugged into it is connected together. Right now that strip is carrying ${nets.join(" AND ")}, which must stay separate.`
        : `The holes ${holes.join(", ")} sit in one column — and the five holes of a column are secretly ONE strip of metal inside the board. Your ${nets.join(" and ")} wires are touching each other right now${powerMeetsGround ? " — this is exactly what makes a board get hot fast" : ""}.`,
      fix: `Move ${ds[ds.length - 1].label} to its own empty column — different number, any letter.`,
      holes,
      nets,
    });
  }

  // RULE 2 — OPEN_ACROSS_GAP: two ends of the SAME net in the same column
  // but opposite halves — they look connected and are not.
  const byNet = new Map<string, HoleDeclaration[]>();
  for (const d of Object.values(decls)) byNet.set(d.netName, [...(byNet.get(d.netName) ?? []), d]);
  for (const [netName, ds] of byNet) {
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i].hole;
        const b = ds[j].hole;
        if (a.kind !== "hole" || b.kind !== "hole" || a.column !== b.column) continue;
        const aTop = spec.topRows.includes(a.row);
        const bTop = spec.topRows.includes(b.row);
        if (aTop !== bTop) {
          violations.push({
            id: `gap:${netName}:${a.column}`,
            rule: "OPEN_ACROSS_GAP",
            severity: "error",
            title: `${netName} is split by the center gap`,
            teach: `${describeHole(a)} and ${describeHole(b)} share a number, but the trench down the middle of the board breaks every column in half — the top and bottom halves are NOT connected. These two ends aren't actually touching.`,
            fix: `Put both ends on the same half (both in rows ${spec.topRows.join("–")} or both in ${spec.bottomRows.join("–")}), or bridge the gap with a jumper.`,
            holes: [describeHole(a), describeHole(b)],
            nets: [netName],
          });
        }
      }
    }
  }

  // RULE 3 — OPEN_ACROSS_RAIL_BREAK: same net on both segments of a broken rail.
  for (const [netName, ds] of byNet) {
    const segs = new Map<string, HoleDeclaration>();
    for (const d of ds) {
      if (d.hole.kind !== "rail") continue;
      const node = holeNode(spec, d.hole);
      const railBase = node.split(":seg")[0];
      const seg = node.split(":seg")[1];
      const other = segs.get(`${railBase}:seg${seg === "1" ? "2" : "1"}`);
      if (other) {
        violations.push({
          id: `railbreak:${netName}:${railBase}`,
          rule: "OPEN_ACROSS_RAIL_BREAK",
          severity: "error",
          title: `${netName} crosses a rail break`,
          teach: `On this board the power rails break in the middle — the left and right halves of the rail are separate strips. Your ${netName} connections sit on opposite sides of that break, so they aren't actually connected.`,
          fix: "Bridge the rail break with a short jumper, or keep both connections on the same side of the middle.",
          holes: [describeHole(d.hole), describeHole(other.hole)],
          nets: [netName],
        });
      }
      segs.set(node, d);
    }
  }

  const unknowns = expectedKeys.filter((k) => !decls[k]);
  const status: BreadboardVerdict["status"] =
    violations.some((v) => v.severity === "error")
      ? "blocked"
      : unknowns.length > 0
        ? "unknown" // fail-closed: not-declared is never clean (audit row 18)
        : "clean";
  return { status, violations, unknowns };
}
