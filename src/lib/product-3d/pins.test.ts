import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pinStubsForNode, meshPinStubsForNode } from "./sat-pins";
import type { SceneNode3D } from "./types";

function node(partial: Partial<SceneNode3D>): SceneNode3D {
  return {
    id: "x",
    layer: "brain",
    label: "X",
    geom: { kind: "box", params: { width: 20, height: 15, depth: 3 } },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: { color: "#333" },
    ...partial,
  } as SceneNode3D;
}

describe("pinStubsForNode — generic pins for any part", () => {
  it("tier 1: sat roles resolve byte-identical to SAT_PIN_LOCALS (demo intact)", () => {
    const brain = node({
      id: "brain",
      geom: { kind: "pcb_module", params: { width: 22.5, height: 18, depth: 3.2 } },
    });
    assert.deepEqual(pinStubsForNode(brain), meshPinStubsForNode("brain"));
    const names = pinStubsForNode(brain).map((p) => p.name);
    assert.deepEqual(names, ["3V3", "GND", "SDA", "SCL", "GPIO"]);
  });

  it("tier 1: solar-r keeps its mirrored pins (not the solar-l originals)", () => {
    const solarR = node({
      id: "solar-r",
      layer: "wings",
      geom: { kind: "solar_module", params: { width: 60, height: 45, depth: 3 } },
    });
    assert.deepEqual(pinStubsForNode(solarR), meshPinStubsForNode("solar-r"));
    // mirror flips +X pad to −X
    const plus = pinStubsForNode(solarR).find((p) => p.name === "+")!;
    assert.ok(plus.local[0] < 0, "solar-r + pad mirrored to −X");
  });

  it("tier 2: a non-sat node with a catalog match gets labeled archetype pins", () => {
    // e.g. another project's MCU node (not id 'brain') tagged esp32_c3 by applyCatalogHints
    const mcu = node({
      id: "controller",
      catalogId: "esp32_c3",
      geom: { kind: "board", params: { width: 28, height: 18, depth: 2.5 } },
    });
    const pins = pinStubsForNode(mcu);
    assert.deepEqual(
      pins.map((p) => p.name),
      ["3V3", "GND", "SDA", "SCL", "GPIO"]
    );
    assert.ok(pins.every((p) => p.netColor), "archetype pins carry net colors");
  });

  it("tier 2: structural body/root pads are filtered out (cell → just + and −)", () => {
    const cell = node({
      id: "batt-2",
      layer: "power",
      catalogId: "cell_16340",
      geom: { kind: "cell_16340", params: { radius: 8, height: 34 } },
    });
    assert.deepEqual(
      pinStubsForNode(cell).map((p) => p.name),
      ["+", "-"]
    );
  });

  it("tier 3: an unrecognized electronic board gets a derived header on its bbox", () => {
    const gizmo = node({
      id: "widget",
      geom: { kind: "box", params: { width: 24, height: 16, depth: 4 } },
    });
    const pins = pinStubsForNode(gizmo);
    assert.equal(pins.length, 4);
    assert.deepEqual(
      pins.map((p) => p.name),
      ["1", "2", "3", "4"]
    );
    // laid along the −Y edge, centered on X, on the top face
    assert.ok(pins.every((p) => p.local[1] < 0), "header sits on the −Y edge");
    assert.ok(Math.abs(pins.reduce((s, p) => s + p.local[0], 0)) < 1e-6, "centered on X");
  });

  it("tier 4: structural parts (mast/stand/frame) never get pins", () => {
    const mast = node({ id: "mast", layer: "mast", geom: { kind: "tube", params: { radius: 4, height: 180 } } });
    const stand = node({ id: "stand", layer: "base", geom: { kind: "metal_stand", params: {} } });
    const cage = node({ id: "frame", layer: "frame", geom: { kind: "wire_cube_cage", params: { size: 60 } } });
    assert.deepEqual(pinStubsForNode(mast), []);
    assert.deepEqual(pinStubsForNode(stand), []);
    assert.deepEqual(pinStubsForNode(cage), []);
  });
});
