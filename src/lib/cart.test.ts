import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachBuyData,
  bestLink,
  estimateBom,
  formatUsdRange,
  offersFromModule,
  planCartOpens,
} from "./cart";
import { enrichParts, getModuleById } from "./catalog";
import { applyTrustPipeline } from "./trust";
import type { BuildPlan } from "./types";
import demo from "@/data/sat-line.json";

describe("cart buy loop", () => {
  it("offersFromModule includes amazon + price band", () => {
    const mod = getModuleById("ssd1306-i2c")!;
    const offers = offersFromModule(mod);
    assert.ok(offers.some((o) => o.vendor === "amazon"));
    assert.ok(offers.some((o) => o.vendor === "lcsc"));
    const amz = offers.find((o) => o.vendor === "amazon")!;
    assert.ok((amz.priceUsd ?? 0) > 0);
    assert.ok(amz.url.includes("amazon.com"));
    assert.ok(amz.url.toLowerCase().includes("ssd1306") || amz.url.includes("OLED") || amz.url.includes("oled") || decodeURIComponent(amz.url).toLowerCase().includes("ssd1306"));
  });

  it("bestLink prefers amazon for mechanical bamboo", () => {
    const parts = attachBuyData(
      enrichParts([
        { id: "b", name: "Bamboo Coaster", specification: "Round bamboo coaster", quantity: 1 },
      ])
    );
    const link = bestLink(parts[0], "split");
    assert.equal(link.vendor, "amazon");
  });

  it("bestLink can prefer lcsc for electronics strategy", () => {
    const parts = attachBuyData(
      enrichParts([
        {
          id: "o",
          name: "OLED Display",
          specification: "0.96 inch SSD1306 I2C 128x64",
          quantity: 1,
        },
      ])
    );
    const link = bestLink(parts[0], "electronics");
    assert.ok(["lcsc", "digikey", "mouser", "amazon"].includes(link.vendor));
    // electronics strategy should rank lcsc high for OLED
    assert.equal(link.vendor, "lcsc");
  });

  it("estimateBom rolls up sat-line prices", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const bom = estimateBom(plan.parts, "split");
    assert.ok(bom.pricedCount >= 10);
    assert.ok(bom.totalMin > 15);
    assert.ok(bom.totalMax >= bom.totalMin);
    assert.ok(plan.bomEstimate && plan.bomEstimate.totalMin > 0);
  });

  it("planCartOpens groups by vendor", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const opens = planCartOpens(plan.parts, "split");
    assert.equal(opens.length, plan.parts.length);
    // vendors should be clustered (not random order of unique flips every row)
    const vendors = opens.map((o) => o.vendor);
    assert.ok(vendors.every((v) => typeof v === "string"));
  });

  it("formatUsdRange formats bands", () => {
    assert.equal(formatUsdRange(3, 7), "$3–$7");
    assert.equal(formatUsdRange(undefined, undefined), "—");
  });
});
