import { describe, it } from "node:test";
import assert from "node:assert/strict";
import demo from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import {
  buildProductScene3D,
  buildSatClockScene3D,
  buildWeatherStickScene3D,
  buildRobotChassisScene3D,
  buildSensorPodScene3D,
  buildBoxedScene3D,
  buildBreadboardScene3D,
  uniqueLayers,
  applyFormLayoutToScene,
} from "./build-scene";
import {
  applyPoseLayout,
  computeNodeWorldPosition,
  defaultLayerView,
  focusLayerForStep,
  nodeOpacity,
  type PoseLayout3D,
} from "./types";
import {
  assertSatFidelityParams,
  wireCubeRods,
  rodEndpointError,
  SAT_FIDELITY,
} from "./geom-math";
import {
  REAL_PARTS,
  boardGeomParams,
  cellGeomParams,
  solarGeomParams,
} from "./real-parts";
import { SAT_PIN_LOCALS } from "./sat-pins";
import {
  enrichPosesFromParams,
  sanitizePoseHints,
  resolveHintsOntoScene,
  applyEnrichmentToScene,
} from "./enrich-poses";
import {
  isAllowedBeautyUrl,
  sanitizeBeautyMesh,
  beautyUnderlayAllowed,
  beautyDisplayOpacity,
  buildBeautyPrompt,
  resolveBeautyMesh,
  prepareBeautyGeneration,
  beautyGenerationConfigured,
} from "./beauty-mesh";

describe("product-3d connection spars + sun + catalog", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("builds edges from electrical or structural fallback", async () => {
    const { buildConnectionEdges } = await import("./connection-spars");
    const scene = buildProductScene3D(plan);
    const { edges, notes } = buildConnectionEdges(scene, plan, plan.electrical);
    assert.ok(edges.length >= 2);
    assert.ok(edges.every((e) => e.fromNodeId && e.toNodeId && e.color));
    assert.ok(notes.some((n) => n.id === "conn_spars"));
  });

  it("attachConnectionSpars adds edges to scene", () => {
    const scene = buildProductScene3D(plan);
    assert.ok(scene.edges && scene.edges.length > 0);
  });

  it("sun direction and solar aim are finite", async () => {
    const { sunDirection, sunLightPosition, solarRotationTowardSun, DEFAULT_SUN } = await import("./sun");
    const d = sunDirection(DEFAULT_SUN);
    assert.ok(d.every(Number.isFinite));
    assert.ok(Math.hypot(...d) > 0.9);
    const p = sunLightPosition(DEFAULT_SUN);
    assert.ok(p[1] > 0);
    const r = solarRotationTowardSun(DEFAULT_SUN, "left");
    assert.equal(r.length, 3);
  });

  it("catalog tags brain as esp32 + attaches the authored GLB via the open registry", async () => {
    const {
      applyCatalogHints,
      inferCatalogId,
      resolveCatalogAssetUrl,
      CATALOG,
      readyCatalogAssetPaths,
    } = await import("./catalog");
    const scene = buildSatClockScene3D(plan);
    const tagged = applyCatalogHints(scene.nodes);
    const brain = tagged.find((n) => n.id === "brain")!;
    assert.equal(inferCatalogId(brain), "esp32_c3");
    assert.equal(brain.catalogId, "esp32_c3");
    // The authored ESP32-C3 SuperMini GLB now attaches through PART_MODELS (open registry).
    assert.equal(brain.assetUrl, "/models/parts/esp32_c3.glb");
    assert.ok(readyCatalogAssetPaths().includes("/models/parts/esp32_c3.glb"));
    // A part with NO authored model (unrecognized board → generic_pcb) still
    // falls back to the parametric mesh (assetUrl unset).
    const [proto] = applyCatalogHints([
      {
        id: "proto",
        layer: "brain",
        label: "Proto board",
        geom: { kind: "board", params: { width: 30, height: 20, depth: 2 } },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        material: { color: "#334155" },
      },
    ]);
    assert.equal(proto!.catalogId, "generic_pcb");
    assert.equal(proto!.assetUrl, undefined);
    assert.equal(resolveCatalogAssetUrl(CATALOG.oled_096), undefined);
  });
});

