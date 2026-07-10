/**
 * Pure assembly-view state — CAD-like mess-with without WebGL.
 * Tree select, hide, solo, explode, present-for-step, section cut.
 */
import type { FormLayerId } from "@/lib/product-visual/formspec/types";
import type { ProductScene3D, SceneNode3D, LayerViewState } from "./types";
import { defaultLayerView, focusLayerForStep } from "./types";

export interface SectionPlane {
  axis: "y" | "z";
  enabled: boolean;
  /** 0–1 along scene bounds; 0.5 = mid */
  offset: number;
}

/** Extended view for the in-app assembly application. */
export interface AssemblyViewState extends LayerViewState {
  /** Per-node visibility override (false = hidden). Undefined = inherit layer. */
  nodeVisible?: Record<string, boolean>;
  /** Progressive assembly: false = not yet built (ghost). Undefined = all present. */
  present?: Record<string, boolean>;
  /** Optional cutaway plane (CAD section). */
  section?: SectionPlane | null;
  /** JARVIS: extracted part for inspect (also on LayerViewState). */
  isolateNodeId?: string | null;
}

export interface AssemblyTreeNode {
  id: string;
  label: string;
  layer: FormLayerId;
  ref?: string;
  partId?: string;
  catalogId?: string;
  children: AssemblyTreeNode[];
  /** True if this row is a structural group (no direct mesh). */
  isGroup?: boolean;
}

export function defaultAssemblyView(nodes: SceneNode3D[]): AssemblyViewState {
  return {
    ...defaultLayerView(nodes),
    nodeVisible: {},
    present: {},
    section: null,
    isolateNodeId: null,
    connectionMap: false,
  };
}

export function selectNode(state: AssemblyViewState, nodeId: string | null): AssemblyViewState {
  return {
    ...state,
    selectedNodeId: nodeId,
    // Selecting a part clears solo so the full assembly remains visible
    soloLayerId: nodeId ? null : state.soloLayerId,
    // Soft select does not auto-isolate (use isolateNode / double-click)
  };
}

/** Pull one part out for inspect; ghosts peers (Onshape/JARVIS pattern). */
export function isolateNode(state: AssemblyViewState, nodeId: string): AssemblyViewState {
  return {
    ...state,
    isolateNodeId: nodeId,
    selectedNodeId: nodeId,
    soloLayerId: null,
  };
}

/** Recompose: clear isolate, keep selection. */
export function clearIsolate(state: AssemblyViewState): AssemblyViewState {
  return {
    ...state,
    isolateNodeId: null,
  };
}

/** Toggle isolate on a part (second call reassembles). */
export function toggleIsolate(state: AssemblyViewState, nodeId: string): AssemblyViewState {
  if (state.isolateNodeId === nodeId) return clearIsolate(state);
  return isolateNode(state, nodeId);
}

/**
 * Apply a view updater against the *latest* snapshot (for controlled React state).
 * Always use this (or functional form with a ref-backed current) — never close over a stale view.
 */
export function applyViewUpdater<T extends LayerViewState>(
  current: T,
  updater: T | ((v: T) => T)
): T {
  return typeof updater === "function" ? (updater as (v: T) => T)(current) : updater;
}

/** Select preserves explode, nodeVisible, present, section, etc. */
export function selectNodePreserveView(
  state: AssemblyViewState,
  nodeId: string | null
): AssemblyViewState {
  return selectNode(state, nodeId);
}

export function toggleLayerVisible(state: AssemblyViewState, layerId: string): AssemblyViewState {
  const on = state.visible[layerId] !== false;
  return {
    ...state,
    visible: { ...state.visible, [layerId]: !on },
    soloLayerId: null,
  };
}

export function toggleNodeVisible(state: AssemblyViewState, nodeId: string): AssemblyViewState {
  const cur = state.nodeVisible?.[nodeId];
  const next = cur === false; // flip: undefined/true → false, false → true
  return {
    ...state,
    nodeVisible: { ...state.nodeVisible, [nodeId]: next },
    soloLayerId: null,
  };
}

export function soloLayer(state: AssemblyViewState, layerId: string | null): AssemblyViewState {
  const next = state.soloLayerId === layerId ? null : layerId;
  return {
    ...state,
    soloLayerId: next,
    selectedNodeId: next
      ? state.selectedNodeId // keep selection if any
      : state.selectedNodeId,
  };
}

export function setExplode(state: AssemblyViewState, explode: number): AssemblyViewState {
  const t = Math.max(0, Math.min(1, explode));
  return { ...state, explode: t };
}

/** Toggle the wiring-map (spread parts + labeled connection pads). */
export function toggleConnectionMap(state: AssemblyViewState): AssemblyViewState {
  return { ...state, connectionMap: !state.connectionMap };
}

export function setSection(
  state: AssemblyViewState,
  section: SectionPlane | null
): AssemblyViewState {
  return { ...state, section };
}

export function toggleSection(state: AssemblyViewState, axis: "y" | "z" = "y"): AssemblyViewState {
  if (state.section?.enabled && state.section.axis === axis) {
    return { ...state, section: { ...state.section, enabled: false } };
  }
  return {
    ...state,
    section: { axis, enabled: true, offset: state.section?.offset ?? 0.5 },
  };
}

export function resetAssemblyView(nodes: SceneNode3D[]): AssemblyViewState {
  return defaultAssemblyView(nodes);
}

/**
 * Effective opacity for a node under assembly view rules.
 * Order: layer hide → node hide → not present → solo → select.
 */
