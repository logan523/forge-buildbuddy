/**
 * Deterministic ProductScene3D builders — "think through and create" the assembly.
 * One builder per FormSpec templateId; route via resolveFormSpec.
 */
import type { BuildPlan, Part } from "@/lib/types";
import { classifyRole } from "@/lib/product-visual/build-scene";
import { resolveFormSpec } from "@/lib/product-visual/formspec/resolve";
import type { FormLayerId, FormSpec } from "@/lib/product-visual/formspec/types";
import type { ProductScene3D, SceneNode3D, PoseLayout3D } from "./types";
import { applyPoseLayout } from "./types";
import { applyEnrichmentToScene } from "./enrich-poses";
import { applySpatialReasoning } from "./spatial-reason";
import { attachConnectionSpars } from "./connection-spars";
import { applyCatalogHints } from "./catalog";
import {
  REAL_PARTS,
  LIFE_LAYOUT,
  deriveCageEdgeMm,
  boardGeomParams,
  cellGeomParams,
  solarGeomParams,
} from "./real-parts";

function findPart(parts: Part[], pred: (p: Part, role: string) => boolean): Part | undefined {
  return parts.find((p) => pred(p, classifyRole(p)));
}

function refOf(p?: Part): string | undefined {
  return p?.ref;
}

/** Map FormSpec 2D layout offsets (px) → coarse 3D mm deltas on first node of each layer. */
export function posesFromFormLayout(spec: FormSpec): PoseLayout3D {
  const layout = spec.layout;
  if (!layout) return {};
  // SVG template space ~480×320; convert small drag deltas to mm (≈0.25 mm/px)
  const k = 0.25;
  const poses: PoseLayout3D = {};
  // Node ids that typically match layer ids in our builders
  for (const [layer, off] of Object.entries(layout)) {
    if (!off) continue;
    const dx = (off.x || 0) * k;
    const dy = -(off.y || 0) * k; // SVG y-down → scene y-up-ish offset
    const rot = ((off.rot || 0) * Math.PI) / 180;
    // Store as relative hint keyed by layer; applied in applyFormLayoutToScene by layer match
    poses[`__layer__${layer}`] = {
      position: [dx, dy, 0],
      rotation: [0, 0, rot],
    };
  }
  return poses;
}

/** Apply layer-keyed form layout deltas onto matching nodes (additive on template pose). */
export function applyFormLayoutToScene(scene: ProductScene3D, spec: FormSpec): ProductScene3D {
  const layerPoses = posesFromFormLayout(spec);
  if (Object.keys(layerPoses).length === 0) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((n) => {
      const lp = layerPoses[`__layer__${n.layer}`];
      if (!lp?.position) return n;
      const [dx, dy, dz] = lp.position;
      // Only shift if form layout has non-zero offset (absolute px stored as delta from 0 editor default)
      if (dx === 0 && dy === 0 && dz === 0 && !lp.rotation?.[2]) return n;
      // Treat layout x/y as absolute editor coords only when large; else additive. Prefer additive deltas from 0.
      return {
        ...n,
        position: [n.position[0] + dx, n.position[1] + dy, n.position[2] + dz],
        rotation: lp.rotation
          ? ([
              n.rotation[0] + (lp.rotation[0] || 0),
              n.rotation[1] + (lp.rotation[1] || 0),
              n.rotation[2] + (lp.rotation[2] || 0),
            ] as [number, number, number])
          : n.rotation,
      };
    }),
  };
}

/**
 * Satellite desk clock — life-size real parts (datasheet mm).
 * Brass wire cube on stand; 16340 inside; OLED / ESP / TP4056 / solar from RealPartSpec.
 * Electronics are NEVER sized as cage ratios.
 */
