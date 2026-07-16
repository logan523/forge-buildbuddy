import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import {
  auditHarnessRoutes,
  auditPlanHarness,
  buildProductScene3D,
} from "@/lib/product-3d";
import { resolveAssemblyRecipe } from "./derive-recipe";
import { buildWirePlan } from "./wire-plan";

const plan = applyTrustPipeline(demo as unknown as BuildPlan);
const scene = buildProductScene3D(plan);
const recipe = resolveAssemblyRecipe(scene, plan);
const wirePlan = buildWirePlan(scene, plan, recipe);

describe("wire-plan — the exact-wiring truth packet", () => {
  it("every rendered tube is backed by a verified net (ledger green, zero decorative)", () => {
    const report = auditHarnessRoutes(
      wirePlan.wires.map((w) => w.route),
      plan.electrical
    );
    assert.equal(report.available, true);
    assert.equal(report.decorativeTubes, 0, "teaching pairs are gone — no decoration");
    assert.equal(report.traced, true);
    assert.ok(report.totalTubes >= 6, `demo renders a real harness (${report.totalTubes} tubes)`);
  });

  it("tube colors are byte-identical to the compiled table's colors per net", () => {
    // The ConnectionsTable renders CompiledConnection.colorHex; the 3D tube
    // renders route.color. Same net → same hex, always.
    const compiled = (plan.steps ?? []).flatMap((s) => s.compiled?.connections ?? []);
    assert.ok(compiled.length > 0, "demo plan has compiled connections");
    const hexByNet = new Map(compiled.map((c) => [c.netName.toLowerCase(), c.colorHex]));
    let checked = 0;
    for (const w of wirePlan.wires) {
      const hex = hexByNet.get(w.route.netName.toLowerCase());
      if (!hex) continue; // nets parked in `unassigned` have no step row
      assert.equal(
        w.route.color.toLowerCase(),
        hex.toLowerCase(),
        `net ${w.route.netName}: tube ${w.route.color} vs table ${hex}`
      );
      checked++;
    }
    assert.ok(checked >= 4, `cross-checked ${checked} nets against the table`);
  });

  it("every wire carries the builder specifics: color name, endpoints, cut length", () => {
    for (const w of wirePlan.wires) {
      assert.ok(w.colorName.length >= 3, "buyable color name");
      assert.ok(w.endpoints.includes("→"), "from → to endpoints");
      assert.ok(w.lengthMm > 5 && w.lengthMm < 600, `sane cut length (${w.lengthMm}mm)`);
      assert.ok(w.callout.includes(w.route.netName));
      assert.ok(w.callout.includes(`~${w.lengthMm}mm`));
    }
  });

  it("pads exist for wire endpoints and carry pin names", () => {
    assert.ok(wirePlan.pads.length >= 8);
    for (const pad of wirePlan.pads) {
      assert.ok(pad.pin.length >= 1);
      assert.ok(pad.posMm.every((v) => Number.isFinite(v)));
    }
  });

  it("no electrical model → zero wires AND zero pads (honesty)", () => {
    const bare = { ...plan, electrical: undefined } as BuildPlan;
    const bareRecipe = resolveAssemblyRecipe(scene, bare);
    const p = buildWirePlan(scene, bare, bareRecipe);
    assert.equal(p.wires.length, 0);
    assert.equal(p.pads.length, 0);
  });

  it("auditPlanHarness accepts an injected (derived) recipe — any template auditable", () => {
    const report = auditPlanHarness(plan, recipe);
    assert.equal(report.available, true);
    assert.equal(report.decorativeTubes, 0);
    assert.equal(report.traced, true);
  });
});
