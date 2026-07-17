import "../../test-utils/dom";
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrinciplesCheck } from "./principles-check";
import type { PrinciplesResult } from "@/lib/pipeline/types";

afterEach(() => cleanup());

const BASE: PrinciplesResult = {
  functionalGoal: "A weather station that logs temperature and humidity outdoors",
  constraints: ["Battery must last a week"],
  risks: ["Outdoor enclosure needs weatherproofing", "Li-ion cell needs a protection circuit"],
  simplicityNotes: ["Skip the display for v0"],
};

describe("PrinciplesCheck — plain-language checkpoint card", () => {
  test("shows the functional goal inline in beginner-plain copy", () => {
    render(<PrinciplesCheck principles={BASE} onLooksRight={() => {}} onRephrase={() => {}} />);
    assert.ok(screen.getByText(/Here's what we're building/));
    assert.ok(screen.getByText(/A weather station that logs temperature and humidity outdoors/));
  });

  test("lists up to 3 risks in plain language", () => {
    render(<PrinciplesCheck principles={BASE} onLooksRight={() => {}} onRephrase={() => {}} />);
    assert.ok(screen.getByText(/Outdoor enclosure needs weatherproofing/));
    assert.ok(screen.getByText(/Li-ion cell needs a protection circuit/));
  });

  test("caps risk list at 3 even when more are supplied", () => {
    const many: PrinciplesResult = {
      ...BASE,
      risks: ["risk one", "risk two", "risk three", "risk four", "risk five"],
    };
    render(<PrinciplesCheck principles={many} onLooksRight={() => {}} onRephrase={() => {}} />);
    assert.ok(screen.getByText("risk one"));
    assert.ok(screen.getByText("risk two"));
    assert.ok(screen.getByText("risk three"));
    assert.equal(screen.queryByText("risk four"), null);
    assert.equal(screen.queryByText("risk five"), null);
  });

  test("renders cleanly with zero risks (no empty list, no crash)", () => {
    const noRisks: PrinciplesResult = { ...BASE, risks: [] };
    render(<PrinciplesCheck principles={noRisks} onLooksRight={() => {}} onRephrase={() => {}} />);
    assert.ok(screen.getByText(/Here's what we're building/));
  });

  test("'Looks right' calls onLooksRight only", async () => {
    let looksRight = 0;
    let rephrase = 0;
    render(
      <PrinciplesCheck
        principles={BASE}
        onLooksRight={() => looksRight++}
        onRephrase={() => rephrase++}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /looks right/i }));
    assert.equal(looksRight, 1);
    assert.equal(rephrase, 0);
  });

  test("'Not quite — let me rephrase' calls onRephrase only", async () => {
    let looksRight = 0;
    let rephrase = 0;
    render(
      <PrinciplesCheck
        principles={BASE}
        onLooksRight={() => looksRight++}
        onRephrase={() => rephrase++}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /not quite — let me rephrase/i }));
    assert.equal(rephrase, 1);
    assert.equal(looksRight, 0);
  });
});
