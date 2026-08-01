import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseScanMatch, candidatesFromParts, buildPartScanUser } from "./match";
import type { Part } from "@/lib/types";

const parts = [
  {
    id: "p-esp",
    name: "ESP32-C3 Microcontroller",
    specification: "SuperMini USB-C",
    quantity: 1,
    catalogId: "esp32_c3",
  },
  {
    id: "p-oled",
    name: "OLED Display",
    specification: "0.96 SSD1306",
    quantity: 1,
    catalogId: "oled_096",
  },
] as Part[];

describe("part-scan match", () => {
  it("candidatesFromParts maps plan parts", () => {
    const c = candidatesFromParts(parts);
    assert.equal(c.length, 2);
    assert.equal(c[0]!.partId, "p-esp");
  });

  it("parse accepts high match in candidate set", () => {
    const c = candidatesFromParts(parts);
    const r = parseScanMatch(
      JSON.stringify({
        partId: "p-esp",
        confidence: "high",
        cues: ["USB-C", "ESP32-C3 silkscreen"],
        manualCheck: "Confirm SuperMini shape",
        catalogHint: "esp32_c3",
      }),
      c
    );
    assert.equal(r.partId, "p-esp");
    assert.equal(r.confidence, "high");
    assert.ok(r.cues.includes("USB-C"));
  });

  it("parse rejects invented partId", () => {
    const c = candidatesFromParts(parts);
    const r = parseScanMatch(
      '{"partId":"hacker","confidence":"high","cues":[],"manualCheck":"x"}',
      c
    );
    assert.equal(r.partId, null);
    assert.equal(r.confidence, "unknown");
  });

  it("user prompt lists candidate ids", () => {
    const u = buildPartScanUser(candidatesFromParts(parts));
    assert.match(u, /partId=p-esp/);
    assert.match(u, /partId=p-oled/);
  });

  it("parse keeps silkscreen and pin OCR fields", () => {
    const c = candidatesFromParts(parts);
    const r = parseScanMatch(
      JSON.stringify({
        partId: "p-oled",
        confidence: "medium",
        cues: ["glass panel"],
        silkscreenText: ["SSD1306", "0.96"],
        visiblePins: ["GND", "VCC", "SCL", "SDA"],
        manualCheck: "Check 4-pin header order",
      }),
      c
    );
    assert.equal(r.partId, "p-oled");
    assert.deepEqual(r.silkscreenText, ["SSD1306", "0.96"]);
    assert.ok(r.visiblePins?.includes("SDA"));
    // pin hits should boost medium → high for oled catalog pins
    assert.equal(r.confidence, "high");
  });

  it("batch focus appears in user prompt", () => {
    const u = buildPartScanUser(candidatesFromParts(parts), {
      focusPartId: "p-esp",
      focusHint: "ESP32",
    });
    assert.match(u, /BATCH FOCUS/);
    assert.match(u, /p-esp/);
  });
});
