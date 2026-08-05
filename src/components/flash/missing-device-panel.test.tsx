import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MissingDeviceDebugPanel } from "./missing-device-panel";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import { createVerifyState, feedLine, deviceVerdicts, type DeviceVerdict } from "@/lib/serial/verify";

// Same demo + applyTrustPipeline pattern as bus-proof.test.ts / flash-console.test.tsx.
const plan = applyTrustPipeline(demo as unknown as BuildPlan);
const expected = expectedI2cAddresses(plan);

afterEach(cleanup);

function verdictsWith(foundCatalogIds: string[]): DeviceVerdict[] {
  let state = createVerifyState(0);
  for (const d of expected) {
    if (foundCatalogIds.includes(d.catalogId)) {
      state = feedLine(state, { kind: "i2c-found", address: d.addresses[0] }, 10);
    }
  }
  return deviceVerdicts(state, expected, 100_000);
}

function oledVerdict(verdicts: DeviceVerdict[]): DeviceVerdict {
  return verdicts.find((v) => v.device.catalogId === "ssd1306-i2c")!;
}

test("sibling found: reassurance text, a focused diagram, and a reordered checklist all render", () => {
  const verdicts = verdictsWith(["sht31d"]);
  const { container } = render(
    <MissingDeviceDebugPanel plan={plan} verdict={oledVerdict(verdicts)} verdicts={verdicts} onOpenFullUnstick={() => {}} />
  );
  assert.ok(screen.getByText(/already proven/i));
  assert.ok(container.querySelector("svg"), "the focused circuit diagram renders");

  const summaries = Array.from(container.querySelectorAll("summary")).map((el) => el.textContent || "");
  const addrIdx = summaries.findIndex((s) => /wrong i2c address/i.test(s));
  const swapIdx = summaries.findIndex((s) => /sda and scl wires are swapped/i.test(s));
  assert.ok(addrIdx >= 0 && swapIdx >= 0, "both diagnoses render");
  assert.ok(addrIdx < swapIdx, "the address-config diagnosis leads once a sibling rules out a bus-wide swap");
});

test("nothing proven: no reassurance headline, still shows the plain checklist", () => {
  const verdicts = verdictsWith([]);
  render(<MissingDeviceDebugPanel plan={plan} verdict={oledVerdict(verdicts)} verdicts={verdicts} />);
  assert.equal(screen.queryByText(/already proven/i), null);
  assert.ok(screen.getByText(/sda and scl wires are swapped/i));
});

test("plan.electrical missing: no diagram, but the plain unstick checklist still renders — never a blank panel", () => {
  const verdicts = verdictsWith([]);
  const bare: BuildPlan = { ...plan, electrical: undefined };
  const { container } = render(<MissingDeviceDebugPanel plan={bare} verdict={oledVerdict(verdicts)} verdicts={verdicts} />);
  assert.equal(container.querySelector("svg"), null);
  assert.ok(screen.getByText(/sda and scl wires are swapped/i), "the checklist still renders without a bus proof");
});

test("Open full troubleshooting calls onOpenFullUnstick", async () => {
  const verdicts = verdictsWith([]);
  let called = false;
  render(
    <MissingDeviceDebugPanel
      plan={plan}
      verdict={oledVerdict(verdicts)}
      verdicts={verdicts}
      onOpenFullUnstick={() => (called = true)}
    />
  );
  await userEvent.click(screen.getByText(/open full troubleshooting/i));
  assert.ok(called);
});

test("omitting onOpenFullUnstick renders no escape-hatch link", () => {
  const verdicts = verdictsWith([]);
  render(<MissingDeviceDebugPanel plan={plan} verdict={oledVerdict(verdicts)} verdicts={verdicts} />);
  assert.equal(screen.queryByText(/open full troubleshooting/i), null);
});
