import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fold, valueOrUndefined } from "@/lib/claim";
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

test("partCatalogId resolves ONLY from a catalog id, never from the part's name", () => {
  // Catalog ids bridge explicitly to a measured spec.
  assert.equal(partCatalogId(part({ catalogId: "esp32-c3", name: "whatever" })), "esp32_c3");
  assert.equal(partCatalogId(part({ catalogId: "ssd1306-i2c", name: "whatever" })), "oled_096");
  assert.equal(partCatalogId(part({ catalogId: "sht31d", name: "mystery" })), "sht30");
  // Real-parts keys still work for the 3D code that already holds them.
  assert.equal(partCatalogId(part({ catalogId: "sht30", name: "mystery" })), "sht30");

  // The name is not evidence of anything. Each of these used to match a regex.
  assert.equal(partCatalogId(part({ name: "ESP32-C3 SuperMini dev board" })), null);
  assert.equal(partCatalogId(part({ name: '0.96" OLED display SSD1306' })), null);
  assert.equal(partCatalogId(part({ name: "a resistor" })), null);
});

test("REGRESSION: the three parts the live screen got wrong now resolve to nothing", () => {
  // 2026-08-24, /build/solar-weather-clock. Each of these was assigned another
  // part's measured spec by a regex over its NAME, which drove both the "Look
  // for" line and the life-size hold-it-up card.
  const wrong = [
    { catalogId: "battery-level-led", name: "1S Battery Level Indicator (capacity display)" },
    { catalogId: "solar-charger", name: "Solar Charging Controller (eletechsup SDBK03TA)" },
    { catalogId: "battery-lipo-1s", name: "1S LiPo Battery 3.7V (602535)" },
  ];
  for (const w of wrong) {
    assert.equal(partCatalogId(part(w)), null, `${w.name} still resolves to a spec`);
    assert.equal(realPartForPart(part(w)), null, `${w.name} still borrows a physical spec`);

    const lookFor = buyGuidance(part(w)).lookFor;
    assert.equal(lookFor.kind, "unknown", `${w.name} still claims to know what to buy`);
    const text = fold<string, string>(lookFor, { known: (v) => v, unknown: (n) => n });
    assert.doesNotMatch(text, /SSD1306|OLED|TP4056|16340/i, `${w.name} still names another part`);
  }
});

test("the catalog-id bridge is exhaustive: every id maps deliberately or not at all", () => {
  // The bridge is seven hand-written entries, so pin all seven and assert that
  // EVERY other catalog id resolves to nothing. A fuzzy proxy check was tried
  // first and rejected: it flagged sht31d -> "SHT3x breakout" as unrelated,
  // which is correct, so the check was measuring string overlap rather than
  // the property. Exhaustive beats clever here -- adding a mapping has to be
  // a deliberate edit in two places.
  const EXPECTED: Record<string, string> = {
    "esp32-c3": "esp32_c3",
    "ssd1306-i2c": "oled_096",
    "tp4056-protected": "tp4056",
    "battery-16340": "cell_16340",
    sht31d: "sht30",
    "touch-switch": "ttp223",
    "solar-panel-5v": "solar_cell",
  };

  const CATALOG = JSON.parse(
    readFileSync(new URL("../data/modules-catalog.json", import.meta.url), "utf8"),
  );
  const mods: { id: string; name: string }[] = Array.isArray(CATALOG) ? CATALOG : CATALOG.modules;
  assert.ok(mods.length > 20, "catalog did not load");

  for (const m of mods) {
    assert.equal(
      partCatalogId(part({ catalogId: m.id, name: m.name })),
      EXPECTED[m.id] ?? null,
      `catalog "${m.id}" (${m.name}) resolves to the wrong measured spec`,
    );
  }

  // And every mapping actually lands on a real spec rather than undefined.
  for (const [catalogId, key] of Object.entries(EXPECTED)) {
    const spec = realPartForPart(part({ catalogId, name: catalogId }));
    assert.ok(spec, `"${catalogId}" maps to "${key}" but that spec does not exist`);
    assert.ok(spec!.bboxMm.l > 0, `"${catalogId}" has no measured size`);
  }
});

test("sizeLabel: boards as L×W, cells as length × diameter", () => {
  const esp = realPartForPart(part({ catalogId: "esp32-c3", name: "ESP32-C3" }))!;
  assert.match(sizeLabel(esp), /^\d+ × \d+ mm$/, "board reads L × W mm");
  const cell = realPartForPart(part({ catalogId: "battery-16340", name: "16340 cell" }))!;
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
    catalogId: "ssd1306-i2c",
    name: "OLED display",
    specification: '0.96" I2C',
    unitPriceMin: 3,
    unitPriceMax: 6,
    footguns: ["7-pin is the wrong SPI version"],
  }));
  assert.match(
    fold<string, string>(g.lookFor, { known: (v) => v, unknown: (n) => n }),
    /SSD1306|OLED/,
    "the exact thing to look for",
  );
  assert.equal(valueOrUndefined(g.priceBand), "$3–6", "the price that means 'correct'");
  assert.match(
    fold<string, string>(g.avoid, { known: (v) => v, unknown: (n) => n }),
    /7-pin/,
    "the trap to avoid",
  );
});

test("buyGuidance shows a single price when min===max, degrades to null", () => {
  assert.equal(
    valueOrUndefined(buyGuidance(part({ name: "x", unitPriceMin: 4, unitPriceMax: 4 })).priceBand),
    "$4",
  );
  assert.equal(buyGuidance(part({ name: "x" })).priceBand.kind, "unknown");
});

test("confidenceLabel is honest, never 'verified'", () => {
  assert.deepEqual(confidenceLabel(part({ matchConfidence: "high" })), { label: "Exact match", known: true });
  assert.equal(confidenceLabel(part({ matchConfidence: "low" })).known, false);
  assert.match(confidenceLabel(part({})).label, /best guess/i);
});

test("spotTells: size first, then the gotcha — max two, to spot it in the pile", () => {
  const t = spotTells(part({ catalogId: "esp32-c3", name: "ESP32-C3", footguns: ["USB-C, not micro-USB"] }));
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
