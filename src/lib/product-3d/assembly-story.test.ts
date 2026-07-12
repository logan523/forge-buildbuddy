import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildSatClockScene3D, buildProductScene3D } from "./build-scene";
import {
  resolveAssemblyFrame,
  applyFrameToNodes,
  phaseIndexForStep,
} from "./assembly-recipe";
import { SAT_CLOCK_RECIPE, getRecipeForTemplate } from "./sat-clock-recipe";
import {
  buildHarnesses,
  routePath,
  pathLength,
  chordLength,
  pickAnchor,
  wiresForPart,
  wireLegend,
  wireDisplayLabel,
  anchorWorldPosition,
  rotateLocalOffset,
} from "./harness";
import {
  SAT_PIN_LOCALS,
  SAT_PIN_NODE_IDS,
  meshPinStubsForNode,
  pinAnchorsForNode,
  pinLocal,
} from "./sat-pins";

describe("assembly story recipe + phases", () => {
  const recipe = SAT_CLOCK_RECIPE;

  it("has 8 phases 0..7 and stand/cage/battery parts", () => {
    assert.equal(recipe.phases.length, 8);
    assert.equal(recipe.phases[0]!.id, "foundation");
    assert.equal(recipe.phases[7]!.id, "complete");
    assert.ok(recipe.parts.some((p) => p.id === "stand"));
    assert.ok(recipe.parts.some((p) => p.id === "cage"));
    assert.ok(recipe.parts.some((p) => p.id === "battery"));
  });

  it("phase 0 only stand present", () => {
    const f = resolveAssemblyFrame(recipe, 0);
    assert.deepEqual(f.presentPartIds.sort(), ["stand"]);
    assert.ok(f.presentNodeIds.includes("base"));
    assert.ok(!f.presentNodeIds.includes("frame"));
  });

  it("phase 1 adds cage + face/rear body panels seated on stand joint", () => {
    const f = resolveAssemblyFrame(recipe, 1);
    assert.ok(f.presentPartIds.includes("stand"));
    assert.ok(f.presentPartIds.includes("cage"));
    assert.ok(f.presentPartIds.includes("face-panel"));
    assert.ok(f.presentPartIds.includes("rear-panel"));
    assert.deepEqual(f.jointOffsets["cage"] || [0, 0, 0], [0, 0, 0]);
  });

  it("phase 7 complete has all primary parts", () => {
    const f = resolveAssemblyFrame(recipe, 7);
    for (const id of ["stand", "cage", "battery", "brain", "face", "solar-l", "solar-r", "touch"]) {
      assert.ok(f.presentPartIds.includes(id), `missing ${id}`);
    }
  });

  it("fractional scrub eases next joint from explode toward rest", () => {
    const f = resolveAssemblyFrame(recipe, 0.5);
    assert.ok(f.presentPartIds.includes("cage"), "next parts appear during scrub");
    const off = f.jointOffsets["cage"];
    assert.ok(off, "cage joint offset exists");
    assert.ok(Math.abs(off![1] - 20) < 0.01, `expected ~20 got ${off![1]}`);
  });

  it("applyFrameToNodes shifts face along joint when explode>0 at complete", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const scene = buildSatClockScene3D(plan);
    const f = resolveAssemblyFrame(recipe, 7);
    const rest = applyFrameToNodes(scene.nodes, recipe, f, 0);
    const exploded = applyFrameToNodes(scene.nodes, recipe, f, 1);
    const face0 = rest.find((n) => n.id === "face")!;
    const face1 = exploded.find((n) => n.id === "face")!;
    assert.ok(face1.position[2] > face0.position[2], "face explodes +Z along joint");
  });

  it("phaseIndexForStep maps media kinds", () => {
    assert.equal(phaseIndexForStep(recipe, { mediaKind: "wire_bend_frame" }), 1);
    assert.equal(phaseIndexForStep(recipe, { mediaKind: "oled_desolder" }), 4);
    assert.equal(phaseIndexForStep(recipe, { mediaKind: "solar_panel_mount" }), 6);
    assert.equal(phaseIndexForStep(recipe, { title: "Final assembly" }), 7);
  });

  it("getRecipeForTemplate returns sat_clock only", () => {
    assert.equal(getRecipeForTemplate("sat_clock")?.templateId, "sat_clock");
    assert.equal(getRecipeForTemplate("boxed_gadget"), null);
  });
});

