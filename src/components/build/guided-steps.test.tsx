import "../../test-utils/dom";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildPlan, BuildStep, CompiledConnection, MicroStep } from "@/lib/types";
import { GuidedSteps } from "./guided-steps";

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

const conn = (id: string, netClass: string, toPin: string): CompiledConnection => ({
  id,
  netName: netClass.toUpperCase(),
  netClass,
  fromRef: "U2",
  fromPin: "GPIO4",
  fromLabel: "ESP32-C3",
  toRef: "U7",
  toPin,
  toLabel: "OLED",
  colorHex: "#2563eb",
  colorName: "blue",
  grade: "consistent",
});

const micro = (id: string, netClass: string, index: number, showTechnique: boolean): MicroStep => ({
  id,
  index,
  total: 2,
  colorName: "blue",
  colorHex: "#2563eb",
  netName: id === "w1" ? "GND" : "SDA",
  fromLabel: "ESP32-C3",
  fromPin: "GPIO4",
  toLabel: "OLED",
  toPin: id === "w1" ? "GND" : "SDA",
  netClass,
  action: `Solder the blue wire from ESP32-C3 pin GPIO4 to OLED pin ${id === "w1" ? "GND" : "SDA"}.`,
  verify: { tug: "Gently tug it.", continuity: `Beep between GPIO4 and ${id === "w1" ? "GND" : "SDA"}.` },
  showTechnique,
  rescueSymptomId: netClass === "gnd" ? "no_power" : "blank_display",
});

const step: BuildStep = {
  stepNumber: 6,
  title: "Wire it",
  description: "",
  compiled: {
    connections: [conn("w1", "gnd", "GND"), conn("w2", "i2c", "SDA")],
    checks: [],
    microSteps: [micro("w1", "gnd", 1, true), micro("w2", "i2c", 2, false)],
  },
};
const plan = { id: "test-plan", steps: [step], parts: [] } as unknown as BuildPlan;

test("guided: shows one wire at a time, with per-wire verify", () => {
  render(<GuidedSteps step={step} plan={plan} planId="test-plan" />);
  assert.ok(screen.getByText(/Wire 1 of 2/));
  // The action runs through GlossaryText (fragmented across spans); assert the
  // plain-text verify + find-it parts, and that the first wire is GND (ordered).
  assert.ok(screen.getByText(/Make sure it's right/i), "verify card");
  assert.ok(screen.getByText(/Beep between GPIO4 and GND/), "per-wire continuity names the pins");
});

test("guided: checking a wire advances to the next; last wire completes the step once", async () => {
  const u = userEvent.setup();
  let completed = 0;
  render(
    <GuidedSteps step={step} plan={plan} planId="test-plan" onAutoComplete={() => completed++} />
  );

  await u.click(screen.getByRole("button", { name: /I soldered this wire/i }));
  assert.ok(screen.getByText(/Wire 2 of 2/), "advanced to the next wire");
  assert.equal(completed, 0, "not complete until the last wire");

  await u.click(screen.getByRole("button", { name: /I soldered this wire/i }));
  assert.equal(completed, 1, "completing the last wire auto-completes the step");
});

test("guided: 'show all' reveals the connections table, then back", async () => {
  const u = userEvent.setup();
  render(<GuidedSteps step={step} plan={plan} planId="test-plan" />);
  await u.click(screen.getByRole("button", { name: /Show all 2/i }));
  assert.ok(screen.getByText(/back to guided/i));
  // the table lists the wire endpoints
  assert.ok(screen.getAllByText(/GPIO4/).length > 0);
});

test("guided: 'What am I connecting?' shows the wire + both part identity cards", () => {
  const parts = [
    {
      id: "esp",
      name: "ESP32-C3 SuperMini",
      specification: "RISC-V Wi-Fi MCU",
      quantity: 1,
      footguns: ["USB-C, not micro-USB"],
      shoppingLinks: [{ vendor: "Amazon", label: "buy", url: "http://x", kind: "product" }],
    },
    { id: "oled", name: '0.96" OLED SSD1306', specification: "128x64 I2C", quantity: 1 },
  ];
  const m: MicroStep = { ...micro("w2", "i2c", 1, false), fromPartId: "esp", toPartId: "oled" };
  const s: BuildStep = { ...step, compiled: { ...step.compiled!, microSteps: [m] } };
  const p = { id: "t", steps: [s], parts } as unknown as BuildPlan;

  render(<GuidedSteps step={s} plan={p} planId="t" />);
  assert.ok(screen.getByText(/What am I connecting/i), "the disclosure summary is present");
  // <details> content is in the DOM even collapsed — assert both part cards render.
  assert.ok(screen.getAllByText(/ESP32-C3 SuperMini/).length > 0, "from part card names the part");
  assert.ok(screen.getByText(/OLED SSD1306/), "to part card names the part");
  assert.ok(screen.getAllByText(/About .* mm/).length >= 2, "physical size shown for both parts");
  assert.ok(screen.getByText(/USB-C, not micro-USB/), "the footgun shows");
  assert.ok(screen.getByText(/See what it looks like/i), "a buy link to see a photo");
});

test("guided: progress persists by wire id across remounts", async () => {
  const u = userEvent.setup();
  const { unmount } = render(<GuidedSteps step={step} plan={plan} planId="test-plan" />);
  await u.click(screen.getByRole("button", { name: /I soldered this wire/i }));
  unmount();
  render(<GuidedSteps step={step} plan={plan} planId="test-plan" />);
  assert.ok(screen.getByText(/1 done/), "the first wire stays done after remount");
});
