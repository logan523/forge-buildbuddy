import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import weatherClock from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import { buildActionCursor } from "@/lib/actions/cursor";
import { emptyReality, readReality, __resetRealityCache } from "@/lib/build-reality";
import type { BuildPlan } from "@/lib/types";
import { DeclareColor } from "./declare-color";
import { ActionCard } from "./action-card";

afterEach(() => {
  cleanup();
  __resetRealityCache();
});

const RAW = weatherClock as unknown as BuildPlan;

test("declaring a colour re-keys the instruction to the builder's own words", async () => {
  const user = userEvent.setup();
  const plan = applyTrustPipeline(RAW);
  const action = buildActionCursor(plan).current!;
  const reality = emptyReality(RAW.id);

  // Before: the class standard.
  const { unmount } = render(<ActionCard action={action} />);
  assert.match(document.body.textContent ?? "", /black/, "expected the standard colour first");
  unmount();

  render(<DeclareColor action={action} reality={reality} />);
  await user.click(screen.getByRole("button", { name: /set your .* wire is|different colour/i }));
  await user.click(screen.getByLabelText("brown"));

  // The declaration landed in reality...
  const after = readReality(RAW.id);
  assert.ok(after, "nothing was committed");
  assert.equal(after!.wireColors.byNet[action.connection.netName.toLowerCase()]?.name, "brown");

  // ...and recompiling re-keys the instruction he reads.
  const recompiled = applyTrustPipeline(RAW, after);
  const same = buildActionCursor(recompiled, after).actions.find((x) => x.id === action.id)!;
  assert.equal(same.connection.colorName, "brown");
  assert.equal(same.connection.colorSource, "user");

  cleanup();
  render(<ActionCard action={same} reality={after} />);
  assert.match(document.body.textContent ?? "", /brown/, "the card still shows the old colour");
});

test("the declaration is for the whole net, because that is what he means", async () => {
  const user = userEvent.setup();
  const plan = applyTrustPipeline(RAW);
  const cursor = buildActionCursor(plan);
  const action = cursor.current!;
  const net = action.connection.netName;

  render(<DeclareColor action={action} reality={emptyReality(RAW.id)} />);
  await user.click(screen.getByRole("button", { name: /set your .* wire is|different colour/i }));
  await user.click(screen.getByLabelText("brown"));

  // "GND is brown" said once means every ground wire he owns.
  const after = readReality(RAW.id)!;
  const recompiled = applyTrustPipeline(RAW, after);
  const sameNet = buildActionCursor(recompiled, after).actions.filter(
    (x) => x.connection.netName === net
  );
  assert.ok(sameNet.length > 1, "test needs a net with more than one wire");
  for (const w of sameNet) {
    assert.equal(w.connection.colorName, "brown", `${w.id} kept the old colour`);
  }
});
