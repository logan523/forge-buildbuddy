/**
 * THE CORE LOOP — the contract the rebuild may not break.
 *
 * Written BEFORE the surface is deleted, and it passes on the pre-rebuild
 * tree (tag `pre-rebuild-2026-08-24`). That ordering is the whole point:
 * CLAUDE.md anti-pattern #2 records a rewrite that stripped the app to 165
 * lines and lost working features, because nothing defined "working" except
 * the code being deleted. This file defines it independently.
 *
 * It exercises the LOOP, not the UI: every assertion is about a pure module,
 * so it survives the surface being thrown away and rebuilt. If a step here
 * cannot pass, the rebuild has removed a capability rather than a rendering.
 *
 * The loop, in the words of the person who hit each wall (Aug 2-14 build,
 * transcript in docs/BUILD-REALITY.md):
 *
 *   1. "heres everything im looking at, whats my next step"  → a plan compiles
 *   2. "Which do I pick up next"                             → ONE next action
 *   3. "which wire goes where"                               → named endpoints
 *   4. "GND is brown, VCC is red"                            → his colors win
 *   5. "can you give me exact points"                        → hole coordinates
 *   6. "the ESP got super fucking hot"                       → the short is caught
 *   7. "✓ OLED display answered at 0x3C"                     → evidence, not assertion
 *   8. "okay thats all done what next"                       → the cursor advances
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import rawPlan from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import { buildActionCursor } from "@/lib/actions/cursor";
import {
  emptyReality,
  declareColor,
  setJointState,
  setFormFactor,
  setBoardSpec,
  declareBreadboardHole,
  sortEndpoints,
} from "@/lib/build-reality";
import { applyDeviceVerdictsToReality } from "@/lib/build-reality/serial-bridge";
import { BOARD_SPECS, parseHole } from "@/lib/breadboard/spec";
import { checkBreadboard } from "@/lib/breadboard/erc";
import type { BuildPlan } from "@/lib/types";

const PLAN = rawPlan as unknown as BuildPlan;

/** 1 — A plan compiles into wiring truth. Everything downstream needs this. */
test("CORE 1: a real plan compiles to connections", () => {
  const plan = applyTrustPipeline(PLAN);
  const conns = (plan.steps || []).flatMap((s) => s.compiled?.connections ?? []);
  assert.ok(conns.length > 0, "no compiled connections — the whole loop is dead");
  assert.ok(plan.electrical, "no electrical model");
  for (const c of conns) {
    assert.ok(c.id && c.netName && c.fromRef && c.fromPin && c.toRef && c.toPin,
      `connection missing an endpoint: ${JSON.stringify(c)}`);
  }
});

/** 2+3 — "Which do I pick up next", answered with named endpoints. */
test("CORE 2: there is exactly ONE next action, and it names both endpoints", () => {
  const plan = applyTrustPipeline(PLAN);
  const cursor = buildActionCursor(plan);

  assert.ok(cursor.current, "no current action — 'which do I pick up next' has no answer");
  const a = cursor.current!;
  assert.ok(a.connection.fromRef && a.connection.fromPin, "no from-endpoint");
  assert.ok(a.connection.toRef && a.connection.toPin, "no to-endpoint");
  assert.equal(a.index, 0, "the first action is not at position 0");
  assert.equal(cursor.actions.length, cursor.current!.total);

  // Every connection appears exactly once — no duplicates, nothing dropped.
  const ids = cursor.actions.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "an action is listed twice");
  const compiled = (plan.steps || []).flatMap((s) => s.compiled?.connections ?? []);
  assert.equal(ids.length, compiled.length, "the cursor lost or invented connections");

  // Safest first: ground before signal, so a beginner's first joint is the
  // one that cannot damage anything.
  assert.equal(a.connection.netClass, "gnd", `first action is ${a.connection.netClass}, not gnd`);
});

/** 4 — "GND is brown." His color, in his instructions. */
test("CORE 3: a declared wire color reaches the compiled prose", () => {
  const base = applyTrustPipeline(PLAN);
  const gnd = (base.steps || [])
    .flatMap((s) => s.compiled?.connections ?? [])
    .find((c) => c.netClass === "gnd");
  assert.ok(gnd, "no ground connection to declare a color on");

  let reality = emptyReality(PLAN.id);
  reality = declareColor(reality, {
    hex: "#92400e",
    name: "brown",
    label: "the short brown one",
    netName: gnd!.netName,
  });

  const withColor = applyTrustPipeline(PLAN, reality);
  const same = (withColor.steps || [])
    .flatMap((s) => s.compiled?.connections ?? [])
    .find((c) => c.id === gnd!.id);

  assert.ok(same, "the connection vanished when reality was applied");
  assert.equal(same!.colorName, "brown", "the builder's color did not win");
  assert.equal(same!.colorSource, "user", "the color is not attributed to the builder");

  // And it must not have moved the wire to a different chapter (eng E5):
  // step assignment scores on the canonical color, never the declared one.
  const stepOf = (p: BuildPlan, id: string) =>
    (p.steps || []).find((s) => (s.compiled?.connections ?? []).some((c) => c.id === id))?.stepNumber;
  assert.equal(stepOf(withColor, gnd!.id), stepOf(base, gnd!.id),
    "declaring a color moved the wire to another step");
});