describe("product-3d spatial reasoning", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("cube sat keeps solar at cage sides", async () => {
    const { applySpatialReasoning } = await import("./spatial-reason");
    const raw = buildSatClockScene3D(plan);
    const { scene, notes } = applySpatialReasoning(raw);
    const sl = scene.nodes.find((n) => n.id === "solar-l")!;
    const frame = scene.nodes.find((n) => n.id === "frame")!;
    assert.ok(sl.position[0] < frame.position[0] - 20, "left wing outboard");
    assert.ok(Math.abs(sl.position[1] - frame.position[1]) < 25, "wings near cage height");
    assert.ok(notes.some((n) => n.id === "solar_sky" || n.id === "power_in_cage"));
  });

  it("buildProductScene3D attaches reasoning notes", () => {
    const scene = buildProductScene3D(plan);
    assert.ok(scene.reasoningNotes && scene.reasoningNotes.length >= 2);
  });
});

describe("product-3d materials + quality", () => {
  it("resolves bamboo and brass presets", async () => {
    const { resolvePhysicalMaterial, inferMaterialPreset } = await import("./materials");
    assert.equal(inferMaterialPreset("bamboo_base", { color: "#c9a66b" }, "base"), "bamboo");
    assert.equal(inferMaterialPreset("brass_frame", { color: "#c9a227" }, "frame"), "brass");
    const m = resolvePhysicalMaterial("oled_module", { color: "#0a1628" }, "face", 1);
    assert.ok((m.clearcoat ?? 0) > 0.5);
    assert.ok((m.metalness ?? 0) < 0.5);
  });

  it("quality tiers lower dpr on low", async () => {
    const { qualitySettings } = await import("./quality");
    const hi = qualitySettings("high");
    const lo = qualitySettings("low");
    assert.ok(hi.dpr[1] >= lo.dpr[1]);
    assert.ok(hi.segments > lo.segments);
  });

  it("sat_clock uses composite geom kinds including body panels", () => {
    const scene = buildSatClockScene3D(
      applyTrustPipeline(demo as unknown as BuildPlan)
    );
    const kinds = new Set(scene.nodes.map((n) => n.geom.kind));
    assert.ok(kinds.has("wire_cube_cage") || kinds.has("metal_stand"));
    assert.ok(kinds.has("oled_module") || kinds.has("oled_panel"));
    assert.ok(kinds.has("solar_module") || kinds.has("solar_panel"));
    assert.ok(kinds.has("face_panel"), "front body panel");
    assert.ok(kinds.has("rear_panel"), "rear service panel");
  });

  it("stage ships continuous tube harness + studio lighting (structural)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // The Stage tree replaced the old three-component viewer; read EVERY
    // stage source so internal file splits never break this test again.
    const stageDir = path.join(process.cwd(), "src/components/stage");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (f.endsWith(".tsx") || f.endsWith(".ts")) files.push(full);
      }
    };
    walk(stageDir);
    const src = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    assert.ok(src.includes("WireTubeRoute"), "tube render path");
    assert.ok(/tubeGeometry/i.test(src), "continuous TubeGeometry wires");
    assert.ok(src.includes("CatmullRomCurve3"), "spline wire path");
    assert.ok(
      /const \[showWires,\s*setShowWires\]\s*=\s*useState\(\s*true\s*\)/.test(src),
      "wires default ON"
    );
    assert.ok(src.includes("isolatedId") || src.includes("highlightNodeId"), "selection isolation hook");
    assert.ok(src.includes("ContactShadows"), "studio contact shadows");
    // Avoid PCSS SoftShadows / MeshReflectorMaterial components (GPU blackout)
    assert.ok(
      !/from ["']@react-three\/drei["'][\s\S]*SoftShadows|SoftShadows,/.test(src) &&
        !src.includes("<SoftShadows"),
      "no SoftShadows component"
    );
    assert.ok(!src.includes("<MeshReflectorMaterial"), "no MeshReflectorMaterial");
    assert.ok(
      src.includes("getProceduralMap") || src.includes("procedural-maps"),
      "procedural PBR maps"
    );
    assert.ok(
      src.includes("Environment") && (src.includes("warehouse") || src.includes("studio")),
      "IBL environment"
    );
    assert.ok(
      src.includes("ACESFilmicToneMapping") || /ToneMapping/.test(src),
      "filmic tone mapping"
    );
    assert.ok(src.includes("isolatedId") || src.includes("onIsolate"), "isolate interaction");
    assert.ok(src.includes('case "face_panel"'), "face panel parametric case");
    assert.ok(src.includes('case "rear_panel"'), "rear panel parametric case");
    assert.ok(src.includes("PinStub"), "pin stubs land wires on boards");
    assert.ok(src.includes("pinStubsForNode"), "pins derive from the pin authority");
    assert.ok(src.includes("normalMap"), "procedural normals");
    assert.ok(src.includes("wiresForPart"), "incident-wire lookup");
    assert.ok(src.includes("wireLegend"), "wiring legend from the color authority");
    assert.ok(src.includes("Inspect"), "inspect affordance");
    assert.ok(src.includes("Reassemble"), "reassemble affordance");
    assert.ok(src.includes("buildAssemblyTree") || src.includes("Parts"), "parts tree");
  });
});

