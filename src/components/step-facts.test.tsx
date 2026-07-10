import "../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep, CompiledStepFacts } from "@/lib/types";
import {
  ActionChecklist,
  CheckYourWorkCard,
  ConnectionsTable,
  GlossaryText,
  checkLines,
} from "./step-facts";

afterEach(() => cleanup());

const compiled: CompiledStepFacts = {
  connections: [
    {
      netName: "SDA",
      netClass: "i2c",
      fromRef: "U2",
      fromPin: "GPIO4",
      fromLabel: "ESP32-C3",
      toRef: "U7",
      toPin: "SDA",
      toLabel: "OLED Display",
      colorHex: "#2563eb",
      colorName: "blue",
      grade: "consistent",
    },
  ],
  checks: [
    { kind: "multimeter", instruction: "Multimeter across OLED: VCC ↔ GND", expected: "3.2–3.4 V" },
  ],
};

test("ConnectionsTable pairs every swatch with its color NAME (color never sole channel)", () => {
  render(<ConnectionsTable compiled={compiled} />);
  assert.ok(screen.getByText("blue"), "color name rendered as text");
  assert.ok(screen.getByText(/GPIO4/));
  assert.ok(screen.getByText(/SDA/));
  assert.ok(screen.getByText("consistent"));
});

test("checkLines: compiled checks first, duplicate verification numbers dropped (3A)", () => {
  const step = {
    stepNumber: 6,
    title: "Wire",
    description: "",
    compiled,
    verification: {
      description: "check",
      expectedOutput: "3.3V rail ~3.2-3.4V on USB power; GPIO4 continuous to both SDA pads",
    },
  } as unknown as BuildStep;
  const lines = checkLines(step);
  assert.equal(lines[0].expected, "3.2–3.4 V", "compiled check leads");
  const texts = lines.map((l) => l.instruction).join(" | ");
  assert.ok(texts.includes("GPIO4 continuous"), "novel verification line kept");
  assert.ok(
    !texts.includes("3.3V rail"),
    "verification line whose numbers are already covered is deduped"
  );
});

test("CheckYourWorkCard renders doneWhen headline + measurable chips", () => {
  const step = {
    stepNumber: 6,
    title: "Wire",
    description: "",
    doneWhen: "Every wire tugged and solid.",
    compiled,
  } as unknown as BuildStep;
  render(<CheckYourWorkCard step={step} />);
  assert.ok(screen.getByText("Every wire tugged and solid."));
  assert.ok(screen.getByText("3.2–3.4 V"));
});

test("F4: checking the last action auto-completes ONCE; unchecking never un-completes", async () => {
  let completions = 0;
  const actions = [
    { n: 1, text: "Cut the wire" },
    { n: 2, text: "Tin both ends" },
  ];
  render(
    <ActionChecklist
      planId="t-plan"
      stepNumber={42}
      actions={actions}
      stepCompleted={false}
      onAutoComplete={() => completions++}
    />
  );
  const boxes = screen.getAllByRole("checkbox");
  assert.equal(boxes.length, 2);

  await userEvent.click(boxes[0]);
  assert.equal(completions, 0, "partial checklist does not complete");
  await userEvent.click(boxes[1]);
  assert.equal(completions, 1, "last box completes the step");

  await userEvent.click(boxes[0]);
  assert.equal(completions, 1, "unchecking never un-completes");
  await userEvent.click(boxes[0]);
  assert.equal(completions, 1, "re-checking after auto-fire does not double-complete");
});

test("ActionChecklist persists checks per plan+step (storage round-trip)", async () => {
  localStorage.clear();
  const actions = [{ n: 1, text: "Do the thing" }];
  const { unmount } = render(
    <ActionChecklist
      planId="persist-plan"
      stepNumber={3}
      actions={actions}
      stepCompleted={false}
      onAutoComplete={() => {}}
    />
  );
  await userEvent.click(screen.getByRole("checkbox"));
  unmount();
  render(
    <ActionChecklist
      planId="persist-plan"
      stepNumber={3}
      actions={actions}
      stepCompleted={true}
      onAutoComplete={() => {}}
    />
  );
  assert.equal(
    (screen.getByRole("checkbox") as HTMLInputElement).checked,
    true,
    "checkbox state survives remount via localStorage"
  );
});

test("GlossaryText turns jargon into keyboard-operable popovers", async () => {
  render(<GlossaryText text="Connect SDA to the display." />);
  const term = screen.getByRole("button", { name: /what is sda/i });
  assert.equal(term.getAttribute("aria-expanded"), "false");
  await userEvent.click(term);
  assert.equal(term.getAttribute("aria-expanded"), "true");
  assert.ok(screen.getByRole("tooltip").textContent!.includes("Serial Data"));
  await userEvent.keyboard("{Escape}");
  assert.equal(term.getAttribute("aria-expanded"), "false");
});