export function assemblyNodeOpacity(node: SceneNode3D, view: AssemblyViewState): number {
  if (view.visible[node.layer] === false) return 0;
  if (view.nodeVisible?.[node.id] === false) return 0;
  if (view.present && Object.keys(view.present).length > 0 && view.present[node.id] === false) {
    return 0.06; // ghost until assembled
  }
  if (view.isolateNodeId) {
    return view.isolateNodeId === node.id ? 1 : 0.14;
  }
  if (view.soloLayerId && view.soloLayerId !== node.layer) return 0.08;
  if (view.selectedNodeId && view.selectedNodeId === node.id) return 1;
  return 1;
}

export function assemblyNodeVisible(node: SceneNode3D, view: AssemblyViewState): boolean {
  return assemblyNodeOpacity(node, view) > 0.01;
}

/**
 * Build hierarchical model tree from parentId links.
 * Nodes without parent become roots (or children of a synthetic product root).
 */
export function buildAssemblyTree(
  scene: ProductScene3D,
  productLabel = "Product"
): AssemblyTreeNode {
  const byParent = new Map<string | null, SceneNode3D[]>();
  for (const n of scene.nodes) {
    const p = n.parentId ?? null;
    const list = byParent.get(p) || [];
    list.push(n);
    byParent.set(p, list);
  }

  function kids(parentId: string | null): AssemblyTreeNode[] {
    const nodes = byParent.get(parentId) || [];
    return nodes.map((n) => ({
      id: n.id,
      label: n.label,
      layer: n.layer,
      ref: n.ref,
      partId: n.partId,
      catalogId: n.catalogId,
      children: kids(n.id),
    }));
  }

  const roots = kids(null);
  // If multiple roots, wrap under product group
  if (roots.length === 1 && roots[0].children.length > 0) {
    return {
      id: "__root__",
      label: productLabel,
      layer: roots[0].layer,
      isGroup: true,
      children: roots,
    };
  }
  return {
    id: "__root__",
    label: productLabel,
    layer: (roots[0]?.layer || "base") as FormLayerId,
    isGroup: true,
    children: roots,
  };
}

/**
 * Progressive present mask from step index.
 * prep / final → all present. Early steps → only structural + step-related layers.
 */
export function presentForStep(
  scene: ProductScene3D,
  stepIndex: number | "prep",
  step?: { title?: string; description?: string; mediaKind?: string }
): Record<string, boolean> {
  const present: Record<string, boolean> = {};
  for (const n of scene.nodes) present[n.id] = true;

  if (stepIndex === "prep") return present;

  // Always show structure
  const always = new Set(["base", "frame"]);
  const focus =
    step && focusLayerForStep(step.title || "", step.description || "", step.mediaKind);

  // Cumulative layer unlock roughly by build order for sat_clock
  const order: FormLayerId[] = [
    "base",
    "frame",
    "power",
    "brain",
    "face",
    "sensor",
    "touch",
    "wings",
  ];
  const maxIdx = Math.min(order.length - 1, Math.max(0, stepIndex) + 2);
  const unlocked = new Set<string>(order.slice(0, maxIdx + 1));
  if (focus) unlocked.add(focus);
  for (const a of always) unlocked.add(a);

  for (const n of scene.nodes) {
    present[n.id] = unlocked.has(n.layer);
  }
  return present;
}

/** Inspect payload for selected node + BOM part. */
export function inspectNode(
  scene: ProductScene3D,
  nodeId: string | null,
  parts?: { id: string; ref?: string; name?: string; role?: string; specification?: string }[]
): {
  node: SceneNode3D | null;
  part: { id: string; ref?: string; name?: string; role?: string; specification?: string } | null;
} {
  if (!nodeId) return { node: null, part: null };
  const node = scene.nodes.find((n) => n.id === nodeId) || null;
  if (!node) return { node: null, part: null };
  const part =
    parts?.find((p) => p.id === node.partId || (node.ref && p.ref === node.ref)) || null;
  return { node, part };
}

/** Convert AssemblyViewState → LayerViewState for the product viewer. */
export function toLayerView(view: AssemblyViewState): LayerViewState {
  return {
    visible: view.visible,
    soloLayerId: view.soloLayerId,
    explode: view.explode,
    selectedNodeId: view.selectedNodeId,
    nodeVisible: view.nodeVisible,
    present: view.present,
    isolateNodeId: view.isolateNodeId ?? null,
    section: view.section,
  };
}

/** Apply present + nodeVisible into effective LayerViewState opacity path via nodeOpacity-compatible fields. */
export function mergePresentIntoLayerView(
  view: AssemblyViewState,
  nodes: SceneNode3D[]
): LayerViewState {
  // Ghost absent nodes by treating their layer as partially soloed — better handled by assemblyNodeOpacity.
  // For ProductViewer3D we map absent nodes' layers only if ALL nodes on layer absent.
  const layerHasPresent: Record<string, boolean> = {};
  for (const n of nodes) {
    const ok = !view.present || Object.keys(view.present).length === 0 || view.present[n.id] !== false;
    if (ok) layerHasPresent[n.layer] = true;
  }
  const visible = { ...view.visible };
  // Don't hide whole layers from present — use solo for focus only
  return {
    visible,
    soloLayerId: view.soloLayerId,
    explode: view.explode,
    selectedNodeId: view.selectedNodeId,
    nodeVisible: view.nodeVisible,
    present: view.present,
    isolateNodeId: view.isolateNodeId ?? null,
    section: view.section,
  };
}
