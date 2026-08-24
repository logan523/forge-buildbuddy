import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import weatherClock from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import { buildActionCursor } from "@/lib/actions/cursor";
import {
  emptyReality,
  readReality,
  setBoardSpec,
  setFormFactor,
  declareBreadboardHole,
  __resetRealityCache,
} from "@/lib/build-reality";
import { parseHole, BOARD_SPECS } from "@/lib/breadboard/spec";
import type { BuildPlan } from "@/lib/types";
import { DeclareHole } from "./declare-hole";

afterEach(() => {
  cleanup();
  __resetRealityCache();
});

const RAW = weatherClock as unknown as BuildPlan;
const board = BOARD_SPECS["full-830"]!;

function onBreadboard() {
  return setBoardSpec(setFormFactor(emptyReality(RAW.id), "breadboard"), board.id);
}

test("exactly ONE end is asked about at a time", async () => {
  const user = userEvent.setup();
  const plan = applyTrustPipeline(RAW);
  const action = buildActionCursor(plan).current!;

  render(<DeclareHole action={action} reality={onBreadboard()} />);
  const asks = screen.getAllByText(/Tap the hole where/);
  assert.equal(asks.length, 1, "asked about both ends at once");

  // Answer it; the question becomes the OTHER end, still exactly one.
  await user.click(screen.getAllByRole("img")[0]!.querySelectorAll("circle")[3]!);
  const after = readReality(RAW.id);
  assert.ok(after?.breadboard, "the tap did not land");
  assert.equal(Object.keys(after!.breadboard!.declarations).length, 1);
});

test("GOLDEN: the column-1 short is caught, taught causally, and never blames", () => {
  const plan = applyTrustPipeline(RAW);
  const action = buildActionCursor(plan).current!;

  // Recreate the Aug-12 state through the real reducer: power and ground both
  // landing in column 1, which the board joins inside itself.
  let r = onBreadboard();
  const place = (key: string, net: string, cls: string, at: string) => {
    const p = parseHole(board, at);
    assert.ok(p.ok, `${at} did not parse`);
    r = declareBreadboardHole(r, {
      key, netName: net, netClass: cls, label: `${net} wire`,
      hole: (p as { ok: true; hole: never }).hole,
    });
  };
  place("GND:U1:GND", "GND", "gnd", "A1");
  place("3V3:U1:VCC", "3V3", "power", "B1");

  render(<DeclareHole action={action} reality={r} />);
  const body = document.body.textContent ?? "";

  assert.match(body, /strip|column|joined|metal|inside/i, "no causal explanation on screen");
  assert.doesNotMatch(
    body,
    /\byou (made|did) (a|an) (mistake|error)\b|your fault|wrong of you/i,
    "the copy blames the builder",
  );
  // And the offending holes are marked on the board, not just described.
  assert.ok(
    document.querySelectorAll('circle[stroke="#dc2626"]').length >= 2,
    "the conflicting holes are not highlighted on the sheet",
  );
});
