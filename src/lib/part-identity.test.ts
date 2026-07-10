import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan, Part } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { partCatalogId, realPartForPart, sizeLabel, bestBuyLink, keyFootgun, sizeComparison, buyGuidance, confidenceLabel, spotTells } from "./part-identity";

const part = (over: Partial<Part>): Part => ({
  id: "p",
  name: "",
  specification: "",
  quantity: 1,
  ...over,
});

test("partCatalogId: infers from name/spec; explicit catalogId wins", () => {
  assert.equal(partCatalogId(part({ name: "ESP32-C3 SuperMini dev board" })), "esp32_c3");
  assert.equal(partCatalogId(part({ name: '0.96" OLED display SSD1306' })), "oled_096");
  assert.equal(partCatalogId(part({ name: "TP4056 charging module" })), "tp4056");
  assert.equal(partCatalogId(part({ name: "16340 Li-ion cell" })), "cell_16340");
  assert.equal(partCatalogId(part({ catalogId: "sht30", name: "mystery" })), "sht30");
  assert.equal(partCatalogId(part({ name: "a resistor" })), null, "no match → null");
});

test("sizeLabel: boards as L×W, cells as length × diameter", () => {
  const esp = realPartForPart(part({ name: "ESP32-C3" }))!;
  assert.match(sizeLabel(esp), /^\d+ × \d+ mm$/, "board reads L × W mm");
  const cell = realPartForPart(part({ name: "16340 cell" }))!;
  assert.match(sizeLabel(cell), /long, ⌀/, "cell reads length × diameter");
});

test("bestBuyLink prefers a product deep-link over a search link", () => {
  const p = part({
    shoppingLinks: [
      { vendor: "amazon", label: "search", url: "u1", kind: "search" },
      { vendor: "digikey", label: "product", url: "u2", kind: "product" },
    ],
  });
  assert.equal(bestBuyLink(p)?.url, "u2");
  assert.equal(bestBuyLink(part({ shoppingLinks: [] })), null);
});

test("keyFootgun returns the first non-empty footgun, else null", () => {
  assert.equal(keyFootgun(part({ footguns: ["", "watch polarity"] })), "watch polarity");
  assert.equal(keyFootgun(part({})), null);
});

test("sizeComparison anchors to an object everyone owns", () => {
  assert.match(sizeComparison({ l: 22.5, w: 18, h: 3 }).phrase, /quarter/, "an ESP32 board ≈ a quarter");
  assert.equal(sizeComparison({ l: 22.5, w: 18, h: 3 }).longestMm, 23);
  assert.match(sizeComparison({ l: 12, w: 10, h: 3 }).phrase, /fingernail|smaller/, "a tiny module ≈ a fingernail");
  assert.match(sizeComparison({ l: 86, w: 54, h: 1 }).phrase, /credit card/, "a big board ≈ a credit card");
  const s = sizeComparison({ l: 50, w: 40, h: 3 });
  assert.match(s.phrase, /^(about the size of|smaller than|bigger than) /, "always a relation phrase");
});

test("buyGuidance tells you what to match, pay, and avoid", () => {
  const g = buyGuidance(part({
    name: "OLED display",
    specification: '0.96" I2C',
    unitPriceMin: 3,
    unitPriceMax: 6,
    footguns: ["7-pin is the wrong SPI version"],
  }));
  assert.match(g.lookFor ?? "", /SSD1306|OLED/, "the exact thing to look for");
  assert.equal(g.priceBand, "$3–6", "the price that means 'correct'");
  assert.match(g.avoid ?? "", /7-pin/, "the trap to avoid");
});

test("buyGuidance shows a single price when min===max, degrades to null", () => {
  assert.equal(buyGuidance(part({ name: "x", unitPriceMin: 4, unitPriceMax: 4 })).priceBand, "$4");
  assert.equal(buyGuidance(part({ name: "x" })).priceBand, null);
});

test("confidenceLabel is honest, never 'verified'", () => {
  assert.deepEqual(confidenceLabel(part({ matchConfidence: "high" })), { label: "Exact match", known: true });
  assert.equal(confidenceLabel(part({ matchConfidence: "low" })).known, false);
  assert.match(confidenceLabel(part({})).label, /best guess/i);
});

test("spotTells: size first, then the gotcha — max two, to spot it in the pile", () => {
  const t = spotTells(part({ name: "ESP32-C3", footguns: ["USB-C, not micro-USB"] }));
  assert.ok(t.length <= 2);
  assert.match(t[0]!, /quarter|fingernail|size|smaller|bigger/i, "leads with a size tell");
  assert.ok(t.some((x) => /USB-C/.test(x)), "includes the distinguishing gotcha");
  // No real match, no footgun → falls back to a spec clause.
  const t2 = spotTells(part({ name: "widget", specification: "green PCB with a button" }));
  assert.ok(t2.length >= 1 && /green PCB/.test(t2[0]!));
});

test("integration: most demo BOM parts resolve to a physical spec", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const resolved = plan.parts.filter((p) => realPartForPart(p)).length;
  assert.ok(
    resolved >= Math.ceil(plan.parts.length / 2),
    `most parts get a size/sku (${resolved}/${plan.parts.length})`
  );
});
