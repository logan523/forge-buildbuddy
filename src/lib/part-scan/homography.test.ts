import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeHomography,
  applyHomography,
  UNIT_QUAD,
  type Pt,
} from "./homography";
import { resolvePinUv, uvToPt } from "./pin-layout";
import { orderCorners } from "./board-detect";

describe("homography AR core", () => {
  it("maps unit square corners to a known destination", () => {
    const dst: Pt[] = [
      { x: 100, y: 50 },
      { x: 300, y: 60 },
      { x: 280, y: 200 },
      { x: 80, y: 190 },
    ];
    const H = computeHomography(UNIT_QUAD, dst);
    assert.ok(H);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H!, UNIT_QUAD[i]!);
      assert.ok(Math.abs(p.x - dst[i]!.x) < 1.5, `corner ${i} x`);
      assert.ok(Math.abs(p.y - dst[i]!.y) < 1.5, `corner ${i} y`);
    }
    // Center UV should land inside quad
    const mid = applyHomography(H!, { x: 0.5, y: 0.5 });
    assert.ok(mid.x > 80 && mid.x < 300);
    assert.ok(mid.y > 50 && mid.y < 200);
  });

  it("resolves OLED GND pin UV near header edge", () => {
    const uv = resolvePinUv("GND", "oled_096");
    assert.ok(uv.v > 0.5, "header along bottom-ish");
  });

  it("orders corners TL TR BR BL", () => {
    const q = orderCorners([
      { x: 10, y: 10 },
      { x: 100, y: 12 },
      { x: 95, y: 80 },
      { x: 8, y: 78 },
    ]);
    assert.ok(q[0]!.x < q[1]!.x);
    assert.ok(q[0]!.y < q[3]!.y);
  });

  it("uvToPt matches pin layout for homography src", () => {
    const uv = resolvePinUv("SDA", "oled_096");
    const p = uvToPt(uv);
    assert.equal(p.x, uv.u);
    assert.equal(p.y, uv.v);
  });
});
