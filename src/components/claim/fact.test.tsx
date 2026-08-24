import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import { derived, declared, evidenced, unknown, derivedOr } from "@/lib/claim";
import { Fact, Gap, OptionalFact } from "./fact";

afterEach(() => cleanup());

test("a known claim renders its value", () => {
  render(<Fact claim={derived("SHT3x breakout", "catalog")} />);
  assert.ok(screen.getByText("SHT3x breakout"));
});

test("an unknown claim renders the gap, and the value is nowhere on screen", () => {
  // The live bug: this part had no verified match, and the screen said
  // `0.96" SSD1306 OLED module` -- another part's SKU.
  render(<Fact claim={unknown<string>("we haven't matched this to a part we've verified")} />);

  assert.ok(screen.getByText("we haven't matched this to a part we've verified"));
  assert.equal(screen.queryByText(/SSD1306/), null, "a neighbour's part reached the screen");
  assert.ok(document.querySelector('[data-claim="unknown"]'), "the gap is not marked as unknown");
});

test("provenance is off by default and plain-worded when on", () => {
  const { unmount } = render(<Fact claim={declared("brown", "T0")} />);
  assert.equal(screen.queryByText("you told us"), null, "provenance shown without being asked");
  unmount();

  render(<Fact claim={evidenced("0x3C", "instrument", "T1")} showProvenance />);
  assert.ok(screen.getByText("proven live"));
});

test("render lets a caller draw the value without unwrapping the claim", () => {
  render(
    <Fact
      claim={derived({ hex: "#92400e", name: "brown" }, "wire-colors")}
      render={(c) => <b>{c.name}</b>}
    />,
  );
  assert.ok(screen.getByText("brown"));
});

test("OptionalFact disappears entirely when unknown", () => {
  const { container, unmount } = render(
    <OptionalFact label="Note:" claim={unknown<string>("nothing recorded")} />,
  );
  assert.equal(container.textContent, "", "an optional absence rendered something");
  unmount();

  render(<OptionalFact label="Note:" claim={derived("verify silkscreen", "catalog")} />);
  assert.ok(screen.getByText("verify silkscreen"));
});

test("Gap renders the need verbatim — it is builder-facing copy, not a code", () => {
  render(<Gap need="plug the board in and run the live check to prove this" />);
  assert.ok(screen.getByText("plug the board in and run the live check to prove this"));
});

test("the wrong-part chain, end to end, renders a gap instead of a neighbour's SKU", () => {
  const lookup = (_id: string): { mpnOrSku: string } | undefined => undefined;
  render(
    <Fact
      claim={derivedOr(lookup("battery-level-led")?.mpnOrSku, "real-parts", "no verified match yet")}
    />,
  );
  assert.ok(screen.getByText("no verified match yet"));
  assert.equal(screen.queryByText(/SSD1306|TP4056|16340/), null);
});

test("COMPILE GATE: a bare value cannot reach the renderer", () => {
  // These are the assertions that matter, and they run at `tsc` time, not
  // here. If `Fact` ever grows a prop that takes a raw value, @ts-expect-error
  // becomes an unused-directive error and the build fails -- which is the
  // point: the gate is enforced by the compiler, not by review.

  // @ts-expect-error — no `value` prop exists; guessing has no entry point.
  const a = <Fact value="SSD1306" />;

  // @ts-expect-error — a raw string is not a Claim.
  const b = <Fact claim="SSD1306" />;

  // @ts-expect-error — `claim` is required; there is no silent empty render.
  const c = <Fact />;

  assert.ok(a && b && c, "the JSX above exists only to be typechecked");
});
