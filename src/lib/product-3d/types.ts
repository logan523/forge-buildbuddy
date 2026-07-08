import type { FormLayerId } from "@/lib/product-visual/formspec/types";

export type GeomKind =
  | "disk"
  | "box"
  | "board"
  | "cylinder"
  | "cell_16340"
  | "oled_panel"
  | "solar_panel"
  | "wire_frame"
  | "touch_pad"
  | "tube"
  /** Composite high-fidelity kinds (multi-mesh) */
  | "bamboo_base"
  | "oled_module"
  | "solar_module"
  | "pcb_module"
  | "brass_frame"
  /** Photo-matched sat_clock: thin brass rod cube cage */
  | "wire_cube_cage"
  /** Thin metal stand (stem + foot) */
  | "metal_stand"
  /** Battery retention straps/rings inside cage */
  | "battery_straps";

export interface GeomSpec {
  kind: GeomKind;
  /** mm-ish params, interpreted per kind */
  params: Record<string, number>;
}

export interface SceneMaterial {
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Optional PBR preset id (bamboo, brass, …) — see materials.ts */
  preset?: string;
}

export interface SceneNode3D {
  id: string;
  layer: FormLayerId;
  partId?: string;
  ref?: string;
  label: string;
  geom: GeomSpec;
  /** Local position in scene units (mm / 10 for display scale) */
  position: [number, number, number];
  rotation: [number, number, number];
  material: SceneMaterial;
  parentId?: string | null;
  /** Direction used for explode offset */
  explodeDir?: [number, number, number];
  /** Catalog electronics id (esp32_c3, oled_096, …) */
  catalogId?: string;
  /** Optional GLB URL; parametric fallback if missing/unloadable */
  assetUrl?: string;
}

export interface ProductScene3D {
  units: "mm";
  /** Scale scene units → world (typically 0.01 so 100mm → 1 unit) */
  rootScale: number;
  nodes: SceneNode3D[];
  /** Wiring spars from electrical nets */
  edges?: import("./connection-spars").SceneEdge3D[];
  cameraHint: {
    position: [number, number, number];
    target: [number, number, number];
  };
  source: "parametric" | "llm_enriched" | "demo_golden";
  grade: "high" | "medium" | "assumed";
  templateId: string;
  /**
   * Design-intent notes from spatial reasoning brain
   * (solar sky-facing, power low, display forward, …).
   */
  reasoningNotes?: import("./spatial-reason").SpatialReasonNote[];
}

export interface LayerViewState {
  /** layer id → visible */
  visible: Record<string, boolean>;
  /** if set, only this layer full; others ghosted */
  soloLayerId: string | null;
  /** 0 = assembled, 1 = fully exploded */
  explode: number;
  selectedNodeId: string | null;
}

/** Per-node pose override (template defaults + user/LLM edit). Keyed by node id. */
export interface NodePose3D {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export type PoseLayout3D = Record<string, NodePose3D>;

export function defaultLayerView(nodes: SceneNode3D[]): LayerViewState {
  const visible: Record<string, boolean> = {};
  for (const n of nodes) visible[n.layer] = true;
  return {
    visible,
    soloLayerId: null,
    explode: 0,
    selectedNodeId: null,
  };
}

/** Merge pose overrides onto template nodes (immutable). */
export function applyPoseLayout(scene: ProductScene3D, poses?: PoseLayout3D | null): ProductScene3D {
  if (!poses || Object.keys(poses).length === 0) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((n) => {
      const p = poses[n.id];
      if (!p) return n;
      return {
        ...n,
        position: p.position ?? n.position,
        rotation: p.rotation ?? n.rotation,
      };
    }),
  };
}

/** Extract current poses from scene (for persistence). */
export function extractPoseLayout(scene: ProductScene3D): PoseLayout3D {
  const out: PoseLayout3D = {};
  for (const n of scene.nodes) {
    out[n.id] = { position: [...n.position] as [number, number, number], rotation: [...n.rotation] as [number, number, number] };
  }
  return out;
}

/** Pure helper for tests + renderer. Positions stay in mm; viewer applies rootScale. */
export function computeNodeWorldPosition(
  node: SceneNode3D,
  view: LayerViewState,
  /** explode distance in mm when explode=1 */
  explodeDistance = 28
): [number, number, number] {
  const [x, y, z] = node.position;
  if (view.explode <= 0 || !node.explodeDir) return [x, y, z];
  const [dx, dy, dz] = node.explodeDir;
  // explodeDir is a unit-ish direction; scale by distance
  const len = Math.hypot(dx, dy, dz) || 1;
  const t = (view.explode * explodeDistance) / len;
  return [x + dx * t, y + dy * t, z + dz * t];
}

export function nodeOpacity(node: SceneNode3D, view: LayerViewState): number {
  if (view.visible[node.layer] === false) return 0;
  if (view.soloLayerId && view.soloLayerId !== node.layer) return 0.08;
  if (view.selectedNodeId && view.selectedNodeId === node.id) return 1;
  return 1;
}

export function nodeVisible(node: SceneNode3D, view: LayerViewState): boolean {
  return nodeOpacity(node, view) > 0.01;
}

/** Map step media / keywords → layer to focus */
export function focusLayerForStep(title: string, description: string, mediaKind?: string): FormLayerId | null {
  const t = `${title} ${description} ${mediaKind || ""}`.toLowerCase();
  // Prefer explicit media kinds
  if (mediaKind === "oled_desolder" || mediaKind === "i2c_wiring") {
    if (mediaKind === "oled_desolder") return "face";
    return "brain";
  }
  if (mediaKind === "wire_bend_frame" || mediaKind === "cut_jumpers") return "frame";
  if (mediaKind === "battery_id_poles") return "power";
  if (mediaKind === "touch_mount") return "touch";
  if (mediaKind === "solar_panel_mount") return "wings";
  if (mediaKind === "usb_upload") return "brain";
  if (mediaKind === "bamboo_base_drill") return "base";
  if (mediaKind === "final_assembly") return "face";

  if (/oled|display|ssd1306|desolder/.test(t)) return "face";
  if (/\bi2c\b|sda|scl|gpio4|gpio5|wire all/.test(t)) return "brain";
  if (/brass|bend|wire frame|copper tube/.test(t) && !/jumper|cut/.test(t)) return "frame";
  if (/touch|ttp223/.test(t)) return "touch";
  if (/solar/.test(t)) return "wings";
  if (/battery|tp4056|16340/.test(t)) return "power";
  if (/sensor|sht|temp|humid/.test(t)) return "sensor";
  if (/esp|mcu|upload|firmware|usb/.test(t)) return "brain";
  if (/bamboo|coaster/.test(t)) return "base";
  return null;
}
