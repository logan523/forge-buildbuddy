import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep } from "@/lib/types";
import { StepListSheet } from "./step-list-sheet";

afterEach(() => cleanup());

const steps: BuildStep[] = [
  { stepNumber: 1, title: "Solder the ground wire", description: "connect pin to gnd" },
  { stepNumber: 2, title: "Mount the frame", description: "drill and mount the bracket" },
  { stepNumber: 3, title: "Upload the sketch", description: "flash the firmware" },
];

test("renders one row per step with number, title, kind chip, time estimate, and status", () => {
  render(
    <StepListSheet
      steps={steps}
      stepIndex={1}
      completed={new Set([1])}
      onGoStep={() => {}}
      onClose={() => {}}
    />
  );

  // Title present for every step.
  assert.ok(screen.getByText("Solder the ground wire"));
  assert.ok(screen.getByText("Mount the frame"));
  assert.ok(screen.getByText("Upload the sketch"));

  // Kind chip + time estimate render from the same stepKind/TIME_BY_KIND
  // authority the persistent sub-header uses (wiring/mechanical/software).
  assert.ok(screen.getByText("Wiring"));
  assert.ok(screen.getByText("Hands-on"));
  assert.ok(screen.getByText("Software"));
  assert.ok(screen.getAllByText(/≈\d+ min/).length === 3);

  // Status: step 1 done (✓), step 2 current (aria-current, highlighted),
  // step 3 todo (○).
  const doneRow = screen.getByRole("button", { name: /Solder the ground wire/i });
  assert.ok(doneRow.textContent?.includes("✓"), "completed step shows a checkmark");
  assert.equal(doneRow.getAttribute("aria-current"), null, "done but not current has no aria-current");

  const currentRow = screen.getByRole("button", { name: /Mount the frame/i });
  assert.equal(currentRow.getAttribute("aria-current"), "step", "current step is marked current");

  const todoRow = screen.getByRole("button", { name: /Upload the sketch/i });
  assert.ok(todoRow.textContent?.includes("○"), "todo step shows the open circle");

  // Progress summary: 1 of 3 complete, remaining = step 2 (mechanical, 10
  // min) + step 3 (software, 10 min) = 20 min.
  assert.ok(screen.getByText("1 of 3 complete · ~20 min left"));
});

test("tapping a row fires onGoStep with its index and closes the sheet", async () => {
  const u = userEvent.setup();
  let gotIndex: number | null = null;
  let closed = 0;
  render(
    <StepListSheet
      steps={steps}
      stepIndex={0}
      completed={new Set()}
      onGoStep={(i) => (gotIndex = i)}
      onClose={() => closed++}
    />
  );

  await u.click(screen.getByRole("button", { name: /Upload the sketch/i }));
  assert.equal(gotIndex, 2, "tapping the third row goes to index 2");
  assert.equal(closed, 1, "row tap closes the sheet too");
});

test("Esc closes the sheet (DrawerShell's own handler)", async () => {
  let closed = 0;
  render(
    <StepListSheet
      steps={steps}
      stepIndex={0}
      completed={new Set()}
      onGoStep={() => {}}
      onClose={() => closed++}
    />
  );

  await userEvent.keyboard("{Escape}");
  assert.equal(closed, 1);
});