export function buildSatClockScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const oled = findPart(parts, (_, r) => r === "display");
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const sensor = findPart(parts, (_, r) => r === "sensor");
  const touch = findPart(parts, (_, r) => r === "input");
  const solar = findPart(parts, (_, r) => r === "solar");
  const battery = findPart(parts, (_, r) => r === "battery");
  const frame = findPart(parts, (p, r) => r === "mech" && /brass|frame|wire/i.test(p.name));
  const standPart = findPart(parts, (p, r) => r === "mech" && /stand|rod|pole|mast/i.test(p.name));
  const charger = findPart(parts, (p, r) => r === "power" && /tp4056|charg/i.test(p.name + p.specification));

  // --- Real part specs (dimension authority) ---
  const esp = REAL_PARTS.esp32_c3;
  const oledSpec = REAL_PARTS.oled_096;
  const tp = REAL_PARTS.tp4056;
  const cell = REAL_PARTS.cell_16340;
  const solarSpec = REAL_PARTS.solar_cell;
  const sht = REAL_PARTS.sht30;
  const ttp = REAL_PARTS.ttp223;

  const espG = boardGeomParams(esp);
  const oledG = boardGeomParams(oledSpec);
  const tpG = boardGeomParams(tp);
  const cellG = cellGeomParams(cell);
  const solarG = solarGeomParams(solarSpec);
  const shtG = boardGeomParams(sht);

  // Cage fits cell + clearance (craft), not the other way around
  const cage = deriveCageEdgeMm([cell, esp, oledSpec, tp]);
  const rodR = LIFE_LAYOUT.rodRadiusMm;
  const standH = LIFE_LAYOUT.standStemHeightMm;
  const footR = LIFE_LAYOUT.standFootRadiusMm;
  const cageCy = standH + cage / 2;

  const nodes: SceneNode3D[] = [];

  nodes.push({
    id: "base",
    layer: "base",
    partId: standPart?.id,
    ref: refOf(standPart),
    label: standPart?.name || "Metal stand",
    geom: {
      kind: "metal_stand",
      params: {
        stemR: LIFE_LAYOUT.standStemRadiusMm,
        height: standH,
        footR,
        footH: LIFE_LAYOUT.standFootHeightMm,
      },
    },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: { color: "#c5cdd4", preset: "brass" },
    explodeDir: [0, -1, 0],
    parentId: null,
  });

  nodes.push({
    id: "frame",
    layer: "frame",
    partId: frame?.id,
    ref: refOf(frame),
    label: frame?.name || "Brass wire cage",
    geom: { kind: "wire_cube_cage", params: { size: cage, rodR } },
    position: [0, cageCy, 0],
    rotation: [0, 0, 0],
    material: { color: "#d4a84b", preset: "brass" },
    explodeDir: [0, 0.6, 0],
    parentId: "base",
  });

  // Face panel sized to cage; cutout matches real OLED module + margin
  const panelMargin = 2;
  nodes.push({
    id: "face-panel",
    layer: "face",
    label: "Front face panel",
    geom: {
      kind: "face_panel",
      params: {
        width: cage - 4,
        height: cage - 4,
        depth: 2.0,
        cutoutW: oledG.width + panelMargin,
        cutoutH: oledG.height + panelMargin,
      },
    },
    position: [0, cageCy, cage / 2 + 0.4],
    rotation: [0, 0, 0],
    material: { color: "#1e293b", metalness: 0.25, roughness: 0.45 },
    explodeDir: [0, 0, 1.0],
    parentId: "frame",
  });

  nodes.push({
    id: "rear-panel",
    layer: "power",
    label: "Rear service panel",
    geom: {
      kind: "rear_panel",
      params: { width: cage - 6, height: cage - 6, depth: 1.8 },
    },
    position: [0, cageCy, -(cage / 2) - 0.3],
    rotation: [0, 0, 0],
    material: { color: "#334155", metalness: 0.3, roughness: 0.5 },
    explodeDir: [0, 0, -1.0],
    parentId: "frame",
  });

  // 0.96" OLED — real module mm (not cage * 0.62)
  nodes.push({
    id: "face",
    layer: "face",
    partId: oled?.id,
    ref: refOf(oled),
    label: oled?.name || oledSpec.mpnOrSku,
    catalogId: "oled_096",
    geom: {
      kind: "oled_module",
      params: {
        width: oledG.width,
        height: oledG.height,
        depth: oledG.depth,
        bezel: 2.5,
        pcb: 1,
      },
    },
    position: [0, cageCy, cage / 2 + oledG.depth / 2 + 1.2],
    rotation: [0, 0, 0],
    material: {
      color: "#0a1628",
      preset: "oled_glass",
      emissive: "#22c55e",
      emissiveIntensity: 0.75,
    },
    explodeDir: [0, 0, 1.2],
    parentId: "face-panel",
  });

  // Craft solar panels — locked 60×45 SKU, not cage-proportional wings
  const wingY = cageCy;
  const sparLen = 10;
  const wingX = cage / 2 + sparLen + solarG.width * 0.48;
  nodes.push({
    id: "solar-l",
    layer: "wings",
    partId: solar?.id,
    ref: refOf(solar),
    label: "Solar panel L",
    catalogId: "solar_cell",
    geom: {
      kind: "solar_module",
      params: { width: solarG.width, height: solarG.height, depth: solarG.depth, cells: solarG.cells },
    },
    position: [-wingX, wingY, 0],
    rotation: [0.12, 0, 0.12],
    material: { color: "#0a1020", preset: "solar_cell" },
    explodeDir: [-1.3, 0.2, 0],
    parentId: "frame",
  });
  nodes.push({
    id: "solar-r",
    layer: "wings",
    partId: solar?.id,
    label: "Solar panel R",
    catalogId: "solar_cell",
    geom: {
      kind: "solar_module",
      params: { width: solarG.width, height: solarG.height, depth: solarG.depth, cells: solarG.cells },
    },
    position: [wingX, wingY, 0],
    rotation: [0.12, 0, -0.12],
    material: { color: "#0a1020", preset: "solar_cell" },
    explodeDir: [1.3, 0.2, 0],
    parentId: "frame",
  });
  nodes.push({
    id: "spar-l",
    layer: "wings",
    label: "Wing spar L",
    geom: { kind: "tube", params: { radius: 1.2, height: sparLen } },
    position: [-(cage / 2 + sparLen / 2), wingY, 0],
    rotation: [0, 0, Math.PI / 2],
    material: { color: "#d4a84b", preset: "brass" },
    explodeDir: [-1, 0.1, 0],
    parentId: "solar-l",
  });
  nodes.push({
    id: "spar-r",
    layer: "wings",
    label: "Wing spar R",
    geom: { kind: "tube", params: { radius: 1.2, height: sparLen } },
    position: [cage / 2 + sparLen / 2, wingY, 0],
    rotation: [0, 0, Math.PI / 2],
    material: { color: "#d4a84b", preset: "brass" },
    explodeDir: [1, 0.1, 0],
    parentId: "solar-r",
  });

  // 16340 — Ø16.5 × 34 mm (true cell, not illustration blob)
  nodes.push({
    id: "battery",
    layer: "power",
    partId: battery?.id,
    ref: refOf(battery),
    label: battery?.name || cell.mpnOrSku,
    catalogId: "cell_16340",
    geom: { kind: "cell_16340", params: { radius: cellG.radius, height: cellG.height } },
    position: [0, cageCy, 0],
    rotation: [0, 0, Math.PI / 2],
    material: { color: "#1e293b", preset: "battery_body" },
    explodeDir: [0, 0, -1],
    parentId: "frame",
  });
  nodes.push({
    id: "straps",
    layer: "power",
    label: "Battery straps",
    geom: {
      kind: "battery_straps",
      params: { size: Math.min(cage - 4, cellG.height + 6), rodR: 1.0 },
    },
    position: [0, cageCy, 0],
    rotation: [0, 0, 0],
    material: { color: "#d4a84b", preset: "brass" },
    explodeDir: [0, 0.4, 0],
    parentId: "battery",
  });

  // TP4056 — real module footprint on rear panel
  nodes.push({
    id: "charger",
    layer: "power",
    partId: charger?.id,
    ref: refOf(charger),
    label: charger?.name || tp.mpnOrSku,
    catalogId: "tp4056",
    geom: {
      kind: "pcb_module",
      params: { width: tpG.width, height: tpG.height, depth: tpG.depth, chips: 1 },
    },
    position: [0, cageCy - 2, -(cage / 2) - tpG.depth / 2 - 1.0],
    rotation: [0, Math.PI, 0],
    material: { color: "#14532d", preset: "pcb_green" },
    explodeDir: [0, 0, -1.1],
    parentId: "rear-panel",
  });

  // ESP32-C3 SuperMini — ~22.5×18 inside front of cage
  nodes.push({
    id: "brain",
    layer: "brain",
    partId: mcu?.id,
    ref: refOf(mcu),
    label: mcu?.name || esp.mpnOrSku,
    catalogId: "esp32_c3",
    geom: {
      kind: "pcb_module",
      params: { width: espG.width, height: espG.height, depth: espG.depth, chips: 3 },
    },
    position: [-espG.width * 0.15, cageCy - 2, cage / 2 - espG.depth - 6],
    rotation: [0, 0, 0],
    material: { color: "#14532d", preset: "pcb_green" },
    explodeDir: [0, 0, 0.8],
    parentId: "frame",
  });

  nodes.push({
    id: "sensor",
    layer: "sensor",
    partId: sensor?.id,
    ref: refOf(sensor),
    label: sensor?.name || sht.mpnOrSku,
    catalogId: "sht30",
    geom: {
      kind: "pcb_module",
      params: { width: shtG.width, height: shtG.height, depth: shtG.depth, chips: 1 },
    },
    position: [cage / 2 - shtG.width / 2 - 3, cageCy - 1, cage / 2 - 8],
    rotation: [0, 0, 0],
    material: { color: "#166534", preset: "pcb_green" },
    explodeDir: [0.4, 0, 0.6],
    parentId: "frame",
  });

  // TTP223 — real board footprint as touch pad radius ≈ half diagonal of pad face
  const touchR = Math.max(ttp.bboxMm.l, ttp.bboxMm.w) / 2;
  nodes.push({
    id: "touch",
    layer: "touch",
    partId: touch?.id,
    ref: refOf(touch),
    label: touch?.name || ttp.mpnOrSku,
    catalogId: "ttp223",
    geom: { kind: "touch_pad", params: { radius: touchR, height: ttp.bboxMm.h } },
    position: [0, cageCy + cage / 2 + ttp.bboxMm.h / 2 + 0.4, 0],
    rotation: [0, 0, 0],
    material: { color: "#c2410c", preset: "touch_pad" },
    explodeDir: [0, 1.2, 0],
    parentId: "frame",
  });

  return {
    units: "mm",
    rootScale: 0.012,
    nodes,
    cameraHint: {
      position: [2.4, 2.0, 2.7],
      target: [0, 0.65, 0],
    },
    source: plan.id === "sat-line-smart-clock" ? "demo_golden" : "parametric",
    grade: plan.id === "sat-line-smart-clock" ? "high" : "medium",
    templateId: "sat_clock",
  };
}

