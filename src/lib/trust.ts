import type { BuildPlan, Part } from "./types";
import { enrichParts } from "./catalog";
import { attachBuyData, estimateBom } from "./cart";
import { applySafetyToPlan, validatePlan } from "./validators";
import { attachElectrical, ercToSafetyFindings } from "./electrical";
import { attachCompiledFacts } from "./steps/compile";
import { validateStepContent, stepIssuesToSafetyFindings } from "./steps/validate";
import { diagLog } from "./diag";

/**
 * Post-LLM trust + electrical + buy pipeline (pure TypeScript):
 *
 *   raw plan
 *      │
 *      ├─► enrichParts / attachBuyData
 *      ├─► attachElectrical (netlist + ERC)  ← principal-EE authority
 *      ├─► validatePlan (heuristic safety) + merge ERC findings
 *      └─► estimateBom
 *
 * No network. No LLM. Deterministic.
 */
export function applyTrustPipeline(plan: BuildPlan): BuildPlan {
  const parts: Part[] = attachBuyData(enrichParts(plan.parts || []));
  const withParts: BuildPlan = {
    ...plan,
    parts,
    wiringConnections: plan.wiringConnections || [],
    warnings: plan.warnings || [],
    tools: plan.tools || [],
    steps: plan.steps || [],
  };

  const withElectrical = attachElectrical(withParts);

  // Instruction compiler + content validator — NEVER blocks plan load (F1).
  // On failure the plan renders without derived facts, with a visible banner
  // (compiledFacts.status === "failed") and a diagnostics entry.
  let withFacts = withElectrical;
  try {
    withFacts = attachCompiledFacts(withElectrical);
    const issues = validateStepContent(withFacts);
    withFacts = {
      ...withFacts,
      compiledFacts: { ...withFacts.compiledFacts!, issues },
    };
  } catch (e) {
    diagLog("compile_error", `instruction compiler failed: ${String(e)}`);
    withFacts = {
      ...withElectrical,
      compiledFacts: { status: "failed", unassigned: [], issues: [] },
    };
  }

  const report = validatePlan(withFacts);

  // Merge ERC violations into safety report (errors → critical)
  const ercFindings = withFacts.electrical
    ? ercToSafetyFindings(withFacts.electrical.erc)
    : [];
  // Only genuine step-safety contradictions cross into the safety channel;
  // coverage/pin/color issues stay in compiledFacts.issues (Tension A).
  ercFindings.push(...stepIssuesToSafetyFindings(withFacts.compiledFacts?.issues || []));
  const mergedIds = new Set(report.findings.map((f) => f.id));
  for (const f of ercFindings) {
    if (!mergedIds.has(f.id)) {
      report.findings.push(f);
      mergedIds.add(f.id);
    }
  }
  report.requiresAttention =
    report.requiresAttention ||
    report.findings.some((f) => f.severity === "critical") ||
    !(withFacts.electrical?.erc.clean ?? true);

  // Severity sort
  const rank = { critical: 0, warning: 1, info: 2 };
  report.findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const withSafety = applySafetyToPlan(withFacts, report);
  const bom = estimateBom(withSafety.parts, "split");

  return {
    ...withSafety,
    bomEstimate: {
      totalMin: bom.totalMin,
      totalMax: bom.totalMax,
      currency: bom.currency,
      pricedCount: bom.pricedCount,
      unpricedCount: bom.unpricedCount,
    },
  };
}
