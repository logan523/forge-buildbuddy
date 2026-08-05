import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import clockPlan from "@/data/solar-weather-clock.json";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { edgesFromModel } from "@/lib/steps/compile";
import {
  svgBambooDrill,
  svgBatteryPoles,
  svgCutJumpers,
  svgFinalAssembly,
  svgGenericChecklist,
  svgI2cWiring,
  svgOledDesolder,
  svgSolarMount,
  svgTouchMount,
  svgUsbUpload,
  svgWireBendFrame,
} from "./diagrams";
import { svgCircuitDiagram } from "./circuit-diagram";
import { resolveStepMedia } from "./resolve";

const plan = satLine as unknown as BuildPlan;
// The wiring sheet needs a compiled electrical model — same fixture path as
// circuit-diagram.test.ts (trust pipeline builds `electrical`).
const t = applyTrustPipeline(clockPlan as unknown as BuildPlan);

/**
 * Legibility gate (Phase 3): every teaching drawing is native-pixel —
 * width/height attributes equal the viewBox, so a host can scroll the sheet
 * but can NEVER scale text below its authored size — and no font is authored
 * under the 11px floor. This automates the measurement that used to be done
 * by hand in a 425px drawer.
 */

const FONT_FLOOR = 11;

function openTag(svg: string): string {
  return svg.slice(0, svg.indexOf(">") + 1);
}

function assertNativePixel(svg: string, name: string): void {
  const tag = openTag(svg);
  const vb = tag.match(/viewBox="0 0 (\d+) (\d+)"/);
  const w = tag.match(/\swidth="(\d+)"/);
  const h = tag.match(/\sheight="(\d+)"/);
  assert.ok(vb, `${name}: missing viewBox`);
  assert.ok(w && h, `${name}: missing native width/height attrs (sheet would scale-to-container)`);
  assert.equal(w![1], vb![1], `${name}: width attr != viewBox width`);
  assert.equal(h![1], vb![2], `${name}: height attr != viewBox height`);
  assert.ok(!/\swidth="100%"/.test(tag), `${name}: width forced to 100% — text would shrink in narrow hosts`);
}

function assertFontFloor(svg: string, name: string): void {
  const fonts = [...svg.matchAll(/font-size="(\d+(?:\.\d+)?)/g)].map((m) =>
    parseFloat(m[1])
  );
  assert.ok(fonts.length > 0, `${name}: no text found`);
  const min = Math.min(...fonts);
  assert.ok(min >= FONT_FLOOR, `${name}: font-size ${min}px is under the ${FONT_FLOOR}px floor`);
}

const DIAGRAMS: Array<[string, () => string]> = [
  ["oled_desolder", svgOledDesolder],
  ["wire_bend_frame", svgWireBendFrame],
  ["cut_jumpers", svgCutJumpers],
  ["battery_id_poles", svgBatteryPoles],
  ["touch_mount", svgTouchMount],
  ["i2c_wiring", svgI2cWiring],
  ["usb_upload", svgUsbUpload],
  ["solar_panel_mount", svgSolarMount],
  ["bamboo_base_drill", svgBambooDrill],
  ["final_assembly", svgFinalAssembly],
  ["generic_checklist", () => svgGenericChecklist("Legibility gate")],
];

test("technique sheets are native-pixel with an 11px font floor", () => {
  for (const [name, gen] of DIAGRAMS) {
    const svg = gen();
    assertNativePixel(svg, name);
    assertFontFloor(svg, name);
  }
});

test("resolveStepMedia passes sheets through at native size (no re-normalize)", () => {
  for (const s of plan.steps as BuildStep[]) {
    const m = resolveStepMedia(s);
    assertNativePixel(m.svg, `step ${s.stepNumber} (${m.kind})`);
    assertFontFloor(m.svg, `step ${s.stepNumber} (${m.kind})`);
  }
});

test("wiring sheet is native-pixel with an 11px font floor (full + crop)", () => {
  const full = svgCircuitDiagram(t);
  assertNativePixel(full, "circuit-diagram full");
  assertFontFloor(full, "circuit-diagram full");

  // Crop to one real wire's neighborhood — the per-step teaching surface.
  const model = t.electrical!;
  const edge = edgesFromModel(t, model)[0];
  const refToPart = new Map(model.components.map((c) => [c.ref, c.partId]));
  const cropped = svgCircuitDiagram(t, {
    crop: true,
    focusPartIds: [refToPart.get(edge.fromRef)!, refToPart.get(edge.toRef)!],
    highlightWireIds: [edge.id],
    title: "Legibility gate",
  });
  assertNativePixel(cropped, "circuit-diagram crop");
  assertFontFloor(cropped, "circuit-diagram crop");
});