describe("assembly story harness connectivity", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const scene = buildProductScene3D(plan);
  const recipe = SAT_CLOCK_RECIPE;
  const partByNode = new Map(recipe.parts.map((p) => [p.nodeId, p]));
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));

  it("routePath has multi-point droop longer than chord", () => {
    const p = routePath([0, 0, 0], [20, 0, 0], 8);
    assert.ok(p.length >= 6, `expected multi-point path, got ${p.length}`);
    assert.deepEqual(p[0], [0, 0, 0]);
    assert.deepEqual(p[p.length - 1], [20, 0, 0]);
    assert.ok(pathLength(p) > chordLength(p), "path longer than straight chord");
    assert.ok(p.some((pt) => pt[1] < 0), "path droops in -Y");
  });

  it("hugCageEdge pushes interior points toward cage shell", async () => {
    const { hugCageEdge } = await import("./harness");
    const center: [number, number, number] = [0, 100, 0];
    const interior: [number, number, number] = [2, 100, 1];
    const out = hugCageEdge(interior, center, 34, 4);
    const d0 = Math.hypot(interior[0] - center[0], interior[2] - center[2]);
    const d1 = Math.hypot(out[0] - center[0], out[2] - center[2]);
    assert.ok(d1 > d0, `expected push outward ${d0} -> ${d1}`);
  });

  it("pickAnchor prefers SDA/GND/OUT+ names (not GPIO for I2C)", () => {
    const face = recipe.parts.find((p) => p.id === "face")!;
    const brain = recipe.parts.find((p) => p.id === "brain")!;
    const charger = recipe.parts.find((p) => p.id === "charger")!;
    assert.equal(pickAnchor(face, "SDA", "i2c"), "SDA");
    assert.equal(pickAnchor(face, "GND", "gnd"), "GND");
    // Electrical model uses GPIO4 for SDA — must not land on GPIO pad
    assert.equal(pickAnchor(brain, "GPIO4", "i2c", "i2c_sda"), "SDA");
    assert.equal(pickAnchor(brain, "GPIO5", "i2c", "i2c_scl"), "SCL");
    assert.equal(pickAnchor(charger, "OUT+", "power", "power"), "OUT+");
    assert.equal(pickAnchor(charger, "IN+", "power", "power"), "IN+");
    assert.equal(pickAnchor(charger, "B+", "power", "power"), "B+");
  });

  it("rotateLocalOffset applies Euler like R3F meshes", () => {
    // Three.js right-hand: Z = π/2 maps local +Y → −X
    const [x, y, z] = rotateLocalOffset([0, 22, 0], [0, 0, Math.PI / 2]);
    assert.ok(Math.abs(x - -22) < 1e-6, `x=${x}`);
    assert.ok(Math.abs(y) < 1e-6, `y=${y}`);
    assert.ok(Math.abs(z) < 1e-6, `z=${z}`);
  });

  it("buildHarnesses produces ≥6 pin-to-pin tubes with labels and AWG", () => {
    const wires = buildHarnesses(scene, plan, recipe);
    assert.ok(wires.length >= 6, `expected ≥6 wires for dense harness, got ${wires.length}`);
    const classes = new Set(wires.map((w) => w.netClass));
    assert.ok(classes.has("power"), "power nets");
    assert.ok(classes.has("gnd"), "gnd nets");
    assert.ok(classes.has("i2c"), "i2c nets");
    for (const w of wires) {
      assert.ok(w.path.length >= 6, "multi-point route");
      assert.ok(w.fromNodeId && w.toNodeId);
      assert.ok(w.fromAnchor && w.toAnchor);
      assert.notEqual(w.fromAnchor, "body", `${w.id} from body`);
      assert.ok(w.color.startsWith("#"));
      assert.ok(w.gauge > 0);
      assert.ok(w.label.length >= 1);
      assert.ok(w.awg >= 20 && w.awg <= 30);
      assert.ok(w.insulation);
      assert.ok(pathLength(w.path) > chordLength(w.path) * 0.99);
    }
  });

  it("every wire endpoint lands on named recipe pin within 0.05mm", () => {
    const wires = buildHarnesses(scene, plan, recipe);
    assert.ok(wires.length >= 6);
    for (const w of wires) {
      const na = byId.get(w.fromNodeId)!;
      const nb = byId.get(w.toNodeId)!;
      const partA = partByNode.get(w.fromNodeId);
      const partB = partByNode.get(w.toNodeId);
      assert.ok(partA?.anchors?.length, `${w.fromNodeId} has anchors`);
      assert.ok(partB?.anchors?.length, `${w.toNodeId} has anchors`);
      assert.ok(
        partA!.anchors!.some((a) => a.name === w.fromAnchor),
        `${w.fromNodeId} missing anchor ${w.fromAnchor}`
      );
      assert.ok(
        partB!.anchors!.some((a) => a.name === w.toAnchor),
        `${w.toNodeId} missing anchor ${w.toAnchor}`
      );
      const wantFrom = anchorWorldPosition(na, partA, w.fromAnchor);
      const wantTo = anchorWorldPosition(nb, partB, w.toAnchor);
      const gotFrom = w.path[0]!;
      const gotTo = w.path[w.path.length - 1]!;
      const dFrom = Math.hypot(
        gotFrom[0] - wantFrom[0],
        gotFrom[1] - wantFrom[1],
        gotFrom[2] - wantFrom[2]
      );
      const dTo = Math.hypot(
        gotTo[0] - wantTo[0],
        gotTo[1] - wantTo[1],
        gotTo[2] - wantTo[2]
      );
      assert.ok(dFrom < 0.05, `${w.id} from d=${dFrom}`);
      assert.ok(dTo < 0.05, `${w.id} to d=${dTo}`);
      // Not free-floating at board origin when named anchors exist
      const originA = Math.hypot(
        gotFrom[0] - na.position[0],
        gotFrom[1] - na.position[1],
        gotFrom[2] - na.position[2]
      );
      assert.ok(originA > 0.5, `${w.id} from near board center (d=${originA})`);
    }
  });

  it("teaching nets land on correct named pins (SDA not GPIO, OUT+ not B+)", () => {
    const bare = { ...plan, electrical: undefined };
    const wires = buildHarnesses(scene, bare as BuildPlan, recipe);
    const sda = wires.find((w) => w.netName === "I2C_SDA");
    const scl = wires.find((w) => w.netName === "I2C_SCL");
    const sys = wires.find((w) => w.netName === "SYS_3V3");
    const bat = wires.find((w) => w.netName === "B+");
    const pv = wires.find((w) => w.netName === "PV_L");
    assert.ok(sda, "I2C_SDA");
    assert.equal(sda!.fromAnchor, "SDA");
    assert.equal(sda!.toAnchor, "SDA");
    assert.ok(scl);
    assert.equal(scl!.fromAnchor, "SCL");
    assert.equal(scl!.toAnchor, "SCL");
    assert.ok(sys);
    assert.equal(sys!.fromAnchor, "OUT+");
    assert.equal(sys!.toAnchor, "3V3");
    assert.ok(bat);
    assert.equal(bat!.fromAnchor, "+");
    assert.equal(bat!.toAnchor, "B+");
    assert.ok(pv);
    assert.equal(pv!.toAnchor, "IN+");
  });

  it("wireLegend and wireDisplayLabel are human-readable", () => {
    const legend = wireLegend();
    assert.ok(legend.length >= 4);
    assert.ok(legend.every((r) => r.color.startsWith("#") && r.meaning));
    const wires = buildHarnesses(scene, plan, recipe);
    const lab = wireDisplayLabel(wires[0]!);
    assert.ok(lab.includes("→"));
    assert.ok(lab.includes(wires[0]!.label));
  });

  it("structural defaults include brain↔face i2c and battery↔charger", () => {
    const bare = { ...plan, electrical: undefined };
    const wires = buildHarnesses(scene, bare as BuildPlan, recipe);
    assert.ok(
      wires.some(
        (w) =>
          (w.fromNodeId === "brain" && w.toNodeId === "face") ||
          (w.fromNodeId === "face" && w.toNodeId === "brain")
      ),
      "brain-face wire"
    );
    assert.ok(
      wires.some(
        (w) =>
          (w.fromNodeId === "battery" && w.toNodeId === "charger") ||
          (w.fromNodeId === "charger" && w.toNodeId === "battery")
      ),
      "battery-charger wire"
    );
  });

  it("presentNodeIds filters harness to assembled parts only", () => {
    const early = resolveAssemblyFrame(recipe, 1);
    const wires = buildHarnesses(scene, plan, recipe, {
      presentNodeIds: early.presentNodeIds,
    });
    assert.equal(wires.length, 0);
  });

  it("wiresForPart finds OLED incident nets", () => {
    const wires = buildHarnesses(scene, plan, recipe);
    const faceW = wiresForPart(wires, "face");
    assert.ok(faceW.length >= 1, "face should have incident wires");
  });

  it("phase 4 net hints allow i2c-related routes when both ends present", () => {
    const f = resolveAssemblyFrame(recipe, 4);
    const wires = buildHarnesses(scene, plan, recipe, {
      presentNodeIds: f.presentNodeIds,
      activeNetHints: f.activeNetHints.length ? f.activeNetHints : undefined,
    });
    assert.ok(f.presentNodeIds.includes("brain"));
    assert.ok(f.presentNodeIds.includes("face"));
    assert.ok(wires.length >= 1, "some harness after power+brain+face");
  });
});