describe("product-3d beauty mesh", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("allows https glb urls only", () => {
    assert.equal(isAllowedBeautyUrl("https://cdn.example.com/product.glb"), true);
    assert.equal(isAllowedBeautyUrl("https://cdn.example.com/a.gltf?sig=1"), true);
    assert.equal(isAllowedBeautyUrl("http://localhost:3000/x.glb"), true);
    assert.equal(isAllowedBeautyUrl("http://evil.com/x.glb"), false);
    assert.equal(isAllowedBeautyUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedBeautyUrl("https://cdn.example.com/model.obj"), false);
  });

  it("sanitizeBeautyMesh drops bad urls", () => {
    assert.equal(sanitizeBeautyMesh({ url: "ftp://x/y.glb" }), undefined);
    const ok = sanitizeBeautyMesh({
      url: "https://assets.example.com/sat.glb",
      provider: "meshy",
      opacity: 1.5,
      scale: 100,
    });
    assert.ok(ok);
    assert.equal(ok!.provider, "meshy");
    assert.ok((ok!.opacity as number) <= 1);
    assert.ok((ok!.scale as number) <= 10);
  });

  it("beautyUnderlayAllowed enforces layer authority", () => {
    const scene = buildSatClockScene3D(plan);
    const view = defaultLayerView(scene.nodes);
    const spec = sanitizeBeautyMesh({ url: "https://cdn.example.com/a.glb", status: "ready" })!;

    assert.equal(
      beautyUnderlayAllowed({ view, editMode: false, userEnabled: true, spec }),
      true
    );
    assert.equal(
      beautyUnderlayAllowed({ view, editMode: true, userEnabled: true, spec }),
      false
    );
    assert.equal(
      beautyUnderlayAllowed({
        view: { ...view, soloLayerId: "face" },
        editMode: false,
        userEnabled: true,
        spec,
      }),
      false
    );
    assert.equal(
      beautyUnderlayAllowed({
        view: { ...view, explode: 0.5 },
        editMode: false,
        userEnabled: true,
        spec,
      }),
      false
    );
    assert.equal(
      beautyUnderlayAllowed({ view, editMode: false, userEnabled: false, spec }),
      false
    );
  });

  it("resolveBeautyMesh on plan", () => {
    const none = resolveBeautyMesh(plan);
    assert.equal(none.reason, "none");
    assert.ok(none.disclaimer.includes("visual only"));

    const ready = resolveBeautyMesh({
      ...plan,
      beautyMesh: { url: "https://cdn.example.com/x.glb", status: "ready" },
    });
    assert.equal(ready.reason, "ready");
    assert.ok(ready.spec?.url.includes(".glb"));
  });

  it("buildBeautyPrompt includes template caption", () => {
    const p = buildBeautyPrompt(plan);
    assert.ok(p.length > 10);
    assert.ok(/sat|clock|bamboo|solar|product/i.test(p));
  });

  it("beautyDisplayOpacity never forces full cover by default", () => {
    const spec = sanitizeBeautyMesh({ url: "https://cdn.example.com/a.glb", opacity: 0.9 })!;
    assert.ok(beautyDisplayOpacity(spec) <= 0.85);
  });

  it("prepareBeautyGeneration is opt-in stub", () => {
    const prep = prepareBeautyGeneration(plan);
    assert.equal(prep.pending.status, "pending");
    assert.ok(prep.prompt.length > 0);
    // without API keys, not configured
    const cfg = beautyGenerationConfigured({});
    assert.equal(cfg.configured, false);
  });

  it("mapMeshyStatus maps provider states", async () => {
    const { mapMeshyStatus } = await import("./beauty-generate");
    assert.equal(mapMeshyStatus("SUCCEEDED"), "ready");
    assert.equal(mapMeshyStatus("IN_PROGRESS"), "in_progress");
    assert.equal(mapMeshyStatus("FAILED"), "failed");
    assert.equal(mapMeshyStatus("PENDING"), "pending");
  });

  it("startBeautyGeneration fails without keys", async () => {
    const { startBeautyGeneration } = await import("./beauty-generate");
    const r = await startBeautyGeneration(plan, { env: {} as NodeJS.ProcessEnv });
    assert.equal(r.status, "failed");
    assert.ok(r.error?.includes("API_KEY") || r.error?.includes("configured"));
  });

  it("parametric scene still builds when beauty present", () => {
    const scene = buildProductScene3D({
      ...plan,
      beautyMesh: { url: "https://cdn.example.com/pretty.glb" },
    });
    assert.ok(scene.nodes.length >= 8);
    assert.equal(scene.templateId, "sat_clock");
  });
});

