import { test } from "node:test";
import assert from "node:assert/strict";
import plan from "@/data/solar-weather-clock.json";
import { applyTrustPipeline } from "@/lib/trust";
import { edgesFromModel } from "@/lib/steps/compile";
import { svgCircuitDiagram } from "@/lib/step-media/circuit-diagram";
import type { BuildPlan } from "@/lib/types";

const t = applyTrustPipeline(plan as unknown as BuildPlan);

test("circuit-diagram: names a box for the key parts", () => {
  const svg = svgCircuitDiagram(t);
  for (const needle of ['ESP32-C3', '0.96" OLED', "TP4056 Charger", "Battery", "Slide Switch"]) {
    assert.ok(svg.includes(needle), `diagram should name ${needle}`);
  }
});

test("circuit-diagram: draws a colored wire for every netlist edge", () => {
  const svg = svgCircuitDiagram(t);
  const edges = edgesFromModel(t, t.electrical!);
  assert.match(svg, /stroke="#2563eb"/, "SDA blue");
  assert.match(svg, /stroke="#eab308"/, "SCL yellow");
  assert.match(svg, /stroke="#dc2626"/, "power red");
  const paths = svg.match(/<path /g) || [];
  assert.ok(paths.length >= edges.length, `expected >= ${edges.length} wire paths, got ${paths.length}`);
});

test("circuit-diagram: spotlights the current wire (glow) and dims the rest", () => {
  const edges = edgesFromModel(t, t.electrical!);
  const sda = edges.find((e) => e.netName === "SDA");
  assert.ok(sda, "an SDA edge exists");
  const svg = svgCircuitDiagram(t, { highlightWireIds: [sda!.id] });
  assert.match(svg, /stroke="#0e7490" stroke-width="10"/, "the current wire gets an accent glow underlay");
  assert.match(svg, /opacity="0\.16"/, "pending wires dim in state mode");
});

test("circuit-diagram: soldered wires draw solid while pending stay faint", () => {
  const edges = edgesFromModel(t, t.electrical!);
  const svg = svgCircuitDiagram(t, { doneWireIds: [edges[0].id] });
  assert.match(svg, /opacity="0\.92"/, "done wire solid");
  assert.match(svg, /opacity="0\.16"/, "pending wire faint");
});

test("circuit-diagram: an empty model degrades gracefully (no crash, no 'undefined')", () => {
  const svg = svgCircuitDiagram({ ...t, electrical: undefined } as BuildPlan);
  assert.match(svg, /<svg/);
  assert.ok(!svg.includes("undefined"));
});

test("circuit-diagram: crop keeps only focus parts (per-step sheet)", () => {
  const model = t.electrical!;
  const mcu = model.components.find((c) => /esp32/i.test(c.catalogId || ""));
  assert.ok(mcu, "the plan has an MCU");
  const svg = svgCircuitDiagram(t, { crop: true, focusPartIds: [mcu!.partId] });
  assert.ok(svg.includes("ESP32-C3"), "focused MCU stays on the cropped sheet");
  assert.ok(!svg.includes('0.96" OLED'), "non-focused parts are cropped away");
});

test("circuit-diagram: renders an optional title as a visible heading", () => {
  const svg = svgCircuitDiagram(t, { title: "Wire the I2C bus" });
  assert.match(svg, /font-size="15"[^>]*>Wire the I2C bus</);
});

test("circuit-diagram: native-pixel output (width/height match the viewBox)", () => {
  const svg = svgCircuitDiagram(t);
  assert.match(svg, /viewBox="0 0 (\d+) (\d+)" width="\1" height="\2"/);
});
