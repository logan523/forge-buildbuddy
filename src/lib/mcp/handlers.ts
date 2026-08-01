/**
 * Forge MCP tool handlers — pure invoke surface for offline tools
 * (docs/FORGE-AGENTIC-EXPANSION.md Layer A). Live serial/flash stay
 * browser-bound; they are listed but return `live-required`.
 *
 * Usage:
 *   import { invokeForgeTool } from "@/lib/mcp/handlers";
 *   const out = invokeForgeTool("audit_plan", { plan });
 *
 * A future stdio MCP server can wrap invokeForgeTool without re-implementing domain logic.
 */

import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { attachCompiledFacts } from "@/lib/steps/compile";
import { validateStepContent } from "@/lib/steps/validate";
import { auditConformance } from "@/lib/electrical/conformance";
import { auditPlanHarness } from "@/lib/product-3d/harness-conformance";
import { auditPlanRender } from "@/lib/product-3d/step-render-audit";
import { isolatePartIds } from "@/lib/stage/step-isolation";
import { buildWirePlan } from "@/lib/stage/wire-plan";
import { buildProductScene3D } from "@/lib/product-3d/build-scene";
import { resolveAssemblyRecipe } from "@/lib/stage/derive-recipe";
import { matchSkills, skillsDigest } from "@/lib/skills";
import { stepKind } from "@/lib/steps/classify";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import { runAllOfflineTasks, runTask, type TaskId } from "@/lib/tasks";
import {
  resolveBuildDoneGate,
  initialWiringVerifyStatus,
  type WiringVerifyStatus,
} from "@/lib/build-done-gate";

export const FORGE_MCP_TOOLS = [
  "compile_plan",
  "run_erc",
  "get_step_facts",
  "audit_plan",
  "match_skills",
  "run_tasks",
  "build_done_gate",
  "expected_i2c",
  "isolate_step",
  "build_wire_plan",
  // Live — not invokable offline:
  "serial_connect",
  "flash_firmware",
  "verify_expected_devices",
] as const;

export type ForgeMcpToolName = (typeof FORGE_MCP_TOOLS)[number];

export interface ForgeMcpArgs {
  plan?: BuildPlan;
  stepNumber?: number;
  stepIndex?: number;
  wiringVerify?: WiringVerifyStatus;
  taskId?: TaskId;
  allStepsComplete?: boolean;
}

export type ForgeMcpResult =
  | { ok: true; tool: string; data: unknown }
  | { ok: false; tool: string; error: string; code?: "live-required" | "bad-args" | "not-found" };

function requirePlan(args: ForgeMcpArgs): BuildPlan | ForgeMcpResult {
  if (!args.plan) {
    return { ok: false, tool: "?", error: "plan is required", code: "bad-args" };
  }
  return applyTrustPipeline(JSON.parse(JSON.stringify(args.plan)) as BuildPlan);
}

export function invokeForgeTool(name: string, args: ForgeMcpArgs = {}): ForgeMcpResult {
  if (name === "serial_connect" || name === "flash_firmware" || name === "verify_expected_devices") {
    return {
      ok: false,
      tool: name,
      error: "Live board tool — requires browser Web Serial session",
      code: "live-required",
    };
  }

  if (!FORGE_MCP_TOOLS.includes(name as ForgeMcpToolName) && name !== "list_tools") {
    return { ok: false, tool: name, error: `unknown tool: ${name}`, code: "not-found" };
  }

  if (name === "list_tools") {
    return { ok: true, tool: name, data: { tools: [...FORGE_MCP_TOOLS] } };
  }

  const planOrErr = requirePlan(args);
  if ("ok" in planOrErr && planOrErr.ok === false) {
    return { ...planOrErr, tool: name };
  }
  const plan = planOrErr as BuildPlan;

  switch (name) {
    case "compile_plan": {
      const compiled = attachCompiledFacts(plan);
      return {
        ok: true,
        tool: name,
        data: {
          status: compiled.compiledFacts?.status,
          unassigned: compiled.compiledFacts?.unassigned?.length ?? 0,
          issues: compiled.compiledFacts?.issues ?? [],
          stepsWithFacts: (compiled.steps || []).filter((s) => s.compiled?.connections?.length).length,
        },
      };
    }
    case "run_erc": {
      return {
        ok: true,
        tool: name,
        data: plan.electrical?.erc ?? { available: false },
      };
    }
    case "get_step_facts": {
      const n = args.stepNumber;
      const step = (plan.steps || []).find((s) => s.stepNumber === n);
      if (!step) {
        return { ok: false, tool: name, error: `step ${n} not found`, code: "not-found" };
      }
      return {
        ok: true,
        tool: name,
        data: {
          stepNumber: step.stepNumber,
          title: step.title,
          kind: stepKind(step),
          compiled: step.compiled ?? null,
        },
      };
    }
    case "audit_plan": {
      return {
        ok: true,
        tool: name,
        data: {
          table: auditConformance(plan),
          harness: auditPlanHarness(plan),
          render: auditPlanRender(plan),
          contentIssues: validateStepContent(plan),
        },
      };
    }
    case "match_skills": {
      const step =
        args.stepNumber != null
          ? (plan.steps || []).find((s) => s.stepNumber === args.stepNumber)
          : plan.steps?.[args.stepIndex ?? 0];
      const netClasses = (step?.compiled?.connections ?? []).map((c) => c.netClass);
      const skills = matchSkills({
        stepKind: step ? stepKind(step) : undefined,
        netClasses,
        stepBlob: step ? `${step.title} ${step.description || ""}` : "",
      });
      return {
        ok: true,
        tool: name,
        data: { skills: skills.map((s) => ({ id: s.id, name: s.name, tools: s.tools })), digest: skillsDigest(skills) },
      };
    }
    case "run_tasks": {
      if (args.taskId) {
        return { ok: true, tool: name, data: runTask(args.taskId, plan) };
      }
      return { ok: true, tool: name, data: runAllOfflineTasks(plan) };
    }
    case "build_done_gate": {
      const expected = expectedI2cAddresses(plan).length;
      const wiringVerify =
        args.wiringVerify ?? initialWiringVerifyStatus(expected);
      return {
        ok: true,
        tool: name,
        data: resolveBuildDoneGate({
          allStepsComplete: !!args.allStepsComplete,
          expectedI2cCount: expected,
          wiringVerify,
        }),
      };
    }
    case "expected_i2c": {
      return { ok: true, tool: name, data: expectedI2cAddresses(plan) };
    }
    case "isolate_step": {
      const step =
        args.stepNumber != null
          ? (plan.steps || []).find((s) => s.stepNumber === args.stepNumber)
          : undefined;
      const partIds = isolatePartIds(step?.compiled?.focusPartIds, null);
      return { ok: true, tool: name, data: { focusPartIds: partIds } };
    }
    case "build_wire_plan": {
      const scene = buildProductScene3D(plan);
      const recipe = resolveAssemblyRecipe(scene, plan);
      const wirePlan = buildWirePlan(scene, plan, recipe);
      return {
        ok: true,
        tool: name,
        data: {
          wireCount: wirePlan.wires.length,
          callouts: wirePlan.wires.map((w) => w.callout).slice(0, 40),
        },
      };
    }
    default:
      return { ok: false, tool: name, error: `unhandled tool: ${name}`, code: "not-found" };
  }
}
