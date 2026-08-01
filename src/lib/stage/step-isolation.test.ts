import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterNodesForIsolation,
  filterWiresForIsolation,
  isolateNodeIds,
  isolatePartIds,
} from "./step-isolation";
import type { PlannedWire } from "./wire-plan";
import type { SceneNode3D } from "@/lib/product-3d";
import type { MicroStep } from "@/lib/types";

const nodes = [
  { id: "brain", partId: "p-esp", label: "ESP32" },
  { id: "face", partId: "p-oled", label: "OLED" },
  { id: "power", partId: "p-tp", label: "TP4056" },
] as SceneNode3D[];

function wire(id: string, from: string, to: string): PlannedWire {
  return {
    route: {
      id,
      netName: id,
      netClass: "signal",
      color: "#00f",
      fromNodeId: from,
      toNodeId: to,
      fromAnchor: "A",
      toAnchor: "B",
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    },
    colorName: "BLUE",
    endpoints: `${from} → ${to}`,
    lengthMm: 10,
    callout: id,
  } as PlannedWire;
}

describe("step isolation", () => {
  it("isolatePartIds prefers guided wire endpoints over focusPartIds", () => {
    const wireMs = {
      fromPartId: "p-esp",
      toPartId: "p-oled",
    } as MicroStep;
    assert.deepEqual(isolatePartIds(["p-tp", "p-esp"], wireMs), ["p-esp", "p-oled"]);
  });

  it("isolatePartIds falls back to focusPartIds", () => {
    assert.deepEqual(isolatePartIds(["p-esp", "p-oled"], null), ["p-esp", "p-oled"]);
    assert.equal(isolatePartIds(undefined, null), null);
  });

  it("isolateNodeIds maps partIds to scene node ids", () => {
    assert.deepEqual(isolateNodeIds(nodes, ["p-esp", "p-oled"]), ["brain", "face"]);
  });

  it("filterNodesForIsolation never blanks the stage on miss", () => {
    assert.deepEqual(
      filterNodesForIsolation(nodes, ["brain"]).map((n) => n.id),
      ["brain"]
    );
    assert.deepEqual(
      filterNodesForIsolation(nodes, ["nope"]).map((n) => n.id),
      ["brain", "face", "power"]
    );
  });

  it("filterWiresForIsolation prefers both ends, then either", () => {
    const wires = [wire("sda", "brain", "face"), wire("vcc", "power", "brain")];
    const both = filterWiresForIsolation(wires, ["brain", "face"]);
    assert.deepEqual(
      both.map((w) => w.route.id),
      ["sda"]
    );
    // Only brain isolated — either-end keeps rails that touch it
    const either = filterWiresForIsolation(wires, ["brain"]);
    assert.equal(either.length, 2);
  });
});