describe("product-3d scene builder", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("builds sat_clock with key layers", () => {
    const scene = buildSatClockScene3D(plan);
    assert.equal(scene.templateId, "sat_clock");
    assert.ok(scene.nodes.length >= 8);
    const layers = new Set(scene.nodes.map((n) => n.layer));
    assert.ok(layers.has("base"));
    assert.ok(layers.has("frame"));
    assert.ok(layers.has("face"));
    assert.ok(layers.has("wings"));
    assert.ok(layers.has("power"));
    assert.ok(layers.has("touch"));
  });

  it("sat_clock is wire-cube form (not bamboo coaster)", () => {
    const scene = buildSatClockScene3D(plan);
    const kinds = new Set(scene.nodes.map((n) => n.geom.kind));
    assert.ok(kinds.has("wire_cube_cage"), "must have wire cube cage");
    assert.ok(kinds.has("metal_stand"), "must have metal stand");
    assert.ok(!kinds.has("bamboo_base"), "no bamboo coaster default");
    const frame = scene.nodes.find((n) => n.id === "frame")!;
    const battery = scene.nodes.find((n) => n.id === "battery")!;
    // Battery Y near cage center (inside cage)
    assert.ok(Math.abs(battery.position[1] - frame.position[1]) < 20, "battery inside cage height");
    const touch = scene.nodes.find((n) => n.id === "touch")!;
    assert.ok(touch.position[1] > frame.position[1], "touch on top of cube");
  });

  it("sat_clock life-size: real-part mm + solid cage rods", () => {
    const scene = buildSatClockScene3D(plan);
    const cage = scene.nodes.find((n) => n.geom.kind === "wire_cube_cage")!;
    const solar = scene.nodes.find((n) => n.id === "solar-l")!;
    const battery = scene.nodes.find((n) => n.id === "battery")!;
    const brain = scene.nodes.find((n) => n.id === "brain")!;
    const cam = scene.cameraHint.position;
    const tgt = scene.cameraHint.target;
    const dist = Math.hypot(cam[0] - tgt[0], cam[1] - tgt[1], cam[2] - tgt[2]);
    const gate = assertSatFidelityParams({
      rodR: cage.geom.params.rodR || 0,
      cageSize: cage.geom.params.size || 0,
      solarDepth: solar.geom.params.depth || 0,
      rootScale: scene.rootScale,
      batteryRadius: battery.geom.params.radius || 0,
      batteryHeight: battery.geom.params.height || 0,
      espLongEdge: Math.max(brain.geom.params.width || 0, brain.geom.params.height || 0),
      cameraDistance: dist,
    });
    assert.equal(gate.ok, true, gate.failures.join("; "));
    // Cage rods are a true 3D cube (12 equal edge segments, ends on corners)
    const size = cage.geom.params.size || 48;
    const rods = wireCubeRods(size);
    assert.equal(rods.length, 12);
    assert.ok(rods.every((r) => Math.abs(r.length - size) < 1e-6));
    for (const r of rods) {
      const endErr = rodEndpointError(r);
      assert.ok(
        endErr < SAT_FIDELITY.maxRodEndpointError,
        `shipped cage rod endpoint err ${endErr} at mid ${r.mid}`
      );
    }
  });

  it("sat_clock RealPartSpec dimension authority within 0.5 mm", () => {
    const scene = buildSatClockScene3D(plan);
    const tol = 0.5;

    const face = scene.nodes.find((n) => n.id === "face")!;
    const oled = boardGeomParams(REAL_PARTS.oled_096);
    assert.ok(Math.abs((face.geom.params.width || 0) - oled.width) <= tol, "oled width");
    assert.ok(Math.abs((face.geom.params.height || 0) - oled.height) <= tol, "oled height");
    assert.ok(Math.abs((face.geom.params.depth || 0) - oled.depth) <= tol, "oled depth");

    const brain = scene.nodes.find((n) => n.id === "brain")!;
    const esp = boardGeomParams(REAL_PARTS.esp32_c3);
    assert.ok(Math.abs((brain.geom.params.width || 0) - esp.width) <= tol, "esp width");
    assert.ok(Math.abs((brain.geom.params.height || 0) - esp.height) <= tol, "esp height");
    assert.ok((brain.geom.params.width || 0) <= 26, "SuperMini long edge");

    const charger = scene.nodes.find((n) => n.id === "charger")!;
    const tp = boardGeomParams(REAL_PARTS.tp4056);
    assert.ok(Math.abs((charger.geom.params.width || 0) - tp.width) <= tol, "tp width");
    assert.ok(Math.abs((charger.geom.params.height || 0) - tp.height) <= tol, "tp height");

    const battery = scene.nodes.find((n) => n.id === "battery")!;
    const cell = cellGeomParams(REAL_PARTS.cell_16340);
    assert.ok(Math.abs((battery.geom.params.radius || 0) - cell.radius) <= tol, "cell r");
    assert.ok(Math.abs((battery.geom.params.height || 0) - cell.height) <= tol, "cell h");
    assert.ok(Math.abs((battery.geom.params.radius || 0) - 8.25) <= tol, "16340 Ø/2");

    const solar = scene.nodes.find((n) => n.id === "solar-l")!;
    const sol = solarGeomParams(REAL_PARTS.solar_cell);
    assert.ok(Math.abs((solar.geom.params.width || 0) - sol.width) <= tol, "solar w");
    assert.ok(Math.abs((solar.geom.params.height || 0) - sol.height) <= tol, "solar h");
  });

  it("sat_pins derive from RealPartSpec (brain/face/battery)", () => {
    const brainPin = SAT_PIN_LOCALS.brain.find((p) => p.name === "SDA")!;
    const real = REAL_PARTS.esp32_c3.pins.find((p) => p.name === "SDA")!;
    assert.deepEqual(brainPin.local, real.local);
    const batPlus = SAT_PIN_LOCALS.battery.find((p) => p.name === "+")!;
    assert.ok(Math.abs(batPlus.local[1] - 16.8) < 0.5, "cell + near half length");
  });

  it("resolveProductScene3D from plan formSpec", () => {
    const scene = buildProductScene3D(plan);
    assert.equal(scene.templateId, "sat_clock");
    assert.equal(scene.grade, "high");
  });

  it("uniqueLayers lists isolation keys", () => {
    const scene = buildSatClockScene3D(plan);
    const u = uniqueLayers(scene);
    assert.ok(u.some((l) => l.id === "face"));
    assert.ok(u.some((l) => l.id === "base"));
  });

  it("solo dims other layers", () => {
    const scene = buildSatClockScene3D(plan);
    const view = defaultLayerView(scene.nodes);
    view.soloLayerId = "face";
    const face = scene.nodes.find((n) => n.layer === "face")!;
    const base = scene.nodes.find((n) => n.layer === "base")!;
    assert.equal(nodeOpacity(face, view), 1);
    assert.ok(nodeOpacity(base, view) < 0.2);
  });

  it("explode moves nodes along explodeDir", () => {
    const scene = buildSatClockScene3D(plan);
    const view = defaultLayerView(scene.nodes);
    const wing = scene.nodes.find((n) => n.id === "solar-l")!;
    view.explode = 0;
    const a = computeNodeWorldPosition(wing, view);
    view.explode = 1;
    const b = computeNodeWorldPosition(wing, view);
    assert.notDeepEqual(a, b);
    assert.ok(b[0] < a[0]); // left wing explodes left
    // larger explode distance (mm) for visible peel
    assert.ok(Math.abs(b[0] - a[0]) > 5);
  });

  it("focusLayerForStep maps OLED prep to face", () => {
    assert.equal(focusLayerForStep("Prepare the OLED display", "header pins", "oled_desolder"), "face");
    assert.equal(focusLayerForStep("Wire all", "SDA SCL", "i2c_wiring"), "brain");
  });

  it("mess-with: pose apply then clear restores template (shipped APIs)", () => {
    const scene = buildSatClockScene3D(plan);
    const face = scene.nodes.find((n) => n.id === "face")!;
    const template = [...face.position] as [number, number, number];
    const posed = applyPoseLayout(scene, {
      face: { position: [template[0] + 12, template[1], template[2] + 8] },
    });
    const moved = posed.nodes.find((n) => n.id === "face")!.position;
    assert.notDeepEqual(moved, template);
    const restored = applyPoseLayout(posed, { face: { position: template } });
    assert.deepEqual(restored.nodes.find((n) => n.id === "face")!.position, template);
  });
});

