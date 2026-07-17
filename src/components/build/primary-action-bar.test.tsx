import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep } from "@/lib/types";
import { PrimaryActionBar, type PrimaryActionBarProps } from "./primary-action-bar";

afterEach(() => cleanup());

const step: BuildStep = { stepNumber: 3, title: "Wire the OLED", description: "" };

function makeProps(overrides: Partial<PrimaryActionBarProps> = {}): PrimaryActionBarProps {
  return {
    step,
    actionsTotal: 0,
    actionsChecked: 0,
    guidedState: null,
    isSoftwareStep: false,
    firmwareOpened: false,
    completed: false,
    isLast: false,
    allComplete: false,
    onMarkComplete: () => {},
    onNext: () => {},
    onOpenFirmware: () => {},
    onShare: () => {},
    onScrollToFirstUnchecked: () => {},
    ...overrides,
  };
}

/* ── Row 1: no checklist, not complete ──────────────────────────────────── */

test("row 1: no checklist actions, not complete -> 'Mark step complete', taps onMarkComplete", async () => {
  const u = userEvent.setup();
  let fired = 0;
  render(<PrimaryActionBar {...makeProps({ onMarkComplete: () => fired++ })} />);
  const btn = screen.getByRole("button", { name: /mark step complete/i });
  await u.click(btn);
  assert.equal(fired, 1);
});

/* ── Row 2: checklist in progress ───────────────────────────────────────── */

test("row 2: checklist partial (1 of 3) -> de-emphasized '1 of 3 done', taps onScrollToFirstUnchecked and NOT onMarkComplete", async () => {
  const u = userEvent.setup();
  let scrolled = 0;
  let marked = 0;
  render(
    <PrimaryActionBar
      {...makeProps({
        actionsTotal: 3,
        actionsChecked: 1,
        onScrollToFirstUnchecked: () => scrolled++,
        onMarkComplete: () => marked++,
      })}
    />
  );
  const btn = screen.getByRole("button", { name: /1 of 3 done/i });
  assert.ok(btn.className.includes("bg-surface"), "secondary variant — de-emphasized, not the accent CTA");
  await u.click(btn);
  assert.equal(scrolled, 1);
  assert.equal(marked, 0, "the checklist cannot be skipped via the primary bar");
});

test("row 2: checklist untouched (0 of N) still shows the secondary nudge, never a skip-ahead button", () => {
  render(<PrimaryActionBar {...makeProps({ actionsTotal: 4, actionsChecked: 0 })} />);
  assert.ok(screen.getByRole("button", { name: /0 of 4 done/i }));
});

/* ── Row 3: checklist 100% auto-completes (verified via the completed prop) ── */

test("row 3: once a 100%-checked checklist has auto-completed the step (completed=true), the bar shows 'Next step'", () => {
  // ActionChecklist (step-facts.tsx) calls onAutoComplete synchronously when
  // the last box is checked; BuildScreen wires that straight to
  // onToggleComplete, so by the paint where actionsChecked reaches
  // actionsTotal, `completed` is already true — this is the state the bar
  // actually sees, exercised here directly.
  render(
    <PrimaryActionBar {...makeProps({ actionsTotal: 3, actionsChecked: 3, completed: true })} />
  );
  assert.ok(screen.getByRole("button", { name: /next step/i }));
});

/* ── Row 4: guided wire flow (the explicit "guided mirror" requirement) ──── */

test("row 4 (guided mirror): guidedState present and NOT done -> shows its label, taps guidedState.onToggle", async () => {
  const u = userEvent.setup();
  let toggled = 0;
  render(
    <PrimaryActionBar
      {...makeProps({
        guidedState: { label: "I soldered this wire ✓", done: false, onToggle: () => toggled++ },
      })}
    />
  );
  const btn = screen.getByRole("button", { name: /i soldered this wire/i });
  assert.ok(btn.className.includes("bg-accent"), "primary CTA while the current wire is unsoldered");
  await u.click(btn);
  assert.equal(toggled, 1);
});

test("row 4: guidedState present and done (re-visited wire) still mirrors, de-emphasized, still taps onToggle (undo)", async () => {
  const u = userEvent.setup();
  let toggled = 0;
  render(
    <PrimaryActionBar
      {...makeProps({
        guidedState: { label: "✓ Done — tap to undo", done: true, onToggle: () => toggled++ },
      })}
    />
  );
  const btn = screen.getByRole("button", { name: /tap to undo/i });
  assert.ok(btn.className.includes("bg-surface"), "secondary — already done, not the forward CTA");
  await u.click(btn);
  assert.equal(toggled, 1);
});

/* ── Row 5: software steps gate on the firmware drawer ──────────────────── */

test("row 5a: software step, firmware never opened -> 'Open code package ->', taps onOpenFirmware", async () => {
  const u = userEvent.setup();
  let opened = 0;
  render(
    <PrimaryActionBar
      {...makeProps({
        isSoftwareStep: true,
        firmwareOpened: false,
        onOpenFirmware: () => opened++,
      })}
    />
  );
  const btn = screen.getByRole("button", { name: /open code package/i });
  await u.click(btn);
  assert.equal(opened, 1);
});

test("row 5b: software step, firmware opened, not complete -> 'Mark complete', taps onMarkComplete", async () => {
  const u = userEvent.setup();
  let marked = 0;
  render(
    <PrimaryActionBar
      {...makeProps({
        isSoftwareStep: true,
        firmwareOpened: true,
        onMarkComplete: () => marked++,
      })}
    />
  );
  const btn = screen.getByRole("button", { name: /^mark complete$/i });
  await u.click(btn);
  assert.equal(marked, 1);
});

test("precedence: a software step with an in-progress checklist still shows the firmware gate, not the checklist nudge", () => {
  render(
    <PrimaryActionBar
      {...makeProps({
        isSoftwareStep: true,
        firmwareOpened: false,
        actionsTotal: 2,
        actionsChecked: 1,
      })}
    />
  );
  assert.ok(screen.getByRole("button", { name: /open code package/i }));
});

/* ── Row 6 / 7: completion — forward-only, Next vs Share ─────────────────── */

test("row 6: step complete, not last, not allComplete -> 'Next step ->', taps onNext", async () => {
  const u = userEvent.setup();
  let nexted = 0;
  render(
    <PrimaryActionBar
      {...makeProps({ completed: true, isLast: false, allComplete: false, onNext: () => nexted++ })}
    />
  );
  const btn = screen.getByRole("button", { name: /next step/i });
  await u.click(btn);
  assert.equal(nexted, 1);
});

test("row 7a: last step, complete -> 'Share your build', taps onShare", async () => {
  const u = userEvent.setup();
  let shared = 0;
  render(
    <PrimaryActionBar
      {...makeProps({ completed: true, isLast: true, onShare: () => shared++ })}
    />
  );
  const btn = screen.getByRole("button", { name: /share your build/i });
  await u.click(btn);
  assert.equal(shared, 1);
});

test("row 7b: every step complete (allComplete) even when this one isn't last -> 'Share your build'", () => {
  render(<PrimaryActionBar {...makeProps({ completed: true, isLast: false, allComplete: true })} />);
  assert.ok(screen.getByRole("button", { name: /share your build/i }));
});

/* ── Defensive ─────────────────────────────────────────────────────────── */

test("no step -> renders nothing", () => {
  const { container } = render(<PrimaryActionBar {...makeProps({ step: undefined })} />);
  assert.equal(container.textContent, "");
});
