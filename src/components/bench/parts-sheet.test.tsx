import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import weatherClock from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import { PartsSheet } from "./parts-sheet";

afterEach(() => cleanup());

const PLAN = applyTrustPipeline(weatherClock as unknown as BuildPlan);

test("a part we haven't matched says so, instead of naming a different product", () => {
  render(<PartsSheet plan={PLAN} onClose={() => {}} />);

  // The three parts the live screen got wrong on 2026-08-24. Each had another
  // product's SKU on its "Look for" line because a regex matched its NAME.
  const gaps = screen.getAllByText(/we haven't matched this to a part we've measured/);
  assert.ok(gaps.length >= 3, `expected at least 3 honest gaps, got ${gaps.length}`);

  // And the specific leak is gone: the battery level indicator's card must not
  // contain the OLED's part number anywhere.
  const meter = screen.getByText(/1S Battery Level Indicator/).closest("li");
  assert.ok(meter, "no card for the battery meter");
  assert.doesNotMatch(meter!.textContent ?? "", /SSD1306|OLED/, "the OLED's SKU is still on it");
});

test("parts we DO know still name the right thing", () => {
  render(<PartsSheet plan={PLAN} onClose={() => {}} />);
  const esp = screen.getByText(/ESP32-C3 Super Mini/).closest("li");
  assert.match(esp!.textContent ?? "", /ESP32-C3 SuperMini/, "lost the correct guidance");

  const oled = screen.getByText(/0.96 inch OLED/).closest("li");
  assert.match(oled!.textContent ?? "", /SSD1306/, "the OLED lost its own SKU");
});

test("every part is listed — none is dropped for being unknown", () => {
  render(<PartsSheet plan={PLAN} onClose={() => {}} />);
  assert.equal(
    document.querySelectorAll("li").length,
    (PLAN.parts ?? []).length,
    "a part went missing from the shopping surface",
  );
});
