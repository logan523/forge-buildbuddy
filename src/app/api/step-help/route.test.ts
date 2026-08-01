import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleStepHelp } from "./route";
import { _resetApiGuards } from "@/lib/api-guards";

beforeEach(() => {
  _resetApiGuards();
  delete process.env.STEP_HELP_DAILY_CAP;
});

const okComplete = async () => "Use the blue wire from ESP32-C3 pin GPIO4 to the OLED pin SDA.";

test("400 on missing/empty question", async () => {
  const r = await handleStepHelp({ question: "  " }, "ip", okComplete);
  assert.equal(r.status, 400);
});

test("413 on over-long question", async () => {
  const r = await handleStepHelp({ question: "x".repeat(501) }, "ip", okComplete);
  assert.equal(r.status, 413);
});

test("200: prompt carries the derived connections verbatim + the question", async () => {
  let captured = "";
  let system = "";
  const r = await handleStepHelp(
    {
      question: "Which end is SDA?",
      stepTitle: "Wire the display",
      connections: [
        {
          colorName: "blue",
          fromLabel: "ESP32-C3",
          fromPin: "GPIO4",
          toLabel: "OLED Display",
          toPin: "SDA",
          netName: "SDA",
        },
      ],
      checks: [{ instruction: "Multimeter VCC↔GND", expected: "3.2–3.4 V" }],
      skillsDigest: "[i2c-ssd1306] SDA is blue, SCL is yellow.",
    },
    "ip",
    async (sys, user) => {
      system = sys;
      captured = user;
      return "Answer.";
    }
  );
  assert.equal(r.status, 200);
  assert.ok(captured.includes("blue wire: ESP32-C3 pin GPIO4 → OLED Display pin SDA"));
  assert.ok(captured.includes("Which end is SDA?"));
  assert.ok(captured.includes("3.2–3.4 V"));
  assert.ok(captured.includes("SKILLS"));
  assert.ok(captured.includes("i2c-ssd1306"));
  assert.match(system, /SKILLS/i);
  assert.match(system, /connections still win|DERIVED CONNECTIONS/i);
});

test("502 fail-closed when the model throws or returns nothing", async () => {
  const boom = await handleStepHelp({ question: "help" }, "ip", async () => {
    throw new Error("api down");
  });
  assert.equal(boom.status, 502);
  assert.ok("fallback" in boom.body && boom.body.fallback === "unstick");

  const empty = await handleStepHelp({ question: "help" }, "ip", async () => "   ");
  assert.equal(empty.status, 502);
});

test("429 when the daily cap is exhausted (spend circuit-breaker)", async () => {
  process.env.STEP_HELP_DAILY_CAP = "1";
  const first = await handleStepHelp({ question: "one" }, "ip", okComplete);
  assert.equal(first.status, 200);
  const second = await handleStepHelp({ question: "two" }, "other-ip", okComplete);
  assert.equal(second.status, 429);
  if ("error" in second.body) assert.match(second.body.error, /cap/i);
});
