import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyInputHazards, safetyPreamble } from "./layer1-safety";
import { analyzeGaps } from "./layer4-gaps";

describe("pipeline L1 safety", () => {
  it("tags lithium and esd", () => {
    const tags = classifyInputHazards("ESP32 solar clock with 16340 li-ion battery and OLED");
    assert.ok(tags.includes("LIPO"));
    assert.ok(tags.includes("ESD_SENSITIVE"));
  });

  it("tags mains", () => {
    const tags = classifyInputHazards("connect to 120V wall outlet mains");
    assert.ok(tags.includes("MAINS"));
  });

  it("safety preamble mentions protection for LIPO", () => {
    const p = safetyPreamble(["LIPO"]);
    assert.match(p, /TP4056|BMS|LITHIUM/i);
  });
});

describe("pipeline L4 gaps", () => {
  it("flags lipo without protection", () => {
    const gaps = analyzeGaps({
      title: "Clock",
      description: "test",
      parts: [
        { name: "Li-ion Battery", specification: "3.7V 16340", quantity: 1, confidence: "CERTAIN" },
      ],
      tools: [],
      openQuestions: [],
    });
    assert.ok(gaps.blockers.some((b) => /TP4056|BMS/i.test(b)));
  });

  it("matches OLED to catalog hints", () => {
    const gaps = analyzeGaps({
      title: "x",
      description: "y",
      parts: [
        {
          name: "OLED Display",
          specification: "0.96 SSD1306 I2C",
          quantity: 1,
          confidence: "CERTAIN",
        },
      ],
      tools: [],
      openQuestions: [],
    });
    assert.ok(gaps.catalogHints.some((h) => /ssd1306/i.test(h)));
  });
});