describe("sat body panels — not empty brass cage", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const scene = buildSatClockScene3D(plan);

  it("scene includes face_panel and rear_panel nodes", () => {
    const face = scene.nodes.find((n) => n.id === "face-panel");
    const rear = scene.nodes.find((n) => n.id === "rear-panel");
    assert.ok(face, "face-panel present");
    assert.ok(rear, "rear-panel present");
    assert.equal(face!.geom.kind, "face_panel");
    assert.equal(rear!.geom.kind, "rear_panel");
    assert.ok((face!.geom.params.cutoutW || 0) > 0, "OLED cutout on face");
  });

  it("OLED parents to face-panel; charger to rear-panel", () => {
    const oled = scene.nodes.find((n) => n.id === "face");
    const charger = scene.nodes.find((n) => n.id === "charger");
    assert.equal(oled?.parentId, "face-panel");
    assert.equal(charger?.parentId, "rear-panel");
  });

  it("recipe parts have pin anchors for brain/face/charger/battery", () => {
    for (const id of ["brain", "face", "charger", "battery"]) {
      const p = SAT_CLOCK_RECIPE.parts.find((x) => x.id === id);
      assert.ok(p?.anchors && p.anchors.length >= 2, `${id} anchors`);
    }
    const charger = SAT_CLOCK_RECIPE.parts.find((p) => p.id === "charger")!;
    assert.ok(charger.anchors!.some((a) => a.name === "OUT+"));
    assert.ok(charger.anchors!.some((a) => a.name === "IN+"));
    assert.ok(charger.anchors!.some((a) => a.name === "IN-"));
  });
});