/** Weather stick / mast sensor tower. */
export function buildWeatherStickScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const sensor = findPart(parts, (_, r) => r === "sensor");
  const battery = findPart(parts, (_, r) => r === "battery");
  const h = 1;

  const nodes: SceneNode3D[] = [
    {
      id: "base",
      layer: "base",
      label: "Stake base",
      geom: { kind: "disk", params: { radius: 28, height: 6 } },
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: "#78716c", roughness: 0.9, metalness: 0.1 },
      explodeDir: [0, -1, 0],
    },
    {
      id: "mast",
      layer: "mast",
      label: "Mast",
      geom: { kind: "tube", params: { radius: 4, height: 180 * h } },
      position: [0, 90 * h, 0],
      rotation: [0, 0, 0],
      material: { color: "#94a3b8", metalness: 0.7, roughness: 0.35 },
      explodeDir: [0, 1, 0],
    },
    {
      id: "sensor-head",
      layer: "sensor",
      partId: sensor?.id,
      ref: refOf(sensor),
      label: sensor?.name || "Sensor head",
      geom: { kind: "box", params: { width: 36, height: 28, depth: 28 } },
      position: [0, 185 * h, 0],
      rotation: [0, 0, 0],
      material: { color: "#ecfdf5", metalness: 0.1, roughness: 0.45, emissive: "#059669", emissiveIntensity: 0.15 },
      explodeDir: [0, 1.2, 0],
    },
    {
      id: "brain",
      layer: "brain",
      partId: mcu?.id,
      ref: refOf(mcu),
      label: mcu?.name || "Controller",
      geom: { kind: "board", params: { width: 28, height: 18, depth: 2.5 } },
      position: [8, 110, 0],
      rotation: [0, 0, Math.PI / 2],
      material: { color: "#14532d", metalness: 0.15, roughness: 0.55 },
      explodeDir: [1, 0, 0],
    },
  ];

  if (battery) {
    nodes.push({
      id: "battery",
      layer: "power",
      partId: battery.id,
      ref: refOf(battery),
      label: battery.name,
      geom: { kind: "cell_16340", params: { radius: 7, height: 30 } },
      position: [-12, 40, 6],
      rotation: [0, 0, Math.PI / 2],
      material: { color: "#334155", metalness: 0.5, roughness: 0.4 },
      explodeDir: [-1, 0, 0],
    });
  }

  return {
    units: "mm",
    rootScale: 0.01,
    nodes,
    cameraHint: { position: [0.7, 1.2, 0.9], target: [0, 0.9, 0] },
    source: "parametric",
    grade: "medium",
    templateId: "weather_stick",
  };
}

