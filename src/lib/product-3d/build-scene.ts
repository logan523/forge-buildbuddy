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
 * Satellite desk clock — photo-matched form (Huy Vector Lab style).
 * Wire cube cage on thin metal stand; battery inside cage; solar wings from cube sides.
 * NOT bamboo coaster + picture frame.
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

  // Proportion lock (mm) — compact cube satellite
  const cage = 58; // cube edge
  const rodR = 1.0;
  const standH = 95;
  const footR = 10;
  const cageCy = standH + cage / 2; // cube center Y
  const wingW = cage * 1.15;
  const wingH = cage * 0.55;
  const oledW = cage * 0.58;
  const oledH = cage * 0.42;

  const nodes: SceneNode3D[] = [];

  // Thin metal stand (base layer)
  nodes.push({
    id: "base",
    layer: "base",
    partId: standPart?.id,
    ref: refOf(standPart),
    label: standPart?.name || "Metal stand",
    geom: { kind: "metal_stand", params: { stemR: 1.6, height: standH, footR, footH: 2.5 } },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: { color: "#a8b0b8", preset: "brass" },
    explodeDir: [0, -1, 0],
  });

  // Brass wire cube cage (frame)
  nodes.push({
    id: "frame",
    layer: "frame",
    partId: frame?.id,
    ref: refOf(frame),
    label: frame?.name || "Brass wire cage",
    geom: { kind: "wire_cube_cage", params: { size: cage, rodR } },
    position: [0, cageCy, 0],
    rotation: [0, 0, 0],
    material: { color: "#c9a227", preset: "brass" },
    explodeDir: [0, 0.6, 0],
  });

  // OLED module on front face (+Z) of cube
  nodes.push({
    id: "face",
    layer: "face",
    partId: oled?.id,
    ref: refOf(oled),
    label: oled?.name || "OLED display",
    geom: {
      kind: "oled_module",
      params: { width: oledW, height: oledH, depth: 3.5, bezel: 2.2, pcb: 1 },
    },
    position: [0, cageCy, cage / 2 + 1.5],
    rotation: [0, 0, 0],
    material: {
      color: "#0a1628",
      preset: "oled_glass",
      emissive: "#22c55e",
      emissiveIntensity: 0.55,
    },
    explodeDir: [0, 0, 1.2],
  });

  // Solar wings from cube left/right mid-edges — slight dihedral, not sky-tower
  const wingY = cageCy + cage * 0.08;
  const wingX = cage / 2 + wingW * 0.48;
  nodes.push({
    id: "solar-l",
    layer: "wings",
    partId: solar?.id,
    ref: refOf(solar),
    label: "Solar panel L",
    geom: { kind: "solar_module", params: { width: wingW, height: wingH, depth: 1.6, cells: 6 } },
    position: [-wingX, wingY, 0],
    rotation: [0.12, 0, 0.12], // slight pitch + dihedral
    material: { color: "#0c1222", preset: "solar_cell" },
    explodeDir: [-1.3, 0.2, 0],
  });
  nodes.push({
    id: "solar-r",
    layer: "wings",
    partId: solar?.id,
    label: "Solar panel R",
    geom: { kind: "solar_module", params: { width: wingW, height: wingH, depth: 1.6, cells: 6 } },
    position: [wingX, wingY, 0],
    rotation: [0.12, 0, -0.12],
    material: { color: "#0c1222", preset: "solar_cell" },
    explodeDir: [1.3, 0.2, 0],
  });
  // Short brass spars cube → wing
  nodes.push({
    id: "spar-l",
    layer: "wings",
    label: "Wing spar L",
    geom: { kind: "tube", params: { radius: 0.9, height: 14 } },
    position: [-(cage / 2 + 7), wingY, 0],
    rotation: [0, 0, Math.PI / 2],
    material: { color: "#c9a227", preset: "brass" },
    explodeDir: [-1, 0.1, 0],
  });
  nodes.push({
    id: "spar-r",
    layer: "wings",
    label: "Wing spar R",
    geom: { kind: "tube", params: { radius: 0.9, height: 14 } },
    position: [cage / 2 + 7, wingY, 0],
    rotation: [0, 0, Math.PI / 2],
    material: { color: "#c9a227", preset: "brass" },
    explodeDir: [1, 0.1, 0],
  });

  // Battery horizontal INSIDE cage
  nodes.push({
    id: "battery",
    layer: "power",
    partId: battery?.id,
    ref: refOf(battery),
    label: battery?.name || "Li-ion cell",
    geom: { kind: "cell_16340", params: { radius: 8, height: cage * 0.72 } },
    position: [0, cageCy + 2, -4],
    rotation: [0, 0, Math.PI / 2], // horizontal along X
    material: { color: "#1e293b", preset: "battery_body" },
    explodeDir: [0, 0, -1],
  });
  nodes.push({
    id: "straps",
    layer: "power",
    label: "Battery straps",
    geom: { kind: "battery_straps", params: { size: cage * 0.85, rodR: 0.7 } },
    position: [0, cageCy + 2, -4],
    rotation: [0, 0, 0],
    material: { color: "#c9a227", preset: "brass" },
    explodeDir: [0, 0.4, 0],
  });
  // Charger board on back of cage
  nodes.push({
    id: "charger",
    layer: "power",
    partId: charger?.id,
    ref: refOf(charger),
    label: charger?.name || "TP4056",
    geom: { kind: "pcb_module", params: { width: 22, height: 14, depth: 2, chips: 1 } },
    position: [0, cageCy - 8, -(cage / 2) - 1],
    rotation: [0, Math.PI, 0],
    material: { color: "#14532d", preset: "pcb_green" },
    explodeDir: [0, 0, -1.1],
  });

  // MCU small, behind OLED / inside front
  nodes.push({
    id: "brain",
    layer: "brain",
    partId: mcu?.id,
    ref: refOf(mcu),
    label: mcu?.name || "ESP32-C3",
    geom: { kind: "pcb_module", params: { width: 22, height: 16, depth: 2.2, chips: 2 } },
    position: [-12, cageCy - 6, cage / 2 - 8],
    rotation: [0, 0, 0],
    material: { color: "#14532d", preset: "pcb_green" },
    explodeDir: [0, 0, 0.8],
  });

  // Sensor inside / side of cage
  nodes.push({
    id: "sensor",
    layer: "sensor",
    partId: sensor?.id,
    ref: refOf(sensor),
    label: sensor?.name || "Sensor",
    geom: { kind: "box", params: { width: 10, height: 9, depth: 5 } },
    position: [14, cageCy - 4, cage / 2 - 10],
    rotation: [0, 0, 0],
    material: { color: "#d1fae5", preset: "sensor_body" },
    explodeDir: [0.4, 0, 0.6],
  });

  // Touch pad on TOP of cube
  nodes.push({
    id: "touch",
    layer: "touch",
    partId: touch?.id,
    ref: refOf(touch),
    label: touch?.name || "Touch switch",
    geom: { kind: "touch_pad", params: { radius: 7, height: 2.2 } },
    position: [0, cageCy + cage / 2 + 1.2, 0],
    rotation: [0, 0, 0],
    material: { color: "#c2410c", preset: "touch_pad" },
    explodeDir: [0, 1.2, 0],
  });

  return {
    units: "mm",
    rootScale: 0.012,
    nodes,
    cameraHint: {
      // ¾ product shot like the reference photo
      position: [0.95, 1.15, 1.05],
      target: [0, 0.95, 0],
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
