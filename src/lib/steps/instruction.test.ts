import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveActions, resolveGoal, resolveDoneWhen } from "./instruction";
import demo from "@/data/sat-line.json";
import type { BuildStep } from "@/lib/types";

describe("instruction resolve", () => {
  it("sat-line step 2 has structured beginner actions", () => {
    const step = (demo.steps as BuildStep[]).find((s) => s.stepNumber === 2)!;
    assert.ok(step);
    assert.ok((step.actions?.length || 0) >= 3);
    assert.ok(step.goal || step.quickSummary);
    assert.ok((step.youNeed?.length || 0) >= 2);
    const actions = resolveActions(step);
    assert.ok(actions.length >= 3);
    assert.match(actions[0].text, /./);
  });

  it("falls back to description sentences", () => {
    const step: BuildStep = {
      stepNumber: 1,
      title: "T",
      description: "First do this carefully. Then do that next. Finally check.",
    };
    const a = resolveActions(step);
    assert.ok(a.length >= 2);
  });

  it("resolveGoal prefers goal field", () => {
    assert.equal(
      resolveGoal({ stepNumber: 1, title: "T", description: "Long.", goal: "Short goal." }),
      "Short goal."
    );
  });

  it("wiring goal diets long LLM prose down to compiled connections", () => {
    const step: BuildStep = {
      stepNumber: 6,
      title: "Wire the OLED",
      description:
        "This is a long multi-sentence description that should never be the goal. It goes on and on about soldering philosophy.",
      goal: "A very long authored goal that exceeds the kitchen-table soft cap and would wrap into an intimidating wall of text on a phone screen for a beginner.",
      compiled: {
        connections: [
          {
            id: "1",
            netName: "I2C_SDA",
            netClass: "i2c",
            fromRef: "U1",
            fromPin: "GPIO4",
            fromLabel: "ESP32-C3",
            toRef: "U2",
            toPin: "SDA",
            toLabel: "OLED",
            colorHex: "#2563eb",
            colorName: "blue",
            grade: "consistent",
          },
          {
            id: "2",
            netName: "I2C_SCL",
            netClass: "i2c",
            fromRef: "U1",
            fromPin: "GPIO5",
            fromLabel: "ESP32-C3",
            toRef: "U2",
            toPin: "SCL",
            toLabel: "OLED",
            colorHex: "#eab308",
            colorName: "yellow",
            grade: "consistent",
          },
        ],
        checks: [],
      },
    };
    const goal = resolveGoal(step);
    assert.match(goal, /2 connections/i);
    assert.ok(goal.length <= 110, `goal should be short, got ${goal.length}: ${goal}`);
    assert.ok(!goal.includes("soldering philosophy"));
  });

  it("wiring with compiled facts does not invent prose actions", () => {
    const step: BuildStep = {
      stepNumber: 6,
      title: "Wire SDA",
      description: "Carefully route the data line around the frame. Then tidy the harness.",
      compiled: {
        connections: [
          {
            id: "1",
            netName: "I2C_SDA",
            netClass: "i2c",
            fromRef: "U1",
            fromPin: "GPIO4",
            fromLabel: "ESP32-C3",
            toRef: "U2",
            toPin: "SDA",
            toLabel: "OLED",
            colorHex: "#2563eb",
            colorName: "blue",
            grade: "consistent",
          },
        ],
        checks: [],
        microSteps: [],
      },
    };
    // Empty microSteps array still has connections — no description bullets.
    assert.equal(resolveActions(step).length, 0);
  });

  it("resolveDoneWhen prefers doneWhen", () => {
    assert.equal(
      resolveDoneWhen({
        stepNumber: 1,
        title: "T",
        description: "x",
        doneWhen: "Pads clean.",
        afterState: "other",
      }),
      "Pads clean."
    );
  });
});