/** Small wheeled robot chassis. */
export function buildRobotChassisScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const sensor = findPart(parts, (_, r) => r === "sensor");
  const battery = findPart(parts, (_, r) => r === "battery");

  const nodes: SceneNode3D[] = [
    {
      id: "body",
      layer: "body",
      label: "Chassis",
      geom: { kind: "box", params: { width: 90, height: 28, depth: 55 } },
      position: [0, 22, 0],
      rotation: [0, 0, 0],
      material: { color: "#d6d3d1", roughness: 0.65, metalness: 0.15 },
      explodeDir: [0, 1, 0],
    },
    {
      id: "wheel-l",
      layer: "wheels",
      label: "Wheel L",
      geom: { kind: "disk", params: { radius: 14, height: 8 } },
      position: [-38, 14, 0],
      rotation: [0, 0, Math.PI / 2],
      material: { color: "#1e293b", metalness: 0.2, roughness: 0.7 },
      explodeDir: [-1, 0, 0],
    },
    {
      id: "wheel-r",
      layer: "wheels",
      label: "Wheel R",
      geom: { kind: "disk", params: { radius: 14, height: 8 } },
      position: [38, 14, 0],
      rotation: [0, 0, Math.PI / 2],
      material: { color: "#1e293b", metalness: 0.2, roughness: 0.7 },
      explodeDir: [1, 0, 0],
    },
    {
      id: "brain",
      layer: "brain",
      partId: mcu?.id,
      ref: refOf(mcu),
      label: mcu?.name || "Controller",
      geom: { kind: "board", params: { width: 32, height: 20, depth: 2.5 } },
      position: [0, 38, 0],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: "#14532d", metalness: 0.15, roughness: 0.55 },
      explodeDir: [0, 1.2, 0],
    },
    {
      id: "sensor",
      layer: "sensor",
      partId: sensor?.id,
      ref: refOf(sensor),
      label: sensor?.name || "Front sensor",
      geom: { kind: "box", params: { width: 14, height: 18, depth: 10 } },
      position: [0, 30, 30],
      rotation: [0, 0, 0],
      material: { color: "#fef3c7", metalness: 0.1, roughness: 0.45 },
      explodeDir: [0, 0, 1.2],
    },
  ];

  if (battery) {
    nodes.push({
      id: "battery",
      layer: "power",
      partId: battery.id,
      ref: refOf(battery),
      label: battery.name,
      geom: { kind: "box", params: { width: 40, height: 12, depth: 20 } },
      position: [0, 12, -8],
      rotation: [0, 0, 0],
      material: { color: "#334155", metalness: 0.4, roughness: 0.45 },
      explodeDir: [0, -1, 0],
    });
  }

  return {
    units: "mm",
    rootScale: 0.014,
    nodes,
    cameraHint: { position: [0.85, 0.55, 0.9], target: [0, 0.2, 0] },
    source: "parametric",
    grade: "medium",
    templateId: "robot_chassis",
  };
}

