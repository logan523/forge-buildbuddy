import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultEnclosureParams, generateEnclosure, generateOpenScad } from "./index";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";

describe("enclosure", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("defaults include usb and oled for sat-line", () => {
    const p = defaultEnclosureParams(plan);
    assert.equal(p.usbCutout, true);
    assert.equal(p.oledWindow, true);
    assert.ok(p.wall >= 2);
  });

  it("openscad has base and lid modules", () => {
    const scad = generateOpenScad(defaultEnclosureParams(plan));
    assert.match(scad, /module base/);
    assert.match(scad, /module lid/);
    assert.match(scad, /USB-C cutout/);
  });

  it("package has previews", () => {
    const pkg = generateEnclosure(plan);
    assert.match(pkg.topSvg, /<svg/);
    assert.match(pkg.sideSvg, /<svg/);
    assert.ok(pkg.notes.length > 0);
  });
});
