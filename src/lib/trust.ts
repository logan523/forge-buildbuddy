import type { BuildPlan, Part } from "./types";
import { enrichParts } from "./catalog";
import { attachBuyData, estimateBom } from "./cart";
import { applySafetyToPlan, validatePlan } from "./validators";
import { attachElectrical, ercToSafetyFindings } from "./electrical";
import { attachCompiledFacts } from "./steps/compile";
import { validateStepContent, stepIssuesToSafetyFindings } from "./steps/validate";
import { diagLog } from "./diag";
import type { BuildReality } from "./build-reality/types";
import { netColorFor, wireColorName } from "./wire-colors";

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
/**
 * Stamp the builder's declared wire colors onto the electrical model (R2 /
 * eng E3). This is THE one place reality touches color resolution — every
 * renderer (compile, 2D sheets, 3D harness, panels) reads the stamped
 * fields with a canonical fallback. Only runs when declarations exist, so a
 * plan with no reality compiles byte-identical to before.
 */
function stampRealityColors(plan: BuildPlan, reality: BuildReality): BuildPlan {
  const model = plan.electrical;
  if (!model) return plan;
  const byNet = reality.wireColors.byNet;
  const byConnection = reality.wireColors.byConnection;
  if (Object.keys(byNet).length === 0 && Object.keys(byConnection).length === 0) return plan;

  const nets = model.nets.map((net) => {
    const netDecl = byNet[net.name.toLowerCase()];
    const memberColorOverrides: NonNullable<typeof net.memberColorOverrides> = {};
    for (const m of net.members || []) {
      // Connection ids are hub-relative (`net:ref:pin` for the non-hub leg);
      // a per-connection declaration maps to the member that leg lands on.
      const decl = byConnection[`${net.name}:${m.ref}:${m.pin}`];
      if (decl) memberColorOverrides[`${m.ref}:${m.pin}`] = { hex: decl.hex, name: decl.name, label: decl.label };
    }
    const hasMemberOverrides = Object.keys(memberColorOverrides).length > 0;
    if (!netDecl && !hasMemberOverrides) return net;
    const canonicalHex = netColorFor(net.netClass, undefined, net.name);
    return {
      ...net,
      displayColorHex: netDecl?.hex ?? canonicalHex,
      displayColorName: netDecl?.name ?? wireColorName(canonicalHex),
      displayColorLabel: netDecl?.label,
      displayColorSource: (netDecl ? "user" : "authority") as "user" | "authority",
      ...(hasMemberOverrides ? { memberColorOverrides } : {}),
    };
  });
  return { ...plan, electrical: { ...model, nets } };
}

export function applyTrustPipeline(plan: BuildPlan, reality?: BuildReality): BuildPlan {
  const parts: Part[] = attachBuyData(enrichParts(plan.parts || []));
  const withParts: BuildPlan = {
    ...plan,
    parts,
    wiringConnections: plan.wiringConnections || [],
    warnings: plan.warnings || [],
    tools: plan.tools || [],
    steps: plan.steps || [],
  };

  let withElectrical = attachElectrical(withParts);
  if (reality) withElectrical = stampRealityColors(withElectrical, reality);

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