/** Rounded sensor pod / enclosure. */
export function buildSensorPodScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const sensor = findPart(parts, (_, r) => r === "sensor");

  const nodes: SceneNode3D[] = [
    {
      id: "shell",
      layer: "shell",
      label: "Pod shell",
      geom: { kind: "box", params: { width: 55, height: 70, depth: 45 } },
      position: [0, 35, 0],
      rotation: [0, 0, 0],
      material: { color: "#e9d5ff", roughness: 0.55, metalness: 0.12 },
      explodeDir: [0, 1, 0],
    },
    {
      id: "sensor",
      layer: "sensor",
      partId: sensor?.id,
      ref: refOf(sensor),
      label: sensor?.name || "Sensor window",
      geom: { kind: "disk", params: { radius: 12, height: 4 } },
      position: [0, 48, 22],
      rotation: [Math.PI / 2, 0, 0],
      material: { color: "#34d399", metalness: 0.2, roughness: 0.4, emissive: "#059669", emissiveIntensity: 0.2 },
      explodeDir: [0, 0, 1.2],
    },
    {
      id: "brain",
      layer: "brain",
      partId: mcu?.id,
      ref: refOf(mcu),
      label: mcu?.name || "Controller",
      geom: { kind: "board", params: { width: 26, height: 16, depth: 2 } },
      position: [0, 28, 0],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: "#14532d", metalness: 0.15, roughness: 0.55 },
      explodeDir: [0, -0.5, 1],
    },
  ];

  return {
    units: "mm",
    rootScale: 0.016,
    nodes,
    cameraHint: { position: [0.7, 0.6, 0.85], target: [0, 0.35, 0] },
    source: "parametric",
    grade: "assumed",
    templateId: "sensor_pod",
  };
}

