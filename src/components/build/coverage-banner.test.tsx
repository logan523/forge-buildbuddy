import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CompiledConnection, CompiledPlanFacts, StepContentIssue } from "@/lib/types";
import { CoverageBanner, CoverageDetail } from "./coverage-banner";

afterEach(() => cleanup());

const conn = (over: Partial<CompiledConnection> = {}): CompiledConnection => ({
  id: "SDA:U7:SDA",
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
  ...over,
});

const issue = (over: Partial<StepContentIssue> = {}): StepContentIssue => ({
  id: "STEP_UNKNOWN_PIN",
  severity: "warning",
  stepNumber: 4,
  detail:
    'Step 4 names pin "D5" which is not a silkscreen label in this plan\'s netlist — physical pin positions vary by vendor.',
  ...over,
});

const facts = (over: Partial<CompiledPlanFacts> = {}): CompiledPlanFacts => ({
  status: "ok",
  unassigned: [],
  issues: [],
  ...over,
});

/* ── CoverageBanner ────────────────────────────────────────────────────── */

test("CoverageBanner: clean facts (nothing unassigned, no issues) renders null", () => {
  const { container } = render(<CoverageBanner facts={facts()} onReview={() => {}} />);
  assert.equal(container.textContent, "");
});

test("CoverageBanner: facts undefined (compiler hasn't run) renders null", () => {
  const { container } = render(<CoverageBanner facts={undefined} onReview={() => {}} />);
  assert.equal(container.textContent, "");
});

test("CoverageBanner: unassigned connections show the count and a ghost Review button that fires onReview", async () => {
  const u = userEvent.setup();
  let reviewed = 0;
  render(
    <CoverageBanner
      facts={facts({ unassigned: [conn(), conn({ id: "GND:U7:GND", toPin: "GND" })] })}
      onReview={() => reviewed++}
    />
  );
  assert.ok(screen.getByText(/2 connections not covered by any step/i));
  const btn = screen.getByRole("button", { name: /review/i });
  assert.ok(btn.className.includes("bg-transparent"), "ghost variant, not a filled CTA");
  await u.click(btn);
  assert.equal(reviewed, 1);
});

test("CoverageBanner: singular wording for exactly one uncovered connection", () => {
  render(<CoverageBanner facts={facts({ unassigned: [conn()] })} onReview={() => {}} />);
  assert.ok(screen.getByText(/1 connection not covered by any step/i));
  assert.equal(screen.queryByText(/1 connections/i), null);
});

test("CoverageBanner: a STEP_SAFETY_CONTRADICTION-only issue never shows the banner — the red safety channel already owns it", () => {
  const { container } = render(
    <CoverageBanner
      facts={facts({
        issues: [
          issue({
            id: "STEP_SAFETY_CONTRADICTION",
            severity: "error",
            detail: "Step 3 instructs removing the cell's wrap/casing.",
          }),
        ],
      })}
      onReview={() => {}}
    />
  );
  assert.equal(container.textContent, "");
});

test("CoverageBanner: STEP_NET_UNCOVERED is not double-counted alongside the unassigned list it restates", () => {
  render(
    <CoverageBanner
      facts={facts({
        unassigned: [conn(), conn({ id: "b" })],
        issues: [
          issue({
            id: "STEP_NET_UNCOVERED",
            stepNumber: undefined,
            detail: "2 net(s) are not mentioned by any wiring step: SDA, GND.",
          }),
        ],
      })}
      onReview={() => {}}
    />
  );
  assert.ok(screen.getByText(/2 connections not covered by any step/i), "count stays at 2, not 3");
});

test("CoverageBanner: a genuine non-safety issue alone (nothing unassigned) still surfaces the banner", () => {
  render(<CoverageBanner facts={facts({ issues: [issue()] })} onReview={() => {}} />);
  assert.ok(screen.getByRole("button", { name: /review/i }));
});

/* ── CoverageDetail ────────────────────────────────────────────────────── */

test("CoverageDetail: clean facts show a friendly empty state, not a blank drawer", () => {
  render(<CoverageDetail facts={facts()} />);
  assert.ok(screen.getByText(/nothing to review/i));
});

test("CoverageDetail: lists each unassigned connection as a ConnectionsTable-style row", () => {
  render(<CoverageDetail facts={facts({ unassigned: [conn()] })} />);
  assert.ok(screen.getByText("blue"), "color name rendered as text, never color-only");
  assert.ok(screen.getByText(/GPIO4/));
  assert.ok(screen.getByText(/OLED Display/));
});

test("CoverageDetail: translates STEP_UNKNOWN_PIN into beginner language, not validator jargon", () => {
  render(<CoverageDetail facts={facts({ issues: [issue()] })} />);
  assert.ok(screen.getByText(/step 4/i));
  assert.ok(screen.getByText(/"D5"/));
  assert.equal(screen.queryByText(/silkscreen/i), null, "raw validator jargon is translated away");
});

test("CoverageDetail: translates STEP_COLOR_MISMATCH into beginner language", () => {
  render(
    <CoverageDetail
      facts={facts({
        issues: [
          issue({
            id: "STEP_COLOR_MISMATCH",
            stepNumber: 2,
            detail:
              "Step 2 tells the builder to use a red wire, but none of its derived connections are red — the views would disagree with the text.",
          }),
        ],
      })}
    />
  );
  assert.ok(screen.getByText(/step 2/i));
  assert.ok(screen.getByText(/wire color/i));
});

test("CoverageDetail: never shows a STEP_SAFETY_CONTRADICTION issue — the red safety channel owns it", () => {
  render(
    <CoverageDetail
      facts={facts({
        issues: [
          issue({
            id: "STEP_SAFETY_CONTRADICTION",
            severity: "error",
            detail: "Step 3 instructs removing the cell's wrap.",
          }),
        ],
      })}
    />
  );
  assert.ok(screen.getByText(/nothing to review/i));
});

test("CoverageDetail: STEP_NET_UNCOVERED is not shown as a second, redundant issue line", () => {
  render(
    <CoverageDetail
      facts={facts({
        unassigned: [conn()],
        issues: [
          issue({
            id: "STEP_NET_UNCOVERED",
            stepNumber: undefined,
            detail: "1 net(s) are not mentioned by any wiring step: SDA.",
          }),
        ],
      })}
    />
  );
  assert.equal(
    screen.queryByText(/worth a look/i),
    null,
    "no separate issues section when the only issue just restates the unassigned list above"
  );
});
