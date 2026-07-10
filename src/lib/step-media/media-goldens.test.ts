import { test } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { inferStepMediaKind } from "./resolve";
import { svgI2cWiring } from "./diagrams";
import { WIRE_NAME_HEX } from "@/lib/wire-colors";

const plan = satLine as unknown as BuildPlan;
const steps = plan.steps as BuildStep[];

// R3 (eng review REGRESSION RULE): resolve.ts's kind selection feeds the
// hands-on diagram per step. Pinned so slice 4-5 churn can't silently reroute
// a step to the wrong drawing.
test("R3: demo step media kinds are pinned", () => {
  const expected: Record<number, string> = {
    1: "wire_bend_frame",
    2: "oled_desolder",
    3: "cut_jumpers",
    4: "battery_id_poles",
    5: "touch_mount",
    6: "i2c_wiring",
    7: "usb_upload",
    8: "solar_panel_mount",
    9: "bamboo_base_drill",
    10: "final_assembly",
    11: "final_assembly",
  };
  for (const s of steps) {
    assert.equal(
      inferStepMediaKind(s),
      expected[s.stepNumber],
      `step ${s.stepNumber} "${s.title}" media kind shifted`
    );
  }
});

// G4 (eng review): the 2D wiring diagram must draw its wires from THE color
// authority — the hardcoded-hex fork can never silently return.
test("G4: i2c diagram wire strokes come from the wire-color authority", () => {
  const svg = svgI2cWiring();
  assert.ok(svg.includes(`stroke="${WIRE_NAME_HEX.red}"`), "power wire uses authority red");
  assert.ok(svg.includes(`stroke="${WIRE_NAME_HEX.black}"`), "ground wire uses authority black");
  assert.ok(svg.includes(`stroke="${WIRE_NAME_HEX.blue}"`), "SDA wire uses authority blue");
  assert.ok(svg.includes(`stroke="${WIRE_NAME_HEX.yellow}"`), "SCL wire uses authority yellow");
  // The two rogue values the sweep removed:
  assert.ok(!svg.includes("#ca8a04"), "old rogue SCL yellow is gone");
  assert.ok(!svg.includes('stroke="#0f172a"'), "old rogue GND stroke is gone");
});
