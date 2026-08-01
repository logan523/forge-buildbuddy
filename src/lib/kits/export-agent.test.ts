import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { exportKitAgentPack, kitAgentPackFiles, kitAgentPackBundle } from "./export-agent";

describe("kit agent pack", () => {
  it("exports skill md + recommended skills for sat-line", () => {
    const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
    const pack = exportKitAgentPack(plan, { authorName: "Forge" });
    assert.ok(pack.slug.length > 0);
    assert.match(pack.skillMd, /Kit:/);
    assert.ok(pack.recommendedSkillIds.length >= 1, pack.recommendedSkillIds.join(","));
    assert.ok(pack.expectedI2c.length >= 1);
    assert.ok(pack.tools.includes("audit_plan"));
  });

  it("kitAgentPackFiles includes plan.json and SKILL", () => {
    const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
    const pack = exportKitAgentPack(plan);
    const files = kitAgentPackFiles(plan, pack);
    assert.ok(files.some((f) => f.filename.endsWith("-plan.json")));
    assert.ok(files.some((f) => f.filename.endsWith("-SKILL.md")));
    assert.ok(files.length >= 4);
  });

  it("kitAgentPackBundle is one object with nested files", () => {
    const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
    const pack = exportKitAgentPack(plan);
    const bundle = kitAgentPackBundle(plan, pack);
    assert.equal(bundle.version, 1);
    assert.ok(bundle.files["SKILL.md"]);
    assert.ok(bundle.files["plan.json"]);
    assert.ok(JSON.parse(bundle.files["plan.json"]).title);
  });
});
