/**
 * Breadboard geometry as DATA (Slice 2, A2-ERC). No solver here — this
 * module knows what a board IS: which holes are secretly the same strip of
 * metal. Derived from vendor datasheet dimensions; Fritzing's part encoding
 * was the cross-check reference only (GPL/CC-BY-SA — facts derived, assets
 * never copied; see plan research findings).
 *
 * Connectivity truth:
 *   - Terminal strip: same COLUMN NUMBER + same half (A–E or F–J) = one node.
 *     The center gap breaks halves — A1 and F1 are NOT connected.
 *   - Power rails: one long node per rail — EXCEPT full-size (830) boards,
 *     whose rails routinely break mid-board. Rail segmentation is modeled
 *     and the 830 preset defaults to SEGMENTED (conservative — the classic
 *     beginner trap is assuming a continuous rail; eng 2d).
 */

export interface RailSpec {
  id: string;
  polarity: "+" | "-";
  side: "top" | "bottom";
  /** Columns covered, inclusive. */
  from: number;
  to: number;
  /** A physical break AFTER this column — the rail is two nodes. */
  segmentBreakAfterColumn?: number;
}

export interface BoardSpec {
  id: "mini-170" | "half-400" | "full-830";
  label: string;
  /** Terminal-strip rows, top half then bottom half. */
  topRows: string[];
  bottomRows: string[];
  columns: number;
  rails: RailSpec[];
}

export const BOARD_SPECS: Record<BoardSpec["id"], BoardSpec> = {
  "mini-170": {
    id: "mini-170",
    label: "Mini 170-tie (no rails)",
    topRows: ["A", "B", "C", "D", "E"],
    bottomRows: ["F", "G", "H", "I", "J"],
    columns: 17,
    rails: [],
  },
  "half-400": {
    id: "half-400",
    label: "Half-size 400-tie",
    topRows: ["A", "B", "C", "D", "E"],
    bottomRows: ["F", "G", "H", "I", "J"],
    columns: 30,
    rails: [
      { id: "top+", polarity: "+", side: "top", from: 1, to: 30 },
      { id: "top-", polarity: "-", side: "top", from: 1, to: 30 },
      { id: "bottom+", polarity: "+", side: "bottom", from: 1, to: 30 },
      { id: "bottom-", polarity: "-", side: "bottom", from: 1, to: 30 },
    ],
  },
  "full-830": {
    id: "full-830",
    label: "Full-size 830-tie",
    topRows: ["A", "B", "C", "D", "E"],
    bottomRows: ["F", "G", "H", "I", "J"],
    columns: 63,
    rails: [
      // Segmented by default: many 830 boards break the rails mid-board and
      // a rail-as-one-node model would pass wiring that is physically open.
      { id: "top+", polarity: "+", side: "top", from: 1, to: 63, segmentBreakAfterColumn: 32 },
      { id: "top-", polarity: "-", side: "top", from: 1, to: 63, segmentBreakAfterColumn: 32 },
      { id: "bottom+", polarity: "+", side: "bottom", from: 1, to: 63, segmentBreakAfterColumn: 32 },
      { id: "bottom-", polarity: "-", side: "bottom", from: 1, to: 63, segmentBreakAfterColumn: 32 },
    ],
  },
};

export type HoleRef =
  | { kind: "hole"; row: string; column: number }
  | { kind: "rail"; railId: string; column: number };

export interface HoleParseError {
  ok: false;
  problem: string;
  fix: string;
}

/** "C1", "j17", "B14" → hole ref, or a LOUD typed rejection with real ranges. */
export function parseHole(spec: BoardSpec, text: string): { ok: true; hole: HoleRef } | HoleParseError {
  const m = /^\s*([A-Za-z])\s*(\d{1,2})\s*$/.exec(text);
  if (!m) {
    return {
      ok: false,
      problem: `"${text.trim()}" doesn't look like a hole name.`,
      fix: `Holes are a letter + a number, like C1 — rows ${spec.topRows[0]}–${spec.bottomRows[spec.bottomRows.length - 1]}, columns 1–${spec.columns}.`,
    };
  }
  const row = m[1].toUpperCase();
  const column = parseInt(m[2], 10);
  const rows = [...spec.topRows, ...spec.bottomRows];
  if (!rows.includes(row)) {
    return { ok: false, problem: `There's no row ${row} on this board.`, fix: `Rows go ${rows[0]}–${rows[rows.length - 1]}.` };
  }
  if (column < 1 || column > spec.columns) {
    return { ok: false, problem: `There's no column ${column} on this board.`, fix: `Columns go 1–${spec.columns}.` };
  }
  return { ok: true, hole: { kind: "hole", row, column } };
}

/**
 * The node a hole belongs to — two holes with the same node id are secretly
 * the same strip of metal inside the board. THE core fact of the module.
 */
export function holeNode(spec: BoardSpec, hole: HoleRef): string {
  if (hole.kind === "rail") {
    const rail = spec.rails.find((r) => r.id === hole.railId);
    if (!rail) return `rail:${hole.railId}`;
    const seg =
      rail.segmentBreakAfterColumn !== undefined && hole.column > rail.segmentBreakAfterColumn ? 2 : 1;
    return `rail:${rail.id}:seg${seg}`;
  }
  const half = spec.topRows.includes(hole.row) ? "top" : "bottom";
  return `col:${hole.column}:${half}`;
}

export function describeHole(hole: HoleRef): string {
  return hole.kind === "rail" ? `${hole.railId} rail (col ${hole.column})` : `${hole.row}${hole.column}`;
}