/** 5+6 — Exact holes, and the short that made the ESP hot. */
test("CORE 4: four wires in one breadboard column is caught BEFORE power", () => {
  const board = BOARD_SPECS["full-830"]!;
  let reality = emptyReality(PLAN.id);
  reality = setFormFactor(reality, "breadboard");
  reality = setBoardSpec(reality, board.id);

  // The real Aug-12 state: OLED's four wires down one column.
  const wires = [
    { key: "GND:U1:GND", net: "GND", cls: "gnd", label: "brown (OLED GND)", at: "A1" },
    { key: "3V3:U1:VCC", net: "3V3", cls: "power", label: "red (OLED VCC)", at: "B1" },
    { key: "SDA:U1:SDA", net: "SDA", cls: "i2c", label: "orange (OLED SDA)", at: "C1" },
    { key: "SCL:U1:SCL", net: "SCL", cls: "i2c", label: "yellow (OLED SCL)", at: "D1" },
  ];
  for (const w of wires) {
    const p = parseHole(board, w.at);
    assert.ok(p.ok, `${w.at} did not parse`);
    reality = declareBreadboardHole(reality, {
      key: w.key, netName: w.net, netClass: w.cls, label: w.label, hole: (p as { ok: true; hole: never }).hole,
    });
  }

  const verdict = checkBreadboard(board, reality.breadboard!.declarations);
  const short = verdict.violations.find((v) => v.rule === "SHARED_COLUMN_SHORT");
  assert.ok(short, "the power-to-ground short was NOT caught — this is the burn case");

  // The teaching copy is part of the contract, not decoration: it must explain
  // the board's hidden metal and must never blame the builder.
  const copy = `${short!.title} ${short!.detail} ${short!.fix}`.toLowerCase();
  assert.match(copy, /strip|column|joined|metal|inside/, "the copy does not explain the cause");
  assert.doesNotMatch(copy, /\byou (made|did) (a|an) (mistake|error)\b|wrong of you|your fault/,
    "the copy blames the builder");
});

/** 7 — The board answering is evidence; a tap is only an assertion. */
test("CORE 5: a live device verdict writes instrument-tier evidence", () => {
  const plan = applyTrustPipeline(PLAN);
  const comp = (plan.electrical?.components ?? []).find((c) => c.catalogId);
  assert.ok(comp, "no component with a catalogId to prove");

  const before = emptyReality(PLAN.id);
  const after = applyDeviceVerdictsToReality(plan, before, [
    { device: { catalogId: comp!.catalogId!, address: 0x3c, label: comp!.ref }, status: "found" } as never,
  ]);

  const verified = Object.values(after.joints).filter((j) => j.state === "verified");
  assert.ok(verified.length > 0, "a found device proved nothing");
  for (const j of verified) {
    assert.ok(j.evidence, "verified with no evidence record");
    assert.equal(j.evidence!.source, "i2c-scan", "wrong evidence source");
    // Instrument tier is what a gate may rely on. A tug is self-report and
    // must never reach this tier (design addendum 10).
    assert.equal(j.evidence!.tier, "instrument", `evidence is ${j.evidence!.tier}, not instrument`);
  }

  // Monotonic: a later "missing" must never roll back a proof.
  const flapped = applyDeviceVerdictsToReality(plan, after, [
    { device: { catalogId: comp!.catalogId!, address: 0x3c, label: comp!.ref }, status: "missing" } as never,
  ]);
  assert.equal(
    Object.values(flapped.joints).filter((j) => j.state === "verified").length,
    verified.length,
    "a flapping port demoted proven joints",
  );
});

/** 8 — "okay thats all done what next". */
test("CORE 6: completing the current action advances the cursor", () => {
  const plan = applyTrustPipeline(PLAN);
  const first = buildActionCursor(plan);
  const a = first.current!;

  const reality = setJointState(
    emptyReality(PLAN.id),
    {
      connectionId: a.id,
      netName: a.connection.netName,
      netClass: a.connection.netClass,
      endpoints: sortEndpoints(
        { ref: a.connection.fromRef, pin: a.connection.fromPin },
        { ref: a.connection.toRef, pin: a.connection.toPin },
      ),
    },
    "made",
  );

  const next = buildActionCursor(plan, reality);
  assert.notEqual(next.current?.id, a.id, "the cursor did not advance");
  assert.equal(next.madeCount, first.madeCount + 1, "the done count did not move");

  // Ordering is stable under reality updates — only the position moves.
  assert.deepEqual(
    next.actions.map((x) => x.id),
    first.actions.map((x) => x.id),
    "declaring a joint reordered the action list",
  );
});