describe("product-3d multi-template", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("weather_stick has mast + sensor", () => {
    const scene = buildWeatherStickScene3D(plan);
    assert.equal(scene.templateId, "weather_stick");
    const layers = new Set(scene.nodes.map((n) => n.layer));
    assert.ok(layers.has("mast"));
    assert.ok(layers.has("sensor"));
    assert.ok(layers.has("brain"));
  });

  it("robot_chassis has body + wheels", () => {
    const scene = buildRobotChassisScene3D(plan);
    assert.equal(scene.templateId, "robot_chassis");
    const layers = new Set(scene.nodes.map((n) => n.layer));
    assert.ok(layers.has("body"));
    assert.ok(layers.has("wheels"));
    assert.ok(layers.has("brain"));
  });

  it("sensor_pod has shell", () => {
    const scene = buildSensorPodScene3D(plan);
    assert.equal(scene.templateId, "sensor_pod");
    assert.ok(scene.nodes.some((n) => n.layer === "shell"));
  });

  it("boxed_gadget has shell", () => {
    const scene = buildBoxedScene3D(plan);
    assert.equal(scene.templateId, "boxed_gadget");
    assert.ok(scene.nodes.some((n) => n.id === "shell"));
  });

  it("breadboard has base board", () => {
    const scene = buildBreadboardScene3D(plan);
    assert.equal(scene.templateId, "breadboard");
    assert.ok(scene.nodes.some((n) => n.layer === "base"));
  });

  it("routes by formSpec.templateId", () => {
    const robotPlan = {
      ...plan,
      formSpec: {
        templateId: "robot_chassis" as const,
        params: {},
        materials: {},
        layers: {},
        productCaption: "Bot",
        source: "fallback" as const,
        grade: "assumed" as const,
      },
    };
    const scene = buildProductScene3D(robotPlan);
    assert.equal(scene.templateId, "robot_chassis");
  });

  it("routes weather_stick by formSpec", () => {
    const p = {
      ...plan,
      formSpec: {
        templateId: "weather_stick" as const,
        params: {},
        materials: {},
        layers: {},
        productCaption: "Stick",
        source: "fallback" as const,
        grade: "medium" as const,
      },
    };
    assert.equal(buildProductScene3D(p).templateId, "weather_stick");
  });
});

