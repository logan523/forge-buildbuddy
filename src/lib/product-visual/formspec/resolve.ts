import type { BuildPlan } from "@/lib/types";
import { parseFormSpec } from "./schema";
import { matchFormSpec } from "./match";
import { ensureLayers } from "./layers";
import type { FormSpec } from "./types";
import satLineGolden from "../__golden__/sat-line-formspec.json";

const DEMO_GOLDEN: Record<string, FormSpec> = {
  "sat-line-smart-clock": satLineGolden as FormSpec,
};

/**
 * Resolve FormSpec for a plan.
 * 1. plan.formSpec if valid
 * 2. demo golden by plan.id
 * 3. template_match from BOM
 */
export function resolveFormSpec(plan: BuildPlan): FormSpec {
  const fromPlan = parseFormSpec(plan.formSpec);
  if (fromPlan) {
    return ensureLayers(
      {
        ...fromPlan,
        source: fromPlan.source === "llm" ? "llm" : plan.formSpec?.source || fromPlan.source,
      },
      plan
    );
  }

  const golden = DEMO_GOLDEN[plan.id];
  if (golden) {
    return ensureLayers(
      {
        ...golden,
        source: "demo_golden",
        grade: "high",
        layers:
          Object.keys(golden.layers || {}).length > 0
            ? golden.layers
            : matchFormSpec(plan).layers,
      },
      plan
    );
  }

  return ensureLayers(matchFormSpec(plan), plan);
}
