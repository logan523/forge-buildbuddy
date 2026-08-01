import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xywhrToCorners } from "./sander-gi-obb";
import { orderCorners } from "./board-detect";

describe("sander-gi OBB decode", () => {
  it("xywhrToCorners produces 4 points around center", () => {
    const pts = xywhrToCorners(100, 100, 40, 20, 0);
    assert.equal(pts.length, 4);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    assert.ok(Math.min(...xs) < 100 && Math.max(...xs) > 100);
    assert.ok(Math.min(...ys) < 100 && Math.max(...ys) > 100);
    // axis-aligned width ~40
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 40) < 0.01);
  });

  it("rotated box still has 4 distinct corners", () => {
    const pts = xywhrToCorners(50, 50, 30, 10, Math.PI / 4);
    const ordered = orderCorners(pts);
    assert.equal(ordered.length, 4);
    const uniq = new Set(ordered.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    assert.equal(uniq.size, 4);
  });
});