describe("product-3d pose enrichment", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("heightScale stretches non-base Y", () => {
    const base = buildSatClockScene3D(plan);
    const poses = enrichPosesFromParams(base, {
      templateId: "sat_clock",
      params: { heightScale: 1.25 },
      materials: {},
      layers: {},
      productCaption: "x",
      source: "fallback",
      grade: "assumed",
    });
    const next = applyPoseLayout(base, poses);
    const face = next.nodes.find((n) => n.id === "face")!;
    const orig = base.nodes.find((n) => n.id === "face")!;
    assert.ok(face.position[1] > orig.position[1]);
    const ground = next.nodes.find((n) => n.id === "base")!;
    assert.deepEqual(ground.position, base.nodes.find((n) => n.id === "base")!.position);
  });

  it("wingSpan spreads solar wings", () => {
    const base = buildSatClockScene3D(plan);
    const poses = enrichPosesFromParams(base, {
      templateId: "sat_clock",
      params: { wingSpan: 1.4 },
      materials: {},
      layers: {},
      productCaption: "x",
      source: "fallback",
      grade: "assumed",
    });
    const next = applyPoseLayout(base, poses);
    const l = next.nodes.find((n) => n.id === "solar-l")!;
    const orig = base.nodes.find((n) => n.id === "solar-l")!;
    assert.ok(Math.abs(l.position[0]) > Math.abs(orig.position[0]));
  });

  it("sanitizePoseHints drops junk and clamps", () => {
    const h = sanitizePoseHints({
      face: { delta: [10, 0, 0] },
      bad: "nope",
      huge: { position: [9999, 0, 0] },
    });
    assert.ok(h?.face?.delta);
    assert.equal(h?.bad, undefined);
    assert.ok(h?.huge?.position);
    assert.ok((h!.huge.position![0] as number) <= 400);
  });

  it("layer delta applies to all nodes on layer", () => {
    const base = buildSatClockScene3D(plan);
    const poses = resolveHintsOntoScene(base, {
      wings: { delta: [5, 0, 0] },
    });
    assert.ok(poses["solar-l"]?.position);
    assert.ok(poses["solar-r"]?.position);
    assert.equal(
      poses["solar-l"]!.position![0],
      base.nodes.find((n) => n.id === "solar-l")!.position[0] + 5
    );
  });

  it("buildProductScene3D applies plan.scenePoses", () => {
    const plain = buildProductScene3D(plan, { enrich: false, reason: false });
    const withPose = buildProductScene3D(
      {
        ...plan,
        scenePoses: { face: { delta: [0, 12, 0] } },
      },
      { reason: false }
    );
    const faceE = withPose.nodes.find((n) => n.id === "face")!;
    const faceP = plain.nodes.find((n) => n.id === "face")!;
    // delta applied on Y (spatial reason off so pose not overwritten)
    assert.ok(faceE.position[1] >= faceP.position[1] + 11.5);
    assert.equal(withPose.source, "llm_enriched");
  });

  it("applyEnrichmentToScene marks llm_enriched", () => {
    const base = buildSatClockScene3D(plan);
    const next = applyEnrichmentToScene(base, {
      ...plan,
      scenePoses: { touch: { delta: [-20, 0, 0] } },
    });
    assert.equal(next.source, "llm_enriched");
    const touch = next.nodes.find((n) => n.id === "touch")!;
    const orig = base.nodes.find((n) => n.id === "touch")!;
    assert.ok(touch.position[0] < orig.position[0]);
  });
});

