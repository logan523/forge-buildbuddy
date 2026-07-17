import "../../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Part } from "@/lib/types";
import { ShoppingList, type ShoppingListEstimate } from "./shopping-list";

afterEach(() => cleanup());

const parts: Part[] = [
  { id: "p1", name: "ESP32-C3 Dev Board", specification: "USB-C, WiFi/BLE", quantity: 1, catalogId: "esp32-c3" },
  { id: "p2", name: "0.96in OLED", specification: "SSD1306 I2C 128x64", quantity: 1, catalogId: "ssd1306-i2c" },
];

const estimate = (overrides: Partial<ShoppingListEstimate> = {}): ShoppingListEstimate => ({
  totalMin: 41,
  totalMax: 127,
  pricedCount: 2,
  unpricedCount: 0,
  ...overrides,
});

test("shows the part count and a midpoint headline with the honest range alongside it", () => {
  render(<ShoppingList parts={parts} strategy="split" estimate={estimate()} onBuyAll={() => {}} />);
  assert.ok(screen.getByText(/Parts \(2\)/));
  // midpoint of 41/127 is 84 — a single number reads faster than a bare range
  assert.ok(screen.getByText(/~\$84/), "midpoint headline");
  assert.ok(screen.getByText(/typically \$41–\$127 depending on vendor/), "range kept alongside, not hidden");
});

test("renders one PartCard per part", () => {
  render(<ShoppingList parts={parts} strategy="split" estimate={estimate()} onBuyAll={() => {}} />);
  assert.ok(screen.getByText("ESP32-C3 Dev Board"));
  assert.ok(screen.getByText("0.96in OLED"));
});

// fireEvent, not userEvent: this asserts pure onClick plumbing, and
// userEvent's act-settle await deadlocked order-dependently under the
// node:test runner here (full-file run hung at this await; any
// --test-name-pattern composition passed — reproduced 3x on 2026-07-16).
test("Buy-all control fires onBuyAll with the full parts list", () => {
  let received: Part[] | null = null;
  render(
    <ShoppingList
      parts={parts}
      strategy="split"
      estimate={estimate()}
      onBuyAll={(p) => {
        received = p;
      }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /buy all parts/i }));
  assert.equal(received, parts);
});

test("nothing priced yet -> no headline, no Buy-all button, list still renders", () => {
  render(
    <ShoppingList
      parts={parts}
      strategy="split"
      estimate={estimate({ pricedCount: 0, totalMin: 0, totalMax: 0 })}
      onBuyAll={() => {}}
    />
  );
  // assert.ok(!el), never assert.equal(el, null): a failing equal() renders
  // its diff by util.inspect-ing the JSDOM element's cyclic graph, which
  // freezes the test process for minutes (root cause of the 2026-07-16
  // "hanging test file" — the freeze was the diff, not the code under test).
  assert.ok(!screen.queryByRole("button", { name: /buy all parts/i }), "no Buy-all button");
  assert.ok(screen.getByText("ESP32-C3 Dev Board"), "the list itself doesn't disappear just because pricing is missing");
});

test("a tight band (min≈max) collapses to a bare midpoint, no redundant 'typically' clause", () => {
  render(
    <ShoppingList
      parts={parts}
      strategy="split"
      estimate={estimate({ totalMin: 65, totalMax: 65.02 })}
      onBuyAll={() => {}}
    />
  );
  assert.ok(screen.getByText(/~\$65/));
  assert.ok(!screen.queryByText(/typically/), "no redundant range clause on a tight band");
});
