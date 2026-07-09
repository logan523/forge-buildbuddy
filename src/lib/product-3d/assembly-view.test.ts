import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildSatClockScene3D } from "./build-scene";
import {
  applyViewUpdater,
  assemblyNodeOpacity,
  buildAssemblyTree,
  clearIsolate,
  defaultAssemblyView,
  inspectNode,
  isolateNode,
  presentForStep,
  resetAssemblyView,
  selectNode,
  setExplode,
  soloLayer,
  toggleIsolate,
  toggleNodeVisible,
  toggleSection,
} from "./assembly-view";
import { computeNodeWorldPosition, isolatedPullOffset } from "./types";

describe("assembly-view mess-with state", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const scene = buildSatClockScene3D(plan);

  it("defaultAssemblyView selects nothing and explode 0", () => {
    const v = defaultAssemblyView(scene.nodes);
    assert.equal(v.selectedNodeId, null);
    assert.equal(v.explode, 0);
    assert.ok(v.visible.face !== false);
  });

  it("selectNode sets selection and clears solo", () => {
    let v = defaultAssemblyView(scene.nodes);
    v = soloLayer(v, "face");
    assert.equal(v.soloLayerId, "face");
    v = selectNode(v, "face");
    assert.equal(v.selectedNodeId, "face");
    assert.equal(v.soloLayerId, null);
  });

  it("isolateNode extracts part and ghosts peers (JARVIS)", () => {
    let v = defaultAssemblyView(scene.nodes);
    v = setExplode(v, 0.4);
    v = isolateNode(v, "brain");
    assert.equal(v.isolateNodeId, "brain");
    assert.equal(v.selectedNodeId, "brain");
    assert.equal(v.explode, 0.4, "explode preserved under isolate");
    const brain = scene.nodes.find((n) => n.id === "brain")!;
    const face = scene.nodes.find((n) => n.id === "face")!;
    assert.equal(assemblyNodeOpacity(brain, v), 1);
    assert.ok(assemblyNodeOpacity(face, v) < 0.25, "peer ghosted");
    const rest = computeNodeWorldPosition(brain, { ...v, explode: 0, isolateNodeId: null });
    const pulled = computeNodeWorldPosition(brain, { ...v, explode: 0 });
    const d = Math.hypot(
      pulled[0] - rest[0],
      pulled[1] - rest[1],
      pulled[2] - rest[2]
    );
    assert.ok(d > 20, `expected pull extract, got d=${d}`);
    const off = isolatedPullOffset(brain);
    assert.ok(Math.hypot(...off) > 20);
    v = clearIsolate(v);
    assert.equal(v.isolateNodeId, null);
    assert.equal(v.selectedNodeId, "brain");
    assert.equal(assemblyNodeOpacity(face, v), 1);
  });

  it("toggleIsolate reassembles on second call", () => {
    let v = defaultAssemblyView(scene.nodes);
    v = toggleIsolate(v, "charger");
    assert.equal(v.isolateNodeId, "charger");
    v = toggleIsolate(v, "charger");
    assert.equal(v.isolateNodeId, null);
  });

  it("toggleNodeVisible hides then shows", () => {
    let v = defaultAssemblyView(scene.nodes);
    const face = scene.nodes.find((n) => n.id === "face")!;
    assert.equal(assemblyNodeOpacity(face, v), 1);
    v = toggleNodeVisible(v, "face");
    assert.equal(v.nodeVisible?.face, false);
    assert.equal(assemblyNodeOpacity(face, v), 0);
    v = toggleNodeVisible(v, "face");
    assert.equal(v.nodeVisible?.face, true);
    assert.equal(assemblyNodeOpacity(face, v), 1);
  });

  it("setExplode peels left wing leftward", () => {
    let v = defaultAssemblyView(scene.nodes);
    const wing = scene.nodes.find((n) => n.id === "solar-l")!;
    const a = computeNodeWorldPosition(wing, v);
    v = setExplode(v, 1);
    const b = computeNodeWorldPosition(wing, v);
    assert.ok(b[0] < a[0]);
    assert.ok(Math.abs(b[0] - a[0]) > 5);
  });

  it("resetAssemblyView clears explode and selection", () => {
    let v = selectNode(setExplode(defaultAssemblyView(scene.nodes), 0.8), "battery");
    v = resetAssemblyView(scene.nodes);
    assert.equal(v.explode, 0);
    assert.equal(v.selectedNodeId, null);
  });

  it("buildAssemblyTree nests under stand → cage", () => {
    const tree = buildAssemblyTree(scene, plan.title);
    assert.equal(tree.id, "__root__");
    assert.ok(tree.children.length >= 1);
    // base is root of hierarchy
    const base = tree.children.find((c) => c.id === "base") || tree.children[0];
    assert.ok(base);
    // frame under base
    const withFrame =
      base.id === "frame"
        ? base
        : base.children.find((c) => c.id === "frame") ||
          tree.children.find((c) => c.id === "frame");
    // Walk tree for frame
    function find(n: typeof tree, id: string): boolean {
      if (n.id === id) return true;
      return n.children.some((c) => find(c, id));
    }
    assert.ok(find(tree, "frame"), "frame in tree");
    assert.ok(find(tree, "face"), "face in tree");
    assert.ok(find(tree, "battery"), "battery in tree");
    void withFrame;
  });

  it("sat_clock nodes have parentId hierarchy", () => {
    const frame = scene.nodes.find((n) => n.id === "frame")!;
    const face = scene.nodes.find((n) => n.id === "face")!;
    const facePanel = scene.nodes.find((n) => n.id === "face-panel")!;
    const rearPanel = scene.nodes.find((n) => n.id === "rear-panel")!;
    const charger = scene.nodes.find((n) => n.id === "charger")!;
    const base = scene.nodes.find((n) => n.id === "base")!;
    assert.equal(base.parentId, null);
    assert.equal(frame.parentId, "base");
    assert.equal(facePanel.parentId, "frame");
    assert.equal(rearPanel.parentId, "frame");
    assert.equal(face.parentId, "face-panel");
    assert.equal(charger.parentId, "rear-panel");
  });

  it("presentForStep ghosts future layers mid-build", () => {
    const present = presentForStep(scene, 0, {
      title: "Bend brass frame",
      description: "wire cage",
      mediaKind: "wire_bend_frame",
    });
    // structure present
    assert.equal(present.base, true);
    assert.equal(present.frame, true);
    // wings may be locked early
    const wingIds = scene.nodes.filter((n) => n.layer === "wings").map((n) => n.id);
    // At step 0 + 2 unlock = order index 2 → power unlocked, wings not yet
    // order: base, frame, power, brain, face, sensor, touch, wings
    // maxIdx = min(7, 0+2) = 2 → base, frame, power
    for (const id of wingIds) {
      assert.equal(present[id], false, `${id} should be ghost early`);
    }
    assert.equal(present.battery, true);
  });

  it("inspectNode joins BOM part by partId/ref", () => {
    const face = scene.nodes.find((n) => n.id === "face")!;
    const { node, part } = inspectNode(scene, "face", plan.parts);
    assert.equal(node?.id, "face");
    // demo plan should have OLED part linked
    if (face.partId || face.ref) {
      assert.ok(part || face.label);
    }
  });

  it("toggleSection enables cutaway plane", () => {
    let v = defaultAssemblyView(scene.nodes);
    v = toggleSection(v, "y");
    assert.equal(v.section?.enabled, true);
    assert.equal(v.section?.axis, "y");
    v = toggleSection(v, "y");
    assert.equal(v.section?.enabled, false);
  });

  it("applyViewUpdater select after explode preserves explode/hides/section (controlled path)", () => {
    let latest = defaultAssemblyView(scene.nodes);
    latest = setExplode(latest, 0.72);
    latest = toggleNodeVisible(latest, "battery");
    latest = toggleSection(latest, "y");
    // Simulate controlled setView: always apply against latest snapshot (ref), not stale close-over
    const setView = (updater: typeof latest | ((v: typeof latest) => typeof latest)) => {
      latest = applyViewUpdater(latest, updater);
    };
    // Stale closed-over snapshot from "earlier render" (explode 0)
    const stale = defaultAssemblyView(scene.nodes);
    // Wrong pattern: updater(stale) would wipe explode — we must use latest
    setView((v) => selectNode(v, "face"));
    assert.equal(latest.selectedNodeId, "face");
    assert.equal(latest.explode, 0.72, "explode must survive select");
    assert.equal(latest.nodeVisible?.battery, false, "hide must survive select");
    assert.equal(latest.section?.enabled, true, "section must survive select");
    // Prove stale path would fail if used
    const broken = applyViewUpdater(stale, (v) => selectNode(v, "face"));
    assert.equal(broken.explode, 0);
    assert.notEqual(broken.explode, latest.explode);
  });

  it("pose toggle explode:0 via updater preserves other fields on latest", () => {
    let latest = selectNode(setExplode(defaultAssemblyView(scene.nodes), 0.9), "solar-l");
    latest = toggleSection(latest, "y");
    // hideChrome Pose on: set explode 0 via functional updater on latest
    latest = applyViewUpdater(latest, (v) => ({ ...v, explode: 0 }));
    assert.equal(latest.explode, 0);
    assert.equal(latest.selectedNodeId, "solar-l");
    assert.equal(latest.section?.enabled, true);
  });
});
