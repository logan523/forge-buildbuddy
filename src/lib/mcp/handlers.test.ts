import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { FORGE_MCP_TOOLS, invokeForgeTool } from "./handlers";

const plan = () => JSON.parse(JSON.stringify(satLine)) as BuildPlan;

describe("forge mcp handlers", () => {
  it("lists tools", () => {
    const r = invokeForgeTool("list_tools", {});
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok((r.data as { tools: string[] }).tools.includes("audit_plan"));
    }
  });

  it("compile_plan + audit_plan succeed on demo", () => {
    const c = invokeForgeTool("compile_plan", { plan: plan() });
    assert.equal(c.ok, true);
    const a = invokeForgeTool("audit_plan", { plan: plan() });
    assert.equal(a.ok, true);
    if (a.ok) {
      const data = a.data as {
        table: { traced: boolean };
        harness: { traced: boolean };
        render: { severity: string }[];
      };
      assert.equal(data.table.traced, true);
      assert.equal(data.harness.traced, true);
      assert.equal(data.render.filter((f) => f.severity === "error").length, 0);
    }
  });

  it("get_step_facts returns compiled for a wiring step", () => {
    const p = plan();
    // Need trust pipeline for compiled — invokeForgeTool applies it.
    const r = invokeForgeTool("get_step_facts", { plan: p, stepNumber: 6 });
    assert.equal(r.ok, true);
  });

  it("match_skills returns capped skills for I2C wiring context", () => {
    const r = invokeForgeTool("match_skills", { plan: plan(), stepNumber: 6 });
    assert.equal(r.ok, true);
    if (r.ok) {
      const data = r.data as { skills: { id: string }[] };
      assert.ok(data.skills.length <= 3);
    }
  });

  it("run_tasks offline suite passes", () => {
    const r = invokeForgeTool("run_tasks", { plan: plan() });
    assert.equal(r.ok, true);
    if (r.ok) {
      const reports = r.data as { pass: boolean }[];
      assert.ok(reports.every((x) => x.pass));
    }
  });

  it("live tools refuse offline", () => {
    const r = invokeForgeTool("flash_firmware", { plan: plan() });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "live-required");
  });

  it("unknown tool fails closed", () => {
    const r = invokeForgeTool("make_coffee", { plan: plan() });
    assert.equal(r.ok, false);
  });

  it("catalog length is stable", () => {
    assert.ok(FORGE_MCP_TOOLS.length >= 10);
  });
});