/** Boxed gadget / generic enclosure. */
export function buildBoxedScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const display = findPart(parts, (_, r) => r === "display");
  const sensor = findPart(parts, (_, r) => r === "sensor");
  const battery = findPart(parts, (_, r) => r === "battery");

  const nodes: SceneNode3D[] = [
    {
      id: "shell",
      layer: "shell",
      label: "Enclosure",
      geom: { kind: "box", params: { width: 80, height: 40, depth: 50 } },
      position: [0, 20, 0],
      rotation: [0, 0, 0],
      material: { color: "#d6d3d1", roughness: 0.7, metalness: 0.1 },
      explodeDir: [0, 1, 0],
    },
    {
      id: "brain",
      layer: "brain",
      partId: mcu?.id,
      ref: refOf(mcu),
      label: mcu?.name || "Controller",
      geom: { kind: "board", params: { width: 30, height: 20, depth: 2 } },
      position: [0, 18, 5],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: "#14532d", roughness: 0.5, metalness: 0.15 },
      explodeDir: [0, 0, 1],
    },
  ];
  if (display) {
    nodes.push({
      id: "face",
      layer: "face",
      partId: display.id,
      ref: refOf(display),
      label: display.name,
      geom: { kind: "oled_panel", params: { width: 40, height: 22, depth: 2 } },
      position: [0, 28, 26],
      rotation: [0, 0, 0],
      material: { color: "#0b1220", emissive: "#0e7490", emissiveIntensity: 0.3, roughness: 0.4 },
      explodeDir: [0, 0, 1.2],
    });
  }
  if (sensor) {
    nodes.push({
      id: "sensor",
      layer: "sensor",
      partId: sensor.id,
      ref: refOf(sensor),
      label: sensor.name,
      geom: { kind: "box", params: { width: 12, height: 10, depth: 6 } },
      position: [22, 28, 18],
      rotation: [0, 0, 0],
      material: { color: "#bbf7d0", roughness: 0.5, metalness: 0.1 },
      explodeDir: [0.8, 0, 0.5],
    });
  }
  if (battery) {
    nodes.push({
      id: "battery",
      layer: "power",
      partId: battery.id,
      ref: refOf(battery),
      label: battery.name,
      geom: { kind: "cell_16340", params: { radius: 7, height: 28 } },
      position: [-18, 14, -8],
      rotation: [0, 0, Math.PI / 2],
      material: { color: "#334155", metalness: 0.5, roughness: 0.4 },
      explodeDir: [0, 0, -1],
    });
  }
  return {
    units: "mm",
    rootScale: 0.015,
    nodes,
    cameraHint: { position: [1, 0.7, 1], target: [0, 0.2, 0] },
    source: "parametric",
    grade: "assumed",
    templateId: "boxed_gadget",
  };
}

/** Breadboard proto layout (flat). */
export function buildBreadboardScene3D(plan: BuildPlan): ProductScene3D {
  const parts = plan.parts || [];
  const mcu = findPart(parts, (_, r) => r === "mcu");
  const nodes: SceneNode3D[] = [
    {
      id: "board",
      layer: "base",
      label: "Breadboard",
      geom: { kind: "box", params: { width: 100, height: 8, depth: 60 } },
      position: [0, 4, 0],
      rotation: [0, 0, 0],
      material: { color: "#f8fafc", roughness: 0.85, metalness: 0.05 },
      explodeDir: [0, -1, 0],
    },
  ];
  if (mcu) {
    nodes.push({
      id: "brain",
      layer: "brain",
      partId: mcu.id,
      ref: refOf(mcu),
      label: mcu.name,
      geom: { kind: "board", params: { width: 28, height: 18, depth: 2 } },
      position: [-10, 12, 0],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: "#14532d", roughness: 0.5, metalness: 0.15 },
      explodeDir: [0, 1, 0],
    });
  }
  // Scatter remaining roles as small boards
  let i = 0;
  for (const p of parts) {
    if (mcu && p.id === mcu.id) continue;
    const role = classifyRole(p);
    if (role === "mech") continue;
    const layer: FormLayerId =
      role === "display" ? "face" : role === "sensor" ? "sensor" : role === "power" || role === "battery" ? "power" : "body";
    nodes.push({
      id: `part-${p.id || i}`,
      layer,
      partId: p.id,
      ref: refOf(p),
      label: p.name,
      geom: { kind: "box", params: { width: 16, height: 10, depth: 4 } },
      position: [15 + (i % 3) * 20, 12, -15 + Math.floor(i / 3) * 18],
      rotation: [-Math.PI / 2, 0, 0],
      material: { color: role === "sensor" ? "#bbf7d0" : "#e2e8f0", roughness: 0.5, metalness: 0.1 },
      explodeDir: [0, 1 + i * 0.1, 0],
    });
    i++;
    if (i >= 6) break;
  }
  return {
    units: "mm",
    rootScale: 0.014,
    nodes,
    cameraHint: { position: [0.8, 0.9, 0.7], target: [0, 0.05, 0] },
    source: "parametric",
    grade: "assumed",
    templateId: "breadboard",
  };
}

