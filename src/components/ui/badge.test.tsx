import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import { Badge, confidenceTier } from "./badge";

afterEach(() => cleanup());

test("Badge renders its content", () => {
  render(<Badge tone="success">Catalog match</Badge>);
  assert.ok(screen.getByText("Catalog match"));
});

test("confidenceTier: score >= 55 is a catalog match (success)", () => {
  assert.deepEqual(confidenceTier(55), { label: "Catalog match", tone: "success" });
  assert.deepEqual(confidenceTier(90), { label: "Catalog match", tone: "success" });
});

test("confidenceTier: boundary just under 55 falls to likely match (info)", () => {
  assert.deepEqual(confidenceTier(54), { label: "Likely match", tone: "info" });
});

test("confidenceTier: 30-54 is a likely match (info)", () => {
  assert.deepEqual(confidenceTier(30), { label: "Likely match", tone: "info" });
  assert.deepEqual(confidenceTier(40), { label: "Likely match", tone: "info" });
});

test("confidenceTier: below 30, or null/undefined, is a best guess (warning)", () => {
  const bestGuess = { label: "Best guess — check the spec", tone: "warning" };
  assert.deepEqual(confidenceTier(29), bestGuess);
  assert.deepEqual(confidenceTier(0), bestGuess);
  assert.deepEqual(confidenceTier(null), bestGuess);
  assert.deepEqual(confidenceTier(undefined), bestGuess);
});
