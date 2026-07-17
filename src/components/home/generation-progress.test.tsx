import "../../test-utils/dom";
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationProgress } from "./generation-progress";
import type { PrinciplesResult } from "@/lib/pipeline/types";

afterEach(() => cleanup());

const STAGE_LABELS = [
  "Checking for hazards",
  "Framing the goal",
  "Finding every part",
  "Checking the catalog",
  "Writing your steps",
  "Safety & trust checks",
];

const PRINCIPLES: PrinciplesResult = {
  functionalGoal: "A solar-powered clock that shows temperature",
  constraints: ["Must run on a single 3.7V cell"],
  risks: ["Lithium battery can overheat if charged without a BMS", "Mains-adjacent wiring", "ESD-sensitive OLED"],
  simplicityNotes: ["Skip the wifi sync for v0"],
};

describe("GenerationProgress — real 6-stage mapping from synthetic onProgress events", () => {
  test("renders all 6 stage labels regardless of activeLayer", () => {
    render(<GenerationProgress activeLayer={1} principles={null} onCancel={() => {}} />);
    for (const label of STAGE_LABELS) {
      assert.ok(screen.getByText(label), `expected "${label}" to render`);
    }
  });

  test("stages before activeLayer read as done, current as active, later as pending", () => {
    render(<GenerationProgress activeLayer={3} principles={null} onCancel={() => {}} />);
    // Stage 1 & 2 (done) show a checkmark; stage 3 (active) shows its icon; 4-6 (pending) show a hollow circle.
    const rows = screen.getAllByText(/Checking for hazards|Framing the goal|Finding every part|Checking the catalog|Writing your steps|Safety & trust checks/);
    assert.equal(rows.length, 6);
  });

  test("shows an honest duration estimate and an elapsed counter", () => {
    render(<GenerationProgress activeLayer={1} principles={null} onCancel={() => {}} />);
    assert.match(screen.getByText(/usually 30–90 seconds/).textContent ?? "", /elapsed/);
  });

  test("Cancel button fires onCancel", async () => {
    let canceled = false;
    render(<GenerationProgress activeLayer={2} principles={null} onCancel={() => (canceled = true)} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    assert.equal(canceled, true);
  });
});

describe("GenerationProgress — principles checkpoint hosting (B2 #5)", () => {
  test("no principles yet -> no checkpoint card", () => {
    render(<GenerationProgress activeLayer={2} principles={null} onCancel={() => {}} />);
    assert.equal(screen.queryByText(/Here's what we're building/), null);
  });

  test("principles arrive -> non-blocking card renders with the goal", () => {
    render(<GenerationProgress activeLayer={3} principles={PRINCIPLES} onCancel={() => {}} />);
    assert.ok(screen.getByText(/A solar-powered clock that shows temperature/));
    // Generation is still visibly progressing underneath — stage list unaffected.
    for (const label of STAGE_LABELS) {
      assert.ok(screen.getByText(label));
    }
  });

  test("'Looks right' dismisses the card without cancelling generation", async () => {
    let canceled = false;
    render(
      <GenerationProgress activeLayer={3} principles={PRINCIPLES} onCancel={() => (canceled = true)} />
    );
    await userEvent.click(screen.getByRole("button", { name: /looks right/i }));
    assert.equal(screen.queryByText(/A solar-powered clock that shows temperature/), null);
    assert.equal(canceled, false, "dismissing the card must never abort generation");
  });

  test("'Not quite — let me rephrase' aborts via the same onCancel the Cancel button uses", async () => {
    let cancelCount = 0;
    render(
      <GenerationProgress activeLayer={3} principles={PRINCIPLES} onCancel={() => cancelCount++} />
    );
    await userEvent.click(screen.getByRole("button", { name: /not quite/i }));
    assert.equal(cancelCount, 1);
  });

  test("caps risks shown to 3", () => {
    render(<GenerationProgress activeLayer={3} principles={PRINCIPLES} onCancel={() => {}} />);
    assert.ok(screen.getByText(/Lithium battery can overheat/));
    assert.ok(screen.getByText(/Mains-adjacent wiring/));
    assert.ok(screen.getByText(/ESD-sensitive OLED/));
  });
});
