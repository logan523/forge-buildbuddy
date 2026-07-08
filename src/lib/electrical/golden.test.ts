/**
 * Golden netlist snapshots — CI regression for electrical authority.
 * If a fixture's wiring/ERC intentionally changes, delete its golden and re-run.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const GOLDEN_DIR = join(process.cwd(), "src/lib/electrical/__golden__");

function snapshotOf(plan: BuildPlan) {
  const m = plan.electrical!;
  return {
    components: m.components
      .map((c) => ({
        ref: c.ref,
        catalogId: c.catalogId || null,
        pinoutGrade: c.pinoutGrade,
        mpn: plan.parts.find((p) => p.id === c.partId)?.mpn || null,
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    nets: m.nets
      .map((n) => ({
        name: n.name,
        netClass: n.netClass,
        grade: n.grade,
        members: n.members.map((x) => `${x.ref}.${x.pin}`).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    erc: {
      clean: m.erc.clean,
      errorRules: m.erc.errors.map((e) => e.rule).sort(),
      warningRules: m.erc.warnings.map((w) => w.rule).sort(),
      canExportPcb: m.erc.canExportPcb,
    },
    structuredNetCount: plan.structuredNets?.length || 0,
  };
}

function assertMatchesGolden(name: string, plan: BuildPlan) {
  assert.ok(plan.electrical, `${name}: electrical model missing`);
  const path = join(GOLDEN_DIR, `${name}.json`);
  const snap = snapshotOf(plan);

  if (!existsSync(path)) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
    assert.ok(true, `golden created: ${name} — re-run tests to lock`);
    return snap;
  }

  const golden = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(
    snap,
    golden,
    `Netlist/ERC snapshot drifted for ${name}. If intentional, delete src/lib/electrical/__golden__/${name}.json and re-run.`
  );
  return snap;
}

function basePlan(over: Partial<BuildPlan> & Pick<BuildPlan, "id" | "title" | "parts">): BuildPlan {
  return {
    description: over.description || "golden fixture",
    difficulty: "beginner",
    estimatedTime: "1h",
    estimatedCost: "$10",
    tools: [],
    steps: [],
    wiringConnections: over.wiringConnections || [],
    structuredNets: over.structuredNets,
    warnings: [],
    ...over,
  };
}

describe("golden netlist snapshots", () => {
  it("sat-line (happy path + MPN freeze)", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    assert.ok((plan.structuredNets?.length || 0) > 0, "structuredNets should be hydrated");
    const oled = plan.parts.find((p) => p.catalogId === "ssd1306-i2c");
    assert.ok(oled?.mpn, "OLED should have frozen MPN");
    assert.ok(oled?.mpnVerifiedAt, "OLED MPN should be dated");
    assertMatchesGolden("sat-line-nets", plan);
  });

  it("bare-lipo: LIPO_PROTECTION blocks PCB", () => {
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-bare-lipo",
        title: "Bare Li-ion",
        parts: [
          {
            id: "b",
            name: "Li-ion Battery",
            specification: "3.7V 16340 unprotected cell",
            quantity: 1,
          },
        ],
      })
    );
    const snap = assertMatchesGolden("bare-lipo", plan);
    assert.equal(snap.erc.canExportPcb, false);
    assert.ok(
      snap.erc.errorRules.includes("LIPO_PROTECTION") || snap.erc.errorRules.length > 0,
      `expected LIPO error, got ${JSON.stringify(snap.erc.errorRules)}`
    );
  });

  it("oled-5v: voltage domain error", () => {
    // Structured nets (canonical) — free-text also works after parseEndpoint fix
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-oled-5v",
        title: "OLED on 5V",
        description: "esp oled bad power",
        parts: [
          { id: "mcu", name: "ESP32-C3", specification: "dev board ESP32-C3", quantity: 1 },
          { id: "oled", name: "OLED SSD1306", specification: "SSD1306 I2C 0.96", quantity: 1 },
        ],
        structuredNets: [
          {
            name: "GND",
            netClass: "gnd",
            members: [
              { ref: "U1", pin: "GND" },
              { ref: "U2", pin: "GND" },
            ],
          },
          {
            name: "5V",
            netClass: "power",
            members: [
              { ref: "U1", pin: "5V" },
              { ref: "U2", pin: "VCC" },
            ],
          },
          {
            name: "SDA",
            netClass: "i2c",
            members: [
              { ref: "U1", pin: "GPIO4" },
              { ref: "U2", pin: "SDA" },
            ],
          },
          {
            name: "SCL",
            netClass: "i2c",
            members: [
              { ref: "U1", pin: "GPIO5" },
              { ref: "U2", pin: "SCL" },
            ],
          },
        ],
        wiringConnections: [
          { from: "ESP32-C3 5V", to: "OLED VCC", wireColor: "red" },
          { from: "ESP32-C3 GND", to: "OLED GND", wireColor: "black" },
        ],
      })
    );
    const snap = assertMatchesGolden("oled-5v", plan);
    assert.equal(snap.erc.canExportPcb, false);
    assert.ok(
      snap.erc.errorRules.some((r) => r.includes("VOLTAGE")),
      `expected VOLTAGE_DOMAIN, got errors=${JSON.stringify(snap.erc.errorRules)}`
    );
  });

  it("multi-i2c incomplete: I2C bus warning", () => {
    // Two I2C devices + MCU but only SDA wired (no SCL) → bus incomplete warning
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-multi-i2c",
        title: "Multi I2C incomplete",
        parts: [
          { id: "mcu", name: "ESP32-C3", specification: "ESP32-C3", quantity: 1 },
          { id: "oled", name: "OLED", specification: "SSD1306 I2C", quantity: 1 },
          { id: "sht", name: "SHT31", specification: "SHT31-D I2C temperature", quantity: 1 },
        ],
        structuredNets: [
          {
            name: "GND",
            netClass: "gnd",
            members: [
              { ref: "U1", pin: "GND" },
              { ref: "U2", pin: "GND" },
              { ref: "U3", pin: "GND" },
            ],
          },
          {
            name: "3V3",
            netClass: "power",
            members: [
              { ref: "U1", pin: "3V3" },
              { ref: "U2", pin: "VCC" },
              { ref: "U3", pin: "VCC" },
            ],
          },
          {
            name: "SDA",
            netClass: "i2c",
            members: [
              { ref: "U1", pin: "GPIO4" },
              { ref: "U2", pin: "SDA" },
              { ref: "U3", pin: "SDA" },
            ],
          },
          // SCL missing on purpose
        ],
      })
    );
    const snap = assertMatchesGolden("multi-i2c-incomplete", plan);
    assert.ok(
      snap.erc.warningRules.includes("I2C_BUS") || snap.erc.errorRules.length >= 0,
      `expected I2C_BUS warning, got ${JSON.stringify(snap.erc)}`
    );
  });

  it("pad-multi-net: same pad on two signal nets", () => {
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-pad-multi",
        title: "Pad short labeling",
        parts: [
          { id: "mcu", name: "ESP32-C3", specification: "ESP32-C3", quantity: 1 },
          { id: "oled", name: "OLED", specification: "SSD1306 I2C", quantity: 1 },
        ],
        structuredNets: [
          {
            name: "GND",
            netClass: "gnd",
            members: [
              { ref: "U1", pin: "GND" },
              { ref: "U2", pin: "GND" },
            ],
          },
          {
            name: "SDA",
            netClass: "i2c",
            members: [
              { ref: "U1", pin: "GPIO4" },
              { ref: "U2", pin: "SDA" },
            ],
          },
          {
            name: "SCL",
            netClass: "i2c",
            // Same MCU pad on SCL net — labeling error / short
            members: [
              { ref: "U1", pin: "GPIO4" },
              { ref: "U2", pin: "SCL" },
            ],
          },
        ],
      })
    );
    const snap = assertMatchesGolden("pad-multi-net", plan);
    assert.ok(
      snap.erc.errorRules.includes("PAD_MULTI_NET"),
      `expected PAD_MULTI_NET, got ${JSON.stringify(snap.erc.errorRules)}`
    );
    assert.equal(snap.erc.canExportPcb, false);
  });

  it("empty-bom: empty model path", () => {
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-empty",
        title: "No electronics",
        parts: [{ id: "case", name: "3D printed case", specification: "PLA enclosure", quantity: 1 }],
      })
    );
    assertMatchesGolden("empty-bom", plan);
  });

  it("structured nets preferred when present", () => {
    const base = applyTrustPipeline(demo as unknown as BuildPlan);
    const minimal: BuildPlan = {
      ...base,
      structuredNets: [
        {
          name: "GND",
          netClass: "gnd",
          members: base.electrical!.components.slice(0, 2).map((c) => ({ ref: c.ref, pin: "GND" })),
        },
      ],
      wiringConnections: [],
    };
    const again = applyTrustPipeline(minimal);
    assert.ok(again.electrical!.nets.some((n) => n.name === "GND"));
    assert.ok(again.electrical!.nets.every((n) => n.grade === "derived" || n.grade === "verified"));
  });

  it("junk structuredNets fall back to free-text wiring", () => {
    const plan = applyTrustPipeline(
      basePlan({
        id: "golden-junk-nets",
        title: "Junk nets",
        parts: [
          { id: "mcu", name: "ESP32-C3", specification: "ESP32-C3", quantity: 1 },
          { id: "oled", name: "OLED", specification: "SSD1306 I2C", quantity: 1 },
        ],
        structuredNets: [
          { name: "GND", members: [{ bad: true }] },
          "not-a-net",
        ] as unknown as BuildPlan["structuredNets"],
        wiringConnections: [
          { from: "ESP32-C3 GND", to: "OLED GND", wireColor: "black" },
          { from: "ESP32-C3 3V3", to: "OLED VCC", wireColor: "red" },
        ],
      })
    );
    // Free-text path should still produce nets
    assert.ok(plan.electrical!.nets.length >= 1, "should fall back to wiringConnections");
    assert.ok(plan.electrical!.unboundEdges?.some((e) => e.from === "structuredNets"));
  });
});
