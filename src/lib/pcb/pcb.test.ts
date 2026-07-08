import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNetlist, generatePcbPackage, placeComponents, autoroute } from "./index";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";

describe("pcb", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("builds nets from wiring", () => {
    const { nets, footprints } = buildNetlist(plan);
    assert.ok(nets.length >= 5, `expected nets, got ${nets.length}`);
    assert.ok(footprints.length >= 3);
  });

  it("places within board bounds", () => {
    const { footprints } = buildNetlist(plan);
    const { placed, boardWidth, boardHeight } = placeComponents(footprints);
    assert.ok(placed.length === footprints.length);
    for (const p of placed) {
      assert.ok(p.x > 0 && p.y > 0);
      assert.ok(p.x < boardWidth + 20);
      assert.ok(p.y < boardHeight + 20);
    }
  });

  it("routes at least some segments", () => {
    const { nets, footprints } = buildNetlist(plan);
    const { placed } = placeComponents(footprints);
    const { routes } = autoroute(nets, placed);
    assert.ok(routes.length > 0);
  });

  it("package includes svg and kicad netlist", () => {
    const pkg = generatePcbPackage(plan);
    assert.match(pkg.svg, /<svg/);
    assert.match(pkg.kicadNetlist, /\(export/);
    assert.match(pkg.bomCsv, /Ref,Name/);
    assert.ok(pkg.boardWidth > 0);
  });
});