describe("product-3d pose layout", () => {
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);

  it("applyPoseLayout overrides node position", () => {
    const base = buildSatClockScene3D(plan);
    const face = base.nodes.find((n) => n.id === "face")!;
    const poses: PoseLayout3D = {
      face: { position: [10, 20, 30], rotation: [0.1, 0, 0] },
    };
    const next = applyPoseLayout(base, poses);
    const moved = next.nodes.find((n) => n.id === "face")!;
    assert.deepEqual(moved.position, [10, 20, 30]);
    assert.deepEqual(moved.rotation, [0.1, 0, 0]);
    // other nodes unchanged
    const baseNode = next.nodes.find((n) => n.id === "base")!;
    assert.deepEqual(baseNode.position, base.nodes.find((n) => n.id === "base")!.position);
    // original face unchanged
    assert.notDeepEqual(face.position, moved.position);
  });

  it("buildProductScene3D accepts poses option", () => {
    const scene = buildProductScene3D(plan, {
      poses: { brain: { position: [1, 2, 3] } },
    });
    assert.deepEqual(scene.nodes.find((n) => n.id === "brain")!.position, [1, 2, 3]);
  });

  it("applyFormLayoutToScene shifts layer nodes", () => {
    const base = buildSatClockScene3D(plan);
    const scene = applyFormLayoutToScene(base, {
      templateId: "sat_clock",
      params: {},
      materials: {},
      layers: {},
      layout: { face: { x: 40, y: 0 } },
      productCaption: "x",
      source: "fallback",
      grade: "assumed",
    });
    const face = scene.nodes.find((n) => n.id === "face")!;
    const orig = base.nodes.find((n) => n.id === "face")!;
    assert.ok(face.position[0] > orig.position[0]);
  });

});
