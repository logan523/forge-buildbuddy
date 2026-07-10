import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkApiGuards, _resetApiGuards } from "./api-guards";

const NOW = 1_800_000_000_000; // fixed instant

beforeEach(() => {
  _resetApiGuards();
  delete process.env.STEP_HELP_DAILY_CAP;
});

test("oversized input is rejected 413 with a friendly message", () => {
  const r = checkApiGuards("step-help", "1.2.3.4", 9_000, NOW);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 413);
    assert.match(r.message, /too large/i);
  }
});

test("per-IP bucket allows the window quota then 429s; other IPs unaffected", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(checkApiGuards("step-help", "1.1.1.1", 100, NOW + i).ok, true);
  }
  const blocked = checkApiGuards("step-help", "1.1.1.1", 100, NOW + 11);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.status, 429);

  assert.equal(checkApiGuards("step-help", "2.2.2.2", 100, NOW + 12).ok, true);
});

test("per-IP bucket resets after the window", () => {
  for (let i = 0; i < 10; i++) checkApiGuards("step-help", "3.3.3.3", 100, NOW);
  assert.equal(checkApiGuards("step-help", "3.3.3.3", 100, NOW + 1).ok, false);
  assert.equal(
    checkApiGuards("step-help", "3.3.3.3", 100, NOW + 10 * 60_000 + 1).ok,
    true,
    "new window, new quota"
  );
});

test("global daily cap (env-configured) fail-closes across ALL IPs", () => {
  process.env.STEP_HELP_DAILY_CAP = "2";
  assert.equal(checkApiGuards("step-help", "a", 100, NOW).ok, true);
  assert.equal(checkApiGuards("step-help", "b", 100, NOW + 1).ok, true);
  const capped = checkApiGuards("step-help", "c", 100, NOW + 2);
  assert.equal(capped.ok, false);
  if (!capped.ok) {
    assert.equal(capped.status, 429);
    assert.match(capped.message, /cap|resets tomorrow/i);
  }
  // Next day: counter rolls over.
  assert.equal(checkApiGuards("step-help", "c", 100, NOW + 24 * 3_600_000).ok, true);
});

test("routes have independent daily counters", () => {
  process.env.STEP_HELP_DAILY_CAP = "1";
  assert.equal(checkApiGuards("step-help", "x", 100, NOW).ok, true);
  assert.equal(checkApiGuards("step-help", "x2", 100, NOW).ok, false);
  assert.equal(checkApiGuards("analyze", "x", 100, NOW).ok, true, "analyze unaffected");
});