export function buildProductScene3D(
  plan: BuildPlan,
  opts?: {
    poses?: PoseLayout3D | null;
    applyFormLayout?: boolean;
    /** Apply FormSpec params + plan.scenePoses (default true) */
    enrich?: boolean;
    /** Spatial design-intent brain (default true) */
    reason?: boolean;
    /** Auto wiring spars from electrical nets (default true) */
    spars?: boolean;
  }
): ProductScene3D {
  const form = resolveFormSpec(plan);
  let scene: ProductScene3D;
  switch (form.templateId) {
    case "sat_clock":
      scene = buildSatClockScene3D(plan);
      break;
    case "weather_stick":
      scene = buildWeatherStickScene3D(plan);
      break;
    case "robot_chassis":
      scene = buildRobotChassisScene3D(plan);
      break;
    case "sensor_pod":
      scene = buildSensorPodScene3D(plan);
      break;
    case "boxed_gadget":
      scene = buildBoxedScene3D(plan);
      break;
    case "breadboard":
    default:
      // Heuristic fallback when template is breadboard but title screams sat clock
      if (/sat|clock|bamboo|solar/i.test(`${plan.title} ${plan.description}`)) {
        scene = buildSatClockScene3D(plan);
      } else {
        scene = buildBreadboardScene3D(plan);
      }
      break;
  }

  // Upgrade grade/source from form when golden
  if (form.source === "demo_golden") {
    scene = { ...scene, source: "demo_golden", grade: form.grade === "high" ? "high" : scene.grade };
  }

  if (opts?.applyFormLayout !== false) {
    scene = applyFormLayoutToScene(scene, form);
  }
  // Param + LLM pose enrichment (before explicit user poses)
  if (opts?.enrich !== false) {
    scene = applyEnrichmentToScene(scene, { ...plan, formSpec: form });
  }
  // Design brain: solar sky-facing, power low, display forward, …
  if (opts?.reason !== false) {
    scene = applySpatialReasoning(scene).scene;
  }
  // Catalog electronics tags (GLB path or parametric catalog mesh)
  scene = {
    ...scene,
    nodes: applyCatalogHints(scene.nodes),
  };
  // Wiring spars from electrical graph
  if (opts?.spars !== false) {
    scene = attachConnectionSpars(scene, plan);
  }
  if (opts?.poses) {
    scene = applyPoseLayout(scene, opts.poses);
  }
  return scene;
}

export function uniqueLayers(scene: ProductScene3D): { id: FormLayerId; label: string }[] {
  const map = new Map<string, string>();
  for (const n of scene.nodes) {
    if (!map.has(n.layer)) map.set(n.layer, n.label.split(" ")[0] || n.layer);
  }
  const labels: Record<string, string> = {
    base: scene.templateId === "sat_clock" ? "Stand" : "Base",
    frame: scene.templateId === "sat_clock" ? "Cage" : "Frame",
    face: "Screen",
    wings: "Solar",
    brain: "MCU",
    sensor: "Sensor",
    touch: "Touch",
    power: "Battery",
    shell: "Case",
    body: "Body",
    wheels: "Wheels",
    mast: "Mast",
  };
  return [...map.keys()].map((id) => ({
    id: id as FormLayerId,
    label: labels[id] || map.get(id) || id,
  }));
}
