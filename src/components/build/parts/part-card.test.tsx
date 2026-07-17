import "../../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import type { Part } from "@/lib/types";
import { PartCard } from "./part-card";
import { PartRow } from "@/components/build-ui";

afterEach(() => cleanup());

// esp32-c3 is a real modules-catalog.json entry with substituteIds:
// ["esp32-devkit"], footguns, mpn, mpnNote and mpnVerifiedAt already set —
// using the real id exercises resolveSubstitutes()/getModuleById() end to
// end instead of a mocked catalog shape.
function makePart(overrides: Partial<Part> = {}): Part {
  return {
    id: "p1",
    name: "ESP32-C3 Dev Board",
    specification: "RISC-V 160MHz, WiFi 4, BLE 5.0, 3.3V, USB-C",
    quantity: 2,
    catalogId: "esp32-c3",
    matchConfidence: "high",
    footguns: ["3.3V logic only — never drive pins from 5V without a level shifter"],
    unitPriceMin: 3,
    unitPriceMax: 7,
    priceSource: "catalog",
    mpn: "ESP32-C3-WROOM-02",
    mpnNote: "Module; Super Mini boards vary — verify silkscreen",
    mpnVerifiedAt: "2026-07-01",
    ...overrides,
  };
}

/* ── Badge tier ──────────────────────────────────────────────────────────── */

test("badge tier: matchConfidence high -> 'Catalog match'", () => {
  render(<PartCard part={makePart({ matchConfidence: "high" })} showImage />);
  assert.ok(screen.getByText("Catalog match"));
});

test("badge tier: matchConfidence medium -> 'Likely match'", () => {
  render(<PartCard part={makePart({ matchConfidence: "medium" })} showImage />);
  assert.ok(screen.getByText("Likely match"));
});

test("badge tier: matchConfidence low/none -> 'Best guess'", () => {
  render(<PartCard part={makePart({ matchConfidence: "low" })} showImage />);
  assert.ok(screen.getByText(/best guess/i));
});

/* ── Trust content visible by default (not a <details>) ─────────────────── */

test("buyGuidance's Look for / Avoid lines render visible by default, not behind a details/summary toggle", () => {
  const { container } = render(<PartCard part={makePart()} showImage />);
  assert.equal(container.querySelector("details"), null, "trust content must not be hidden behind <details>");
  assert.ok(screen.getByText(/look for:/i));
  assert.ok(screen.getByText(/3\.3V logic only/i), "the footgun surfaces as the Avoid line");
});

test("catalog mpnNote + mpnVerifiedAt render as a muted trust line", () => {
  render(<PartCard part={makePart()} showImage />);
  assert.ok(screen.getByText(/super mini boards vary/i));
  assert.ok(screen.getByText(/checked 2026-07-01/i));
});

test("no mpnNote -> no dangling 'Note:' line", () => {
  render(<PartCard part={makePart({ mpnNote: undefined })} showImage />);
  assert.equal(screen.queryByText(/^note:/i), null);
});

/* ── Honest buy labels ────────────────────────────────────────────────────── */

test("a search-result offer is labeled 'Search {Vendor} ->', never 'Buy'", () => {
  render(<PartCard part={makePart()} showImage />);
  assert.ok(screen.getByRole("link", { name: /search amazon/i }));
  assert.equal(screen.queryByRole("link", { name: /^buy at/i }), null);
});

test("a live kind==='product' offer keeps 'Buy at {Vendor} ->'", () => {
  const part = makePart({
    priceSource: "live",
    shoppingLinks: [
      { vendor: "amazon", label: "Amazon", url: "https://amazon.com/dp/XYZ", kind: "product", priceUsd: 5.5 },
    ],
  });
  render(<PartCard part={part} showImage />);
  assert.ok(screen.getByRole("link", { name: /buy at amazon/i }));
});

test("secondary vendor chips are honestly labeled too ('Search LCSC', not bare 'LCSC')", () => {
  render(<PartCard part={makePart()} showImage />);
  assert.ok(screen.getByRole("link", { name: /search lcsc/i }));
});

/* ── substituteIds finally consumed ───────────────────────────────────────── */

test("substituteIds resolve to an 'Also works' line naming the substitute via getModuleById", () => {
  render(<PartCard part={makePart()} showImage />);
  assert.ok(screen.getByText(/also works/i));
  assert.ok(screen.getByText("ESP32 DevKit V1"), "label resolved from the catalog, not the raw id");
});

test("a substitute with a search query becomes a tappable search link, not fake/dead text", () => {
  render(<PartCard part={makePart()} showImage />);
  const link = screen.getByRole("link", { name: /esp32 devkit v1/i });
  assert.ok(link.getAttribute("href")?.includes("amazon.com"), "scoped to the substitute's own query");
});

test("no catalogId -> no substitute line, no crash", () => {
  render(<PartCard part={makePart({ catalogId: undefined, mpnNote: undefined })} showImage />);
  assert.equal(screen.queryByText(/also works/i), null);
});

/* ── compact mode stays condensed ─────────────────────────────────────────── */

test("compact: no badge, no guidance, no note, no substitutes — but the buy label stays honest", () => {
  render(<PartCard part={makePart()} compact />);
  assert.equal(screen.queryByText("Catalog match"), null);
  assert.equal(screen.queryByText(/look for:/i), null);
  assert.equal(screen.queryByText(/super mini boards vary/i), null);
  assert.equal(screen.queryByText(/also works/i), null);
  assert.ok(screen.getByRole("link", { name: /search amazon/i }));
});

/* ── PartRow delegation (build-ui.tsx) ───────────────────────────────────── */

test("PartRow (build-ui.tsx) delegates to PartCard — exercises the two-file import cycle end to end", () => {
  render(<PartRow part={makePart()} showImage />);
  assert.ok(screen.getByText("Catalog match"));
  assert.ok(screen.getByText(/look for:/i));
  assert.ok(screen.getByText(/also works/i));
});
