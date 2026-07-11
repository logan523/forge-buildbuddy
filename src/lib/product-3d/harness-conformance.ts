/**
 * Conformance Ledger, extended to the 3D wires.
 *
 * The table audit (electrical/conformance.ts) proves the compiled CONNECTIONS
 * match the netlist. It says nothing about the rendered harness TUBES — and
 * those are where the honesty gap hides: buildHarnesses keeps only 2-member nets
 * and renders hand-authored teaching defaults (harness.ts:409-438) for the
 * power/GND rails. So a tube can be on screen with no backing net.
 *
 * This audits each rendered WireRoute3D against the verified model: a tube whose
 * netName isn't a real net is "decorative" (a teaching default, not netlist
 * truth). Pure over the routes; a convenience builds the demo's harness and runs
 * it. Makes the seal tell the truth about the 3D, not just the table.
 */

import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel } from "@/lib/electrical/types";
import type { WireRoute3D } from "./harness";
import { buildHarnesses } from "./harness";
import { buildProductScene3D } from "./build-scene";
import { getRecipeForTemplate } from "./sat-clock-recipe";
import { resolveAssemblyFrame, applyFrameToNodes } from "./assembly-recipe";

export interface HarnessConformanceIssue {
  /** The tube's net name. */
  netName: string;
  fromNodeId: string;
  toNodeId: string;
  detail: string;
}

export interface HarnessConformanceReport {
  available: boolean;
  /** True when every rendered tube traces to a real net. */
  traced: boolean;
  totalTubes: number;
  backedTubes: number;
  decorativeTubes: number;
  issues: HarnessConformanceIssue[];
}

const lc = (s: string) => s.toLowerCase().trim();

/** Pure: audit rendered tubes against the model's nets. */
export function auditHarnessRoutes(
  routes: WireRoute3D[],
  model: ElectricalModel | undefined | null
): HarnessConformanceReport {
  if (!model || !model.nets?.length) {
    return { available: false, traced: false, totalTubes: routes.length, backedTubes: 0, decorativeTubes: 0, issues: [] };
  }
  const netNames = new Set(model.nets.map((n) => lc(n.name)));
  const issues: HarnessConformanceIssue[] = [];
  let backed = 0;

  for (const r of routes) {
    if (netNames.has(lc(r.netName))) {
      backed++;
    } else {
      issues.push({
        netName: r.netName,
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        detail: `tube "${r.netName}" (${r.fromNodeId} → ${r.toNodeId}) is a teaching default — no backing net in the verified model`,
      });
    }
  }

  return {
    available: true,
    traced: issues.length === 0,
    totalTubes: routes.length,
    backedTubes: backed,
    decorativeTubes: issues.length,
    issues,
  };
}

/** Build the plan's fully-assembled harness and audit its tubes. Defensive. */
export function auditPlanHarness(plan: BuildPlan): HarnessConformanceReport {
  const empty: HarnessConformanceReport = {
    available: false, traced: false, totalTubes: 0, backedTubes: 0, decorativeTubes: 0, issues: [],
  };
  if (!plan.electrical) return empty;
  try {
    const scene = buildProductScene3D(plan);
    const recipe = getRecipeForTemplate(scene.templateId);
    if (!recipe) return empty;
    const frame = resolveAssemblyFrame(recipe, recipe.phases.length - 1);
    const nodes = applyFrameToNodes(scene.nodes, recipe, frame, 0);
    const routes = buildHarnesses({ ...scene, nodes }, plan, recipe, {
      presentNodeIds: frame.presentNodeIds,
    });
    return auditHarnessRoutes(routes, plan.electrical);
  } catch {
    return empty; // a 3D-build failure must never break the seal or the plan
  }
}
