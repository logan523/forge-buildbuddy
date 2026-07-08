import type { BuildPlan } from "@/lib/types";
import { buildElectricalModel, structuredNetsFromModel } from "./netlist";
import { sanitizeStructuredNets } from "./schema";
import type { ElectricalModel } from "./types";

export type { ElectricalModel, ErcReport, ErcViolation, TrustGrade } from "./types";
export { buildElectricalModel, structuredNetsFromModel } from "./netlist";
export { runErc, ercToSafetyFindings } from "./erc";
export {
  parseStructuredNets,
  sanitizeStructuredNets,
  StructuredNetSchema,
  StructuredNetMemberSchema,
} from "./schema";
export { presentErc } from "./present";

/** Attach electrical model + ERC; hydrate structuredNets when missing. */
export function attachElectrical(plan: BuildPlan): BuildPlan {
  // Zod-coerce LLM/untrusted nets before netlist — invalid → fall back to free-text
  const { structuredNets: sanitized, parseIssues } = sanitizeStructuredNets(plan.structuredNets);
  const planForModel: BuildPlan = {
    ...plan,
    structuredNets: sanitized,
  };

  const electrical = buildElectricalModel(planForModel);
  // Stamp component refs onto parts for UI / LLM continuity
  const refByPartId = new Map(electrical.components.map((c) => [c.partId, c.ref]));
  const parts = (plan.parts || []).map((p) => ({
    ...p,
    ref: refByPartId.get(p.id) || p.ref,
  }));

  const structuredNets =
    sanitized && sanitized.length > 0 ? sanitized : structuredNetsFromModel(electrical);

  // Surface parse issues as electrical meta (non-blocking)
  if (parseIssues.length > 0) {
    electrical.unboundEdges = [
      ...(electrical.unboundEdges || []),
      ...parseIssues.slice(0, 12).map((msg) => ({
        from: "structuredNets",
        to: "schema",
        reason: msg,
      })),
    ];
  }

  return {
    ...plan,
    parts,
    structuredNets,
    electrical,
  };
}

export function formatErcSummary(model: ElectricalModel | undefined): string {
  if (!model) return "No electrical model";
  return model.erc.summary;
}
