import "../../test-utils/dom";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildPlan, BuildStep, CompiledConnection, MicroStep } from "@/lib/types";
import { SolderWorkbench } from "./solder-workbench";

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

// Fixtures ported from guided-steps.test.tsx when GuidedSteps dissolved into
// the workbench (Slice 1) — the teaching features must live on the surface
// builders actually see, so the assertions moved with them.
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

const micro = (id: string, netClass: string, index: number): MicroStep => ({
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
  showTechnique: false,
  rescueSymptomId: netClass === "gnd" ? "no_power" : "blank_display",
});

const step: BuildStep = {
  stepNumber: 6,
  title: "Wire it",
  description: "",
  compiled: {
    connections: [conn("w1", "gnd", "GND"), conn("w2", "i2c", "SDA")],
    checks: [],
    microSteps: [micro("w1", "gnd", 1), micro("w2", "i2c", 2)],
  },
};
const plan = { id: "test-plan", steps: [step], parts: [] } as unknown as BuildPlan;

test("workbench: one wire at a time with per-wire verify strip", () => {
  render(<SolderWorkbench step={step} plan={plan} planId="test-plan" />);
  assert.ok(screen.getByText(/Wire lab · 1 \/ 2/));
  assert.ok(screen.getByText("Gently tug it."));
});

test("workbench: teaching layer is mounted — identity, reverse-check, inline rescue (Slice 1 resurrection)", () => {
  render(<SolderWorkbench step={step} plan={plan} planId="test-plan" />);
  assert.ok(screen.getByText(/What am I connecting\? See both parts/), "Hold-It-Up identity reachable");
  assert.ok(screen.getByText(/I put the/), "reverse-check (WireDoubleCheck) mounted");
  assert.ok(screen.getByText(/Doesn't look right\?/), "inline per-wire rescue mounted");
});

test("workbench: marking every wire fires onAutoComplete exactly once", async () => {
  const user = userEvent.setup();
  let completed = 0;
  render(
    <SolderWorkbench step={step} plan={plan} planId="test-plan" onAutoComplete={() => completed++} />
  );
  await user.click(screen.getByRole("button", { name: /Mark soldered/ }));
  await user.click(screen.getByRole("button", { name: /Mark soldered/ }));
  assert.equal(completed, 1);
});

test("workbench: per-wire progress survives remount (wirechecks storage)", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<SolderWorkbench step={step} plan={plan} planId="test-plan" />);
  await user.click(screen.getByRole("button", { name: /Mark soldered/ }));
  unmount();
  render(<SolderWorkbench step={step} plan={plan} planId="test-plan" />);
  assert.ok(screen.getByText(/1 done/), "checked wire persisted across remount");
});

test("workbench: askSlot renders inside the scroll area", () => {
  render(
    <SolderWorkbench step={step} plan={plan} planId="test-plan" askSlot={<div>ASK-SLOT-SENTINEL</div>} />
  );
  assert.ok(screen.getByText("ASK-SLOT-SENTINEL"));
});
