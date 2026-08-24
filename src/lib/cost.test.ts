import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "@/lib/claim";
import { planCostClaim } from "./cost";
import type { BuildPlan } from "@/lib/types";

const plan = (over: Partial<BuildPlan>): BuildPlan => ({ id: "p", title: "t", ...over } as BuildPlan);
const text = (p: BuildPlan) => fold<string, string>(planCostClaim(p), { known: (v) => v, unknown: (n) => n });

test("real part prices beat the authored guess", () => {
  // The live contradiction: header said "$25-40", body said "~$60.10 ·
  // typically $29.70–$90.50". Both rendered; nothing reconciled them.
  const p = plan({
    estimatedCost: "$25-40",
    bomEstimate: { totalMin: 29.7, totalMax: 90.5, currency: "USD", pricedCount: 11, unpricedCount: 0 },
  });
  assert.equal(text(p), "$30–$91");
  assert.doesNotMatch(text(p), /25-40/, "the authored guess still leaked through");
  assert.equal(planCostClaim(p).kind, "derived");
});

test("a partial BOM says how much of the build it covers", () => {
  // A total that quietly omits four unpriced parts reads as the whole price.
  const p = plan({
    bomEstimate: { totalMin: 20, totalMax: 30, currency: "USD", pricedCount: 7, unpricedCount: 4 },
  });
  assert.equal(text(p), "$20–$30 for 7 of 11 parts");
});

test("with no BOM the authored estimate renders, labelled as a guess", () => {
  assert.equal(text(plan({ estimatedCost: "$25-40" })), "$25-40 (rough estimate)");
  // pricedCount 0 means the BOM knows nothing; it must not win.
  const none = plan({
    estimatedCost: "$25-40",
    bomEstimate: { totalMin: 0, totalMax: 0, currency: "USD", pricedCount: 0, unpricedCount: 11 },
  });
  assert.match(text(none), /rough estimate/);
});

test("with nothing at all it is unknown, not $0", () => {
  const c = planCostClaim(plan({}));
  assert.equal(c.kind, "unknown");
  assert.doesNotMatch(text(plan({})), /\$0/, "rendered a free build");
});
