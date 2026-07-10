import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan, Part } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { partCatalogId, realPartForPart, sizeLabel, bestBuyLink, keyFootgun } from "./part-identity";

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

test("integration: most demo BOM parts resolve to a physical spec", () => {
  const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
  const resolved = plan.parts.filter((p) => realPartForPart(p)).length;
  assert.ok(
    resolved >= Math.ceil(plan.parts.length / 2),
    `most parts get a size/sku (${resolved}/${plan.parts.length})`
  );
});
