import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { trackPointsLK, type Gray } from "./optical-flow";
import { HybridTracker } from "./hybrid-tracker";
import type { Pt } from "./homography";

function solidGray(w: number, h: number, v: number): Gray {
  return { data: new Float32Array(w * h).fill(v), w, h };
}

/** Soft vertical ramp (good texture for LK) that shifts +dx */
function rampGray(w: number, h: number, shift: number): Gray {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = ((x - shift) / w) * 255;
      data[y * w + x] = Math.min(255, Math.max(0, t));
    }
  }
  return { data, w, h };
}

describe("optical flow LK", () => {
  it("tracks a point on a translating ramp to the right", () => {
    const w = 80;
    const h = 60;
    const prev = rampGray(w, h, 0);
    const next = rampGray(w, h, 3); // pattern shifted +3 px
    const pts: Pt[] = [{ x: 40, y: 30 }];
    const r = trackPointsLK(prev, next, pts);
    assert.equal(r.points.length, 1);
    // Brightness constancy: feature should follow the shift
    assert.ok(
      r.points[0]!.x > pts[0]!.x + 0.5,
      `expected positive dx, got ${r.points[0]!.x - pts[0]!.x}`
    );
  });

  it("returns low confidence on flat region", () => {
    const g = solidGray(40, 40, 100);
    const r = trackPointsLK(g, g, [{ x: 20, y: 20 }]);
    assert.ok(r.meanConfidence < 0.5);
  });
});

describe("hybrid tracker", () => {
  it("starts in seeking with no quad", () => {
    const t = new HybridTracker();
    const s = t.getSnapshot();
    assert.equal(s.state, "seeking");
    assert.equal(s.quad, null);
  });

  it("manual quad enters calibrating lock", () => {
    const t = new HybridTracker();
    t.setManualQuad([
      { x: 10, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 80 },
      { x: 10, y: 80 },
    ]);
    const s = t.getSnapshot();
    assert.equal(s.state, "calibrating");
    assert.ok(s.quad);
    assert.equal(s.method, "manual");
  });

  it("reset clears lock", () => {
    const t = new HybridTracker();
    t.setManualQuad([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    t.reset();
    assert.equal(t.getSnapshot().state, "seeking");
    assert.equal(t.getSnapshot().quad, null);
  });
});