describe("sat-pins single source of truth (mesh stubs === recipe anchors)", () => {
  // Not tautological: recipe anchors and meshPinStubsForNode must both equal SAT_PIN_LOCALS
  // (if mesh hardcodes different coords, this fails)

  it("recipe part anchors equal pinAnchorsForNode for electrical nodes", () => {
    for (const nodeId of SAT_PIN_NODE_IDS) {
      const part = SAT_CLOCK_RECIPE.parts.find((p) => p.nodeId === nodeId);
      assert.ok(part, `recipe part ${nodeId}`);
      const fromTable = pinAnchorsForNode(nodeId);
      assert.ok(fromTable.length >= 2, `${nodeId} table pins`);
      const recipeAnchors = part?.anchors ?? [];
      for (const a of fromTable) {
        const match = recipeAnchors.find((x) => x.name === a.name);
        assert.ok(match, `recipe missing ${nodeId}.${a.name}`);
        assert.equal(match!.local[0], a.local[0], `${nodeId}.${a.name} x`);
        assert.equal(match!.local[1], a.local[1], `${nodeId}.${a.name} y`);
        assert.equal(match!.local[2], a.local[2], `${nodeId}.${a.name} z`);
      }
    }
  });

  it("mesh pin stub locals equal sat-pins table (would catch hard-coded mesh drift)", () => {
    // Stubs must equal SAT_PIN_LOCALS (RealPartSpec), not mesh-relative proportions
    for (const nodeId of ["face", "brain", "charger", "battery", "solar-l", "solar-r"] as const) {
      const stubs = meshPinStubsForNode(nodeId);
      assert.ok(stubs.length >= 2, `${nodeId} stubs`);
      for (const s of stubs) {
        const table = pinLocal(nodeId, s.name);
        assert.ok(table, `${nodeId}.${s.name} in table`);
        assert.deepEqual(s.local, table, `${nodeId}.${s.name} stub === table`);
      }
    }
    // Face header sits on bottom edge of real 27 mm module (y ≈ -12.3)
    const faceY = pinLocal("face", "VCC")![1];
    assert.ok(faceY < -10 && faceY > -14, `face pin y on module edge, got ${faceY}`);
    // 16340 terminals at ± half cell length (~±16.8)
    const batY = pinLocal("battery", "+")![1];
    assert.ok(Math.abs(batY - 16.8) < 0.5, `battery + y ${batY}`);
    // Solar root-edge leads (craft panel)
    assert.equal(pinLocal("solar-l", "+")![0], 28);
    assert.equal(pinLocal("solar-r", "+")![0], -28);
  });

  it("product-node-mesh derives pads from sat-pins (not hard-coded pad coords)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/product-node-mesh.tsx"),
      "utf8"
    );
    assert.ok(src.includes('from "@/lib/product-3d/sat-pins"'), "imports sat-pins");
    // Pads come from the generic pin authority (sat roles → exact; any other
    // part → catalog archetype / derived header), not per-part hard-coded coords.
    assert.ok(src.includes("pinStubsForNode"), "uses pinStubsForNode");
    assert.ok(src.includes("pinLocal"), "uses pinLocal for battery");
    // Guard against reintroducing the desync patterns skeptic found
    assert.ok(!src.includes("pcbH * 0.42"), "no OLED y from pcbH fraction");
    assert.ok(!/node\.id\.includes\("-r"\).*w \* 0\.42|w \* 0\.42.*node\.id\.includes/.test(src), "no solar x from width fraction");
    assert.ok(!src.includes("-h * 0.22"), "no solar y from height fraction");
    assert.ok(!src.includes("ht * 0.52"), "no battery terminal from ht fraction");
  });

  it("harness endpoints equal anchorWorldPosition of sat-pins-backed recipe", () => {
    const plan = applyTrustPipeline(demo as unknown as BuildPlan);
    const scene = buildProductScene3D(plan);
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    const partByNode = new Map(SAT_CLOCK_RECIPE.parts.map((p) => [p.nodeId, p]));
    const wires = buildHarnesses(scene, plan, SAT_CLOCK_RECIPE);
    assert.ok(wires.length >= 6);
    for (const w of wires) {
      // Shared table has this pin
      const tableFrom = SAT_PIN_LOCALS[w.fromNodeId]?.find((p) => p.name === w.fromAnchor);
      const tableTo = SAT_PIN_LOCALS[w.toNodeId]?.find((p) => p.name === w.toAnchor);
      assert.ok(tableFrom, `table ${w.fromNodeId}.${w.fromAnchor}`);
      assert.ok(tableTo, `table ${w.toNodeId}.${w.toAnchor}`);
      // Recipe mirrors table
      const partA = partByNode.get(w.fromNodeId)!;
      const recipeA = partA.anchors!.find((a) => a.name === w.fromAnchor)!;
      assert.deepEqual(recipeA.local, tableFrom!.local);
      // Path ends at rotated world of that local
      const want = anchorWorldPosition(byId.get(w.fromNodeId)!, partA, w.fromAnchor);
      const got = w.path[0]!;
      assert.ok(
        Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]) < 0.05
      );
    }
  });
});
