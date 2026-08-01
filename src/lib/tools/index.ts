/**
 * Forge tools facade — the ability half of the agentic architecture
 * (docs/FORGE-AGENTIC-EXPANSION.md). UI, future MCP, and skills should call
 * these instead of reaching into domain modules ad hoc.
 *
 * Static tools work without a board. Live serial/flash stay in their modules
 * until a stable session handle is threaded here (P1.3).
 */

export { attachCompiledFacts } from "@/lib/steps/compile";
export { validateStepContent } from "@/lib/steps/validate";
export { stepKind, kindLabel } from "@/lib/steps/classify";

export { auditConformance } from "@/lib/electrical/conformance";
export type { ConformanceReport } from "@/lib/electrical/conformance";

export {
  auditPlanRender,
  auditStepRender,
  scrubForStep,
} from "@/lib/product-3d/step-render-audit";
export type { StepRenderFinding } from "@/lib/product-3d/step-render-audit";

export {
  auditPlanHarness,
  auditHarnessRoutes,
} from "@/lib/product-3d/harness-conformance";
export type { HarnessConformanceReport } from "@/lib/product-3d/harness-conformance";

export {
  isolatePartIds,
  isolateNodeIds,
  filterNodesForIsolation,
  filterWiresForIsolation,
} from "@/lib/stage/step-isolation";

export { buildWirePlan } from "@/lib/stage/wire-plan";
export type { WirePlan, PlannedWire } from "@/lib/stage/wire-plan";

export { resolveGoal, resolveActions, resolveDoneWhen } from "@/lib/steps/instruction";

export { matchSkills, skillsDigest, SKILLS } from "@/lib/skills";
export { runAllOfflineTasks, runTask, TASKS } from "@/lib/tasks";
export {
  resolveBuildDoneGate,
  initialWiringVerifyStatus,
} from "@/lib/build-done-gate";
export type { WiringVerifyStatus, BuildDoneGate } from "@/lib/build-done-gate";
export { expectedI2cAddresses } from "@/lib/serial/expected-devices";
export { invokeForgeTool, FORGE_MCP_TOOLS } from "@/lib/mcp/handlers";
export { handleMcpMessage, parseMcpLine } from "@/lib/mcp/protocol";
export { listForgeResources, readForgeResource } from "@/lib/mcp/resources";
export { allExpectedFound } from "@/lib/serial/verify";
export { exportSkillPackFiles } from "@/lib/skills/export-pack";
export {
  exportKitAgentPack,
  kitAgentPackBundle,
  downloadKitAgentPackInBrowser,
} from "@/lib/kits/export-agent";
