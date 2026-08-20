import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SPECS, parseHole, holeNode } from "./spec";
import { declareHole, type Declarations } from "./declarations";
import { checkBreadboard } from "./erc";

const board = BOARD_SPECS["half-400"];

function decls(entries: { key: string; net: string; cls: string; label: string; hole: string }[]): Declarations {
  let d: Declarations = {};
  for (const e of entries) {
    const parsed = parseHole(board, e.hole);
    assert.ok(parsed.ok, `fixture hole ${e.hole}`);
    d = declareHole(d, { key: e.key, netName: e.net, netClass: e.cls, label: e.label, hole: parsed.hole });
  }
  return d;
}

// ================= THE GOLDEN TRANSCRIPT TEST =================
// Aug 12: OLED's four wires in A1/B1/C1/D1 — four different nets, one
// column, "the ESP got super fucking hot". The rule must trip, and the
// rendering copy must TEACH (causal, plain words) and NEVER blame.

test("GOLDEN A1/B1/C1/D1: the shared-column short trips, teaches causally, never blames", () => {
  const d = decls([
    { key: "GND:U1:GND@oled", net: "GND", cls: "gnd", label: "brown wire (OLED GND end)", hole: "A1" },
    { key: "VCC:U1:VCC@oled", net: "3V3", cls: "power", label: "red wire (OLED VCC end)", hole: "B1" },
    { key: "SDA:U1:SDA@oled", net: "SDA", cls: "i2c", label: "orange wire (OLED SDA end)", hole: "C1" },
    { key: "SCL:U1:SCL@oled", net: "SCL", cls: "i2c", label: "yellow wire (OLED SCL end)", hole: "D1" },
  ]);
  const verdict = checkBreadboard(board, d);
  assert.equal(verdict.status, "blocked");
  const short = verdict.violations.find((v) => v.rule === "SHARED_COLUMN_SHORT");
  assert.ok(short, "the short rule fired");
  assert.equal(short!.severity, "error");
  assert.equal(short!.title, "Power and ground are touching");
  // Rendering/teaching copy asserted, not just the rule (design voice D5):
  assert.match(short!.teach, /secretly ONE strip of metal/i, "explains the board's hidden wiring");
  assert.match(short!.teach, /hot/i, "connects to the real consequence");
  assert.ok(!/you shorted|your mistake|you made/i.test(short!.teach), "never blames the builder");
  assert.match(short!.fix, /own empty column/i, "one concrete action");
  assert.deepEqual([...short!.holes].sort(), ["A1", "B1", "C1", "D1"]);
});

test("the fixed layout (1,3,5,7 — the chat's own fix) comes back clean", () => {
  const d = decls([
    { key: "a", net: "GND", cls: "gnd", label: "brown", hole: "A1" },
    { key: "b", net: "3V3", cls: "power", label: "red", hole: "A3" },
    { key: "c", net: "SDA", cls: "i2c", label: "orange", hole: "B5" },
    { key: "d", net: "SCL", cls: "i2c", label: "yellow", hole: "B7" },
  ]);
  assert.equal(checkBreadboard(board, d).status, "clean");
});

test("same net sharing a column is fine — that's how you connect things", () => {
  const d = decls([
    { key: "a", net: "GND", cls: "gnd", label: "OLED end", hole: "A1" },
    { key: "b", net: "GND", cls: "gnd", label: "bridge to ESP", hole: "C1" },
  ]);
  assert.equal(checkBreadboard(board, d).status, "clean");
});

test("letter doesn't matter, number does: D1 vs D14 are separate nodes; A1 vs E1 are one node", () => {
  const p = (t: string) => {
    const r = parseHole(board, t);
    assert.ok(r.ok);
    return r.hole;
  };
  assert.notEqual(holeNode(board, p("D1")), holeNode(board, p("D14")));
  assert.equal(holeNode(board, p("A1")), holeNode(board, p("E1")));
  assert.notEqual(holeNode(board, p("A1")), holeNode(board, p("F1")), "center gap breaks the column");
});

test("OPEN_ACROSS_GAP: same net, same column, opposite halves — looks connected, is not", () => {
  const d = decls([
    { key: "a", net: "SDA", cls: "i2c", label: "OLED end", hole: "A5" },
    { key: "b", net: "SDA", cls: "i2c", label: "ESP end", hole: "F5" },
  ]);
  const v = checkBreadboard(board, d);
  assert.equal(v.status, "blocked");
  const gap = v.violations.find((x) => x.rule === "OPEN_ACROSS_GAP");
  assert.ok(gap);
  assert.match(gap!.teach, /trench|middle.*break|NOT connected/i);
});

test("GOLDEN split rail (830): same net across the mid-board rail break is caught", () => {
  const full = BOARD_SPECS["full-830"];
  let d: Declarations = {};
  d = declareHole(d, { key: "a", netName: "3V3", netClass: "power", label: "left feed", hole: { kind: "rail", railId: "top+", column: 5 } });
  d = declareHole(d, { key: "b", netName: "3V3", netClass: "power", label: "right feed", hole: { kind: "rail", railId: "top+", column: 60 } });
  const v = checkBreadboard(full, d);
  assert.equal(v.status, "blocked");
  assert.ok(v.violations.find((x) => x.rule === "OPEN_ACROSS_RAIL_BREAK"));
});

test("rail carrying two different nets = error (one long strip)", () => {
  let d: Declarations = {};
  d = declareHole(d, { key: "a", netName: "3V3", netClass: "power", label: "3V3 feed", hole: { kind: "rail", railId: "top+", column: 3 } });
  d = declareHole(d, { key: "b", netName: "5V", netClass: "power", label: "5V feed", hole: { kind: "rail", railId: "top+", column: 20 } });
  const v = checkBreadboard(board, d);
  assert.ok(v.violations.find((x) => x.rule === "RAIL_MIXED_NETS"));
});

test("fail-closed: partial declarations are UNKNOWN, never clean (audit row 18)", () => {
  const d = decls([{ key: "a", net: "GND", cls: "gnd", label: "brown", hole: "A1" }]);
  const v = checkBreadboard(board, d, ["a", "b-not-declared", "c-not-declared"]);
  assert.equal(v.status, "unknown");
  assert.deepEqual(v.unknowns, ["b-not-declared", "c-not-declared"]);
});

test("hole parsing rejects loudly with real ranges + keeps the correction history", () => {
  const bad = parseHole(board, "Z99");
  assert.ok(!bad.ok);
  if (!bad.ok) assert.match(bad.fix, /Rows go|Columns go/);
  const bad2 = parseHole(board, "C99");
  assert.ok(!bad2.ok);
  if (!bad2.ok) assert.match(bad2.fix, /1–30/);
  // "D14 sorry": correction is an amendment with history, not an error
  let d: Declarations = {};
  const h1 = parseHole(board, "D4");
  const h2 = parseHole(board, "D14");
  assert.ok(h1.ok && h2.ok);
  d = declareHole(d, { key: "k", netName: "SCL", netClass: "i2c", label: "yellow", hole: h1.hole });
  d = declareHole(d, { key: "k", netName: "SCL", netClass: "i2c", label: "yellow", hole: h2.hole });
  assert.equal((d["k"].hole as { column: number }).column, 14, "last write wins");
  assert.equal(d["k"].history.length, 1, "the D4 attempt is kept as history");
});
