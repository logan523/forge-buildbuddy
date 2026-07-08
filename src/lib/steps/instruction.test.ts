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
