import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { TASKS } from "./catalog";
import { runAllOfflineTasks, runTask } from "./run";

function demo(): BuildPlan {
  return applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
}

describe("task explorer", () => {
  it("v1 catalog has T01–T06 offline", () => {
    assert.equal(TASKS.length, 6);
    assert.deepEqual(
      TASKS.map((t) => t.id),
      ["T01", "T02", "T03", "T04", "T05", "T06"]
    );
    assert.ok(TASKS.every((t) => t.offline));
  });

  it("all offline tasks pass on Sat Line demo", () => {
    const reports = runAllOfflineTasks(demo());
    for (const r of reports) {
      assert.equal(
        r.pass,
        true,
        `${r.taskId} ${r.title}: ${r.checks
          .filter((c) => !c.pass)
          .map((c) => c.detail)
          .join("; ")}`
      );
    }
  });

  it("T04 fails if we poison focus on a wiring step", () => {
    const plan = demo();
    const wiring = plan.steps.find((s) => s.compiled?.focusPartIds?.length);
    assert.ok(wiring);
    wiring!.compiled!.focusPartIds = ["not-a-real-part-id-xyz"];
    // Render audit may error; harness/table might still pass — T04 includes render-clean.
    const r = runTask("T04", plan);
    // Either render-clean fails or we still pass table — assert the poison is detectable somehow.
    const renderCheck = r.checks.find((c) => c.id === "render-clean");
    assert.ok(renderCheck);
    // Phantom focus → FOCUS_UNRESOLVED error → render-clean false
    assert.equal(renderCheck!.pass, false);
  });
});
