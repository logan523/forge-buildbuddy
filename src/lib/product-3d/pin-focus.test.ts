import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildProductScene3D } from "./build-scene";
import type { LayerViewState } from "./types";
import { resolvePinLocal, pinWorldPositionMm, frameForPin } from "./pin-focus";

const VIEW: LayerViewState = { visible: {}, soloLayerId: null, explode: 0, selectedNodeId: null };
const scene = () => buildProductScene3D(applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan));

test("resolvePinLocal: exact, then prefix (GPIO4→GPIO), else null", () => {
  assert.ok(resolvePinLocal("brain", "SDA"), "SDA matches exactly");
  assert.ok(resolvePinLocal("brain", "GND"), "GND exact");
  // compiled connections say GPIO4/GPIO5; the ESP pad is just "GPIO"
  assert.ok(resolvePinLocal("brain", "GPIO4"), "GPIO4 resolves via prefix to GPIO");
  assert.ok(resolvePinLocal("brain", "GPIO5"), "GPIO5 resolves via prefix to GPIO");
  assert.equal(resolvePinLocal("brain", "NONEXISTENT"), null);
  assert.equal(resolvePinLocal("not-a-node", "SDA"), null);
});

test("pinWorldPositionMm: a pin sits ON its part (near the node, not the origin)", () => {
  const s = scene();
  const brain = s.nodes.find((n) => n.id === "brain")!;
  assert.ok(brain, "demo scene has the esp32 'brain' node");
  const sda = pinWorldPositionMm(brain, "SDA", VIEW)!;
  assert.ok(sda, "SDA world pos resolves");
  // pin must be within a few cm of the part center (mm units) — not flung to origin
  const d = Math.hypot(
    sda[0] - brain.position[0],
    sda[1] - brain.position[1],
    sda[2] - brain.position[2]
  );
  assert.ok(d < 30, `SDA pin is on the part (offset ${d.toFixed(1)}mm < 30)`);
  // distinct pins land at distinct spots
  const gnd = pinWorldPositionMm(brain, "GND", VIEW)!;
  assert.ok(Math.hypot(sda[0] - gnd[0], sda[1] - gnd[1], sda[2] - gnd[2]) > 1, "SDA ≠ GND location");
});

test("frameForPin: targets the pin (scaled), camera offset along the CAD diagonal; null on bad pin", () => {
  const s = scene();
  const brain = s.nodes.find((n) => n.id === "brain")!;
  const cam = frameForPin(brain, "SDA", VIEW, s.rootScale, 0.6)!;
  const pin = pinWorldPositionMm(brain, "SDA", VIEW)!;
  assert.ok(cam, "frame resolves");
  // target is the pin world position × rootScale
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(cam.target[i] - pin[i] * s.rootScale) < 1e-6, "target = pin world");
  }
  // camera sits ~0.6 world units off the pin (above, per the diagonal)
  const dist = Math.hypot(
    cam.position[0] - cam.target[0],
    cam.position[1] - cam.target[1],
    cam.position[2] - cam.target[2]
  );
  assert.ok(Math.abs(dist - 0.6) < 1e-6, "close, fixed distance");
  assert.ok(cam.position[1] > cam.target[1], "camera above the pin");
  assert.equal(frameForPin(brain, "NONEXISTENT", VIEW, s.rootScale), null);
});
