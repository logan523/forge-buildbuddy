"use client";

import {
  Suspense,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Html,
  RoundedBox,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import type { Object3D, Material, Mesh } from "three";
import type { BuildPlan } from "@/lib/types";
import {
  buildProductScene3D,
  uniqueLayers,
  defaultLayerView,
  computeNodeWorldPosition,
  nodeOpacity,
  nodeVisible,
  focusLayerForStep,
  applyPoseLayout,
  resolveBeautyMesh,
  beautyUnderlayAllowed,
  beautyDisplayOpacity,
  type ProductScene3D,
  type SceneNode3D,
  type LayerViewState,
  type PoseLayout3D,
  type BeautyMeshSpec,
} from "@/lib/product-3d";
import {
  loadPoseLayout,
  savePoseLayout,
  clearPoseLayout,
  upsertNodePose,
} from "@/lib/product-3d/pose-storage";

/** Optional GLB underlay — never clickable / never layer authority. */
function BeautyUnderlay({
  spec,
  opacity,
}: {
  spec: BeautyMeshSpec;
  opacity: number;
}) {
  const { scene } = useGLTF(spec.url);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        const nm = (m as Material).clone() as Material & { opacity?: number; transparent?: boolean; depthWrite?: boolean };
        nm.transparent = true;
        nm.opacity = opacity;
        nm.depthWrite = opacity > 0.9;
        return nm;
      });
      mesh.material = cloned.length === 1 ? cloned[0] : cloned;
      // never steal picks from parametric ProductScene3D layers
      mesh.raycast = () => {};
    });
    return c;
  }, [scene, opacity]);

  return (
    <primitive
      object={clone}
      scale={spec.scale ?? 1}
      position={spec.offset || [0, 0, 0]}
      rotation={spec.rotation || [0, 0, 0]}
    />
  );
}

function NodeMesh({
  node,
  view,
  rootScale,
  onSelect,
  meshRef,
  suppressExplode = false,
}: {
  node: SceneNode3D;
  view: LayerViewState;
  rootScale: number;
  onSelect: (id: string) => void;
  meshRef?: React.Ref<Object3D>;
  /** When posing, don't bake explode into world position */
  suppressExplode?: boolean;
}) {
  const viewForPos = suppressExplode ? { ...view, explode: 0 } : view;
  const posMm = computeNodeWorldPosition(node, viewForPos);
  const pos: [number, number, number] = [
    posMm[0] * rootScale,
    posMm[1] * rootScale,
    posMm[2] * rootScale,
  ];
  const opacity = nodeOpacity(node, view);
  const visible = nodeVisible(node, view);
  const selected = view.selectedNodeId === node.id;
  const scale = rootScale; // mm → world (geom params are mm)

  if (!visible) return null;

  const mat = {
    color: node.material.color,
    metalness: node.material.metalness ?? 0.2,
    roughness: node.material.roughness ?? 0.5,
    emissive: node.material.emissive || "#000000",
    emissiveIntensity: node.material.emissiveIntensity ?? 0,
    transparent: opacity < 0.99,
    opacity,
  };

  const p = node.geom.params;
  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  let inner: React.ReactNode = null;
  switch (node.geom.kind) {
    case "disk":
      inner = (
        <mesh onClick={onClick}>
          <cylinderGeometry
            args={[
              (p.radius || 50) * scale,
              (p.radius || 50) * scale,
              (p.height || 8) * scale,
              48,
            ]}
          />
          <meshStandardMaterial {...mat} />
        </mesh>
      );
      break;
    case "tube":
      inner = (
        <mesh onClick={onClick}>
          <cylinderGeometry
            args={[
              (p.radius || 2) * scale,
              (p.radius || 2) * scale,
              (p.height || 40) * scale,
              16,
            ]}
          />
          <meshStandardMaterial {...mat} />
        </mesh>
      );
      break;
    case "cell_16340":
      inner = (
        <mesh onClick={onClick}>
          <cylinderGeometry
            args={[
              (p.radius || 8) * scale,
              (p.radius || 8) * scale,
              (p.height || 34) * scale,
              24,
            ]}
          />
          <meshStandardMaterial {...mat} />
        </mesh>
      );
      break;
    case "touch_pad":
      inner = (
        <mesh onClick={onClick}>
          <cylinderGeometry
            args={[
              (p.radius || 7) * scale,
              (p.radius || 7) * scale,
              (p.height || 3) * scale,
              24,
            ]}
          />
          <meshStandardMaterial {...mat} />
        </mesh>
      );
      break;
    case "wire_frame": {
      const w = (p.width || 70) * scale;
      const h = (p.height || 48) * scale;
      const d = (p.depth || 4) * scale;
      const t = (p.bar || 1.6) * scale;
      inner = (
        <group onClick={onClick}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, t, d]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh position={[0, -h / 2, 0]}>
            <boxGeometry args={[w, t, d]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh position={[-w / 2, 0, 0]}>
            <boxGeometry args={[t, h, d]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <mesh position={[w / 2, 0, 0]}>
            <boxGeometry args={[t, h, d]} />
            <meshStandardMaterial {...mat} />
          </mesh>
        </group>
      );
      break;
    }
    case "oled_panel":
    case "solar_panel":
    case "board":
    case "box":
    default: {
      const w = (p.width || 20) * scale;
      const h = (p.height || 15) * scale;
      const d = (p.depth || 3) * scale;
      inner = (
        <RoundedBox
          onClick={onClick}
          args={[w, h, d]}
          radius={Math.min(0.002, Math.max(w, 0.01) * 0.05)}
          smoothness={2}
        >
          <meshStandardMaterial {...mat} />
        </RoundedBox>
      );
      break;
    }
  }

  // Outer group owns pose (ref for TransformControls) so all geom kinds share Object3D API
  return (
    <group
      ref={meshRef}
      position={pos}
      rotation={node.rotation as [number, number, number]}
    >
      {inner}
      {selected && (
        <Html position={[0, 0.12, 0]} center distanceFactor={4}>
          <div className="px-2 py-0.5 rounded bg-black/75 text-white text-[10px] whitespace-nowrap pointer-events-none">
            {node.ref ? `${node.ref} · ${node.label}` : node.label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Hold ref for selected node so TransformControls can attach. */
const SelectableNode = forwardRef<
  Object3D,
  {
    node: SceneNode3D;
    view: LayerViewState;
    rootScale: number;
    onSelect: (id: string) => void;
  }
>(function SelectableNode({ node, view, rootScale, onSelect }, ref) {
  return (
    <NodeMesh
      node={node}
      view={view}
      rootScale={rootScale}
      onSelect={onSelect}
      meshRef={ref}
      suppressExplode
    />
  );
});

function GizmoControls({
  object,
  mode,
  enabled,
  rootScale,
  nodeId,
  onPoseCommit,
}: {
  object: Object3D | null;
  mode: "translate" | "rotate";
  enabled: boolean;
  rootScale: number;
  nodeId: string;
  onPoseCommit: (nodeId: string, position: [number, number, number], rotation: [number, number, number]) => void;
}) {
  const { gl } = useThree();
  const dragging = useRef(false);

  if (!enabled || !object) return null;

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.65}
      onMouseDown={() => {
        dragging.current = true;
        // prevent orbit while gizmo active
        gl.domElement.style.cursor = "grabbing";
      }}
      onMouseUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        gl.domElement.style.cursor = "auto";
        const p = object.position;
        const r = object.rotation;
        // world → mm
        const s = rootScale || 0.01;
        onPoseCommit(
          nodeId,
          [p.x / s, p.y / s, p.z / s],
          [r.x, r.y, r.z]
        );
      }}
    />
  );
}

function SceneContent({
  scene,
  view,
  editMode,
  gizmoMode,
  onSelect,
  onPoseCommit,
  beautySpec,
  showBeauty,
}: {
  scene: ProductScene3D;
  view: LayerViewState;
  editMode: boolean;
  gizmoMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onPoseCommit: (nodeId: string, position: [number, number, number], rotation: [number, number, number]) => void;
  beautySpec: BeautyMeshSpec | null;
  showBeauty: boolean;
}) {
  const selectedRef = useRef<Object3D | null>(null);
  const [gizmoTarget, setGizmoTarget] = useState<Object3D | null>(null);
  const orbitRef = useRef<{ enabled: boolean } | null>(null);

  // Attach gizmo after selected mesh mounts
  useEffect(() => {
    if (!editMode || !view.selectedNodeId) {
      setGizmoTarget(null);
      return;
    }
    // slight delay so ref is populated
    const t = requestAnimationFrame(() => {
      setGizmoTarget(selectedRef.current);
    });
    return () => cancelAnimationFrame(t);
  }, [editMode, view.selectedNodeId, scene.nodes]);

  const beautyOpacity = beautySpec ? beautyDisplayOpacity(beautySpec) : 0;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
      <directionalLight position={[-2, 2, -1]} intensity={0.35} />
      {/* Beauty underlay first (behind parametric) — never authority */}
      {showBeauty && beautySpec && (
        <Suspense fallback={null}>
          <BeautyUnderlay spec={beautySpec} opacity={beautyOpacity} />
        </Suspense>
      )}
      <group>
        {scene.nodes.map((n) => {
          const isSelected = view.selectedNodeId === n.id;
          if (isSelected && editMode) {
            return (
              <SelectableNode
                key={n.id}
                ref={(obj) => {
                  selectedRef.current = obj;
                }}
                node={n}
                view={view}
                rootScale={scene.rootScale}
                onSelect={onSelect}
              />
            );
          }
          return (
            <NodeMesh
              key={n.id}
              node={n}
              view={view}
              rootScale={scene.rootScale}
              onSelect={onSelect}
            />
          );
        })}
      </group>
      {editMode && view.selectedNodeId && (
        <GizmoControls
          object={gizmoTarget}
          mode={gizmoMode}
          enabled={editMode}
          rootScale={scene.rootScale}
          nodeId={view.selectedNodeId}
          onPoseCommit={onPoseCommit}
        />
      )}
      <ContactShadows position={[0, -0.02, 0]} opacity={0.45} scale={2.5} blur={2.5} far={2} />
      <OrbitControls
        ref={orbitRef as never}
        makeDefault
        target={scene.cameraHint.target}
        minDistance={0.4}
        maxDistance={4}
        enablePan
        enabled={!editMode || !view.selectedNodeId}
      />
      <Environment preset="city" />
    </>
  );
}

function WebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function ProductViewer3D({
  plan,
  focusLayer,
  height = 320,
  showLayerPanel = true,
  compact = false,
  editable = true,
  initialPoses,
  onPosesChange,
  onBeautyMeshChange,
}: {
  plan: BuildPlan;
  /** Prefer this layer (solo-ish highlight) */
  focusLayer?: string | null;
  height?: number;
  showLayerPanel?: boolean;
  compact?: boolean;
  /** Enable drag-to-pose edit mode toggle */
  editable?: boolean;
  /** Controlled pose overrides (mm) */
  initialPoses?: PoseLayout3D | null;
  onPosesChange?: (poses: PoseLayout3D) => void;
  /** Persist generated beauty mesh on the plan */
  onBeautyMeshChange?: (mesh: BeautyMeshSpec) => void;
}) {
  const [poses, setPoses] = useState<PoseLayout3D>(() => {
    if (initialPoses) return initialPoses;
    if (typeof window !== "undefined") return loadPoseLayout(plan.id) || {};
    return {};
  });
  const [editMode, setEditMode] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
  /** User wants beauty underlay when allowed (solo/explode auto-hide) */
  const [beautyOn, setBeautyOn] = useState(false);
  const [beautyOverride, setBeautyOverride] = useState<BeautyMeshSpec | null>(null);
  const [beautyProviderConfigured, setBeautyProviderConfigured] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<number | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const planForBeauty = useMemo(
    () => ({ ...plan, beautyMesh: beautyOverride || plan.beautyMesh }),
    [plan, beautyOverride]
  );

  const baseScene = useMemo(() => buildProductScene3D(plan), [plan]);
  const scene = useMemo(() => applyPoseLayout(baseScene, poses), [baseScene, poses]);
  const layers = useMemo(() => uniqueLayers(scene), [scene]);
  const beautyResolved = useMemo(() => resolveBeautyMesh(planForBeauty), [planForBeauty]);
  const beautySpec = beautyResolved.spec;
  const [view, setView] = useState<LayerViewState>(() => defaultLayerView(scene.nodes));
  const [webgl, setWebgl] = useState(true);

  const showBeauty = beautyUnderlayAllowed({
    view,
    editMode,
    userEnabled: beautyOn,
    spec: beautySpec,
  });

  useEffect(() => {
    setWebgl(WebGLAvailable());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/beauty-mesh")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        if (!cancelled) setBeautyProviderConfigured(!!d.configured);
      })
      .catch(() => {
        if (!cancelled) setBeautyProviderConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runBeautyGenerate = useCallback(async () => {
    setGenBusy(true);
    setGenError(null);
    setGenProgress(0);
    try {
      const startRes = await fetch("/api/beauty-mesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const start = await startRes.json();
      if (!startRes.ok || start.status === "failed") {
        throw new Error(start.error || "Could not start beauty generation");
      }
      const taskId = start.taskId as string;
      const provider = (start.provider as string) || "meshy";
      const prompt = (start.prompt as string) || "";

      // Poll until ready / failed (cap ~3 min)
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const q = new URLSearchParams({ taskId, provider, prompt });
        const pollRes = await fetch(`/api/beauty-mesh?${q}`);
        const poll = await pollRes.json();
        if (typeof poll.progress === "number") setGenProgress(poll.progress);
        if (poll.status === "ready" && poll.beautyMesh) {
          const mesh = poll.beautyMesh as BeautyMeshSpec;
          setBeautyOverride(mesh);
          setBeautyOn(true);
          onBeautyMeshChange?.(mesh);
          setGenProgress(100);
          setGenBusy(false);
          return;
        }
        if (poll.status === "failed") {
          throw new Error(poll.error || "Beauty generation failed");
        }
      }
      throw new Error("Beauty generation timed out — try again later");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
      setGenBusy(false);
      setGenProgress(null);
    }
  }, [plan, onBeautyMeshChange]);

  useEffect(() => {
    // reload poses when plan changes
    const loaded = initialPoses ?? loadPoseLayout(plan.id) ?? {};
    setPoses(loaded);
  }, [plan.id, initialPoses]);

  useEffect(() => {
    setView(defaultLayerView(scene.nodes));
  }, [baseScene.templateId]);

  useEffect(() => {
    if (!focusLayer) return;
    setView((v) => ({
      ...v,
      soloLayerId: focusLayer,
      selectedNodeId: scene.nodes.find((n) => n.layer === focusLayer)?.id || v.selectedNodeId,
    }));
  }, [focusLayer, scene.nodes]);

  const commitPoses = useCallback(
    (next: PoseLayout3D) => {
      setPoses(next);
      savePoseLayout(plan.id, next);
      onPosesChange?.(next);
    },
    [plan.id, onPosesChange]
  );

  const onPoseCommit = useCallback(
    (nodeId: string, position: [number, number, number], rotation: [number, number, number]) => {
      commitPoses(upsertNodePose(poses, nodeId, { position, rotation }));
    },
    [poses, commitPoses]
  );

  const onSelect = useCallback((id: string) => {
    setView((v) => ({ ...v, selectedNodeId: id, soloLayerId: null }));
  }, []);

  const toggleLayer = (layerId: string) => {
    setView((v) => ({
      ...v,
      visible: { ...v.visible, [layerId]: !v.visible[layerId] },
      soloLayerId: null,
    }));
  };

  const soloLayer = (layerId: string) => {
    setView((v) => ({
      ...v,
      soloLayerId: v.soloLayerId === layerId ? null : layerId,
      selectedNodeId: scene.nodes.find((n) => n.layer === layerId)?.id || null,
    }));
  };

  const resetPoses = () => {
    clearPoseLayout(plan.id);
    commitPoses({});
  };

  if (!webgl) {
    return (
      <div className="rounded-xl border border-border-subtle p-4 text-sm text-text-secondary bg-surface">
        WebGL unavailable — use the 2D product view instead.
      </div>
    );
  }

  const poseCount = Object.keys(poses).length;

  return (
    <div className={`rounded-xl border border-border-subtle bg-[#0f1419] overflow-hidden ${compact ? "" : ""}`}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-cyan-400/90 uppercase tracking-wider">
            3D product model
          </p>
          <p className="text-[11px] text-white/60 truncate">
            {editMode
              ? "Drag gizmo to pose · orbit off while selected"
              : "Orbit · click a part · layers to peel"}
            <span className="ml-1.5 font-mono text-white/35">· {scene.templateId}</span>
            {scene.source === "llm_enriched" && (
              <span className="ml-1.5 text-amber-400/80">· pose-enriched</span>
            )}
            {showBeauty && <span className="ml-1.5 text-violet-300/80">· beauty underlay</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {beautySpec && beautySpec.status === "ready" && (
            <button
              type="button"
              title={beautyResolved.disclaimer}
              onClick={() => setBeautyOn((b) => !b)}
              className={`text-[10px] px-2 py-1 rounded cursor-pointer font-medium ${
                beautyOn && showBeauty
                  ? "bg-violet-500/40 text-violet-100"
                  : beautyOn
                    ? "bg-violet-500/20 text-violet-200/70"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
              }`}
            >
              Beauty
            </button>
          )}
          {beautyProviderConfigured && (
            <button
              type="button"
              disabled={genBusy}
              title="Generate AI beauty underlay (Meshy/Tripo). Layers stay authority."
              onClick={() => void runBeautyGenerate()}
              className={`text-[10px] px-2 py-1 rounded cursor-pointer font-medium disabled:opacity-50 ${
                genBusy
                  ? "bg-violet-500/30 text-violet-100"
                  : "bg-white/10 text-white/70 hover:bg-white/15"
              }`}
            >
              {genBusy
                ? genProgress != null
                  ? `Gen ${genProgress}%`
                  : "Gen…"
                : "Gen beauty"}
            </button>
          )}
          {editable && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditMode((e) => {
                    if (!e) setView((v) => ({ ...v, explode: 0 }));
                    return !e;
                  });
                }}
                className={`text-[10px] px-2 py-1 rounded cursor-pointer font-medium ${
                  editMode
                    ? "bg-amber-400 text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                {editMode ? "Editing" : "Pose"}
              </button>
              {editMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setGizmoMode("translate")}
                    className={`text-[10px] px-1.5 py-1 rounded cursor-pointer ${
                      gizmoMode === "translate" ? "bg-cyan-500/40 text-cyan-100" : "text-white/40 hover:text-white"
                    }`}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => setGizmoMode("rotate")}
                    className={`text-[10px] px-1.5 py-1 rounded cursor-pointer ${
                      gizmoMode === "rotate" ? "bg-cyan-500/40 text-cyan-100" : "text-white/40 hover:text-white"
                    }`}
                  >
                    Rotate
                  </button>
                </>
              )}
            </>
          )}
          <span className="text-[9px] uppercase text-white/40 font-mono">{scene.grade}</span>
        </div>
      </div>

      <div className={`flex ${showLayerPanel ? "flex-col sm:flex-row" : "flex-col"}`}>
        <div className="flex-1 relative" style={{ height }}>
          <Canvas
            camera={{
              position: scene.cameraHint.position,
              fov: 40,
              near: 0.01,
              far: 50,
            }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => {
              if (!editMode) setView((v) => ({ ...v, selectedNodeId: null }));
            }}
          >
            <color attach="background" args={["#0f1419"]} />
            <Suspense fallback={null}>
              <SceneContent
                scene={scene}
                view={view}
                editMode={editMode}
                gizmoMode={gizmoMode}
                onSelect={onSelect}
                onPoseCommit={onPoseCommit}
                beautySpec={beautySpec}
                showBeauty={showBeauty}
              />
            </Suspense>
          </Canvas>
        </div>

        {showLayerPanel && (
          <div className="sm:w-44 shrink-0 border-t sm:border-t-0 sm:border-l border-white/10 p-2 bg-[#121820]">
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-2 px-1">
              Layers
            </p>
            <ul className="space-y-1 max-h-[280px] overflow-y-auto">
              {layers.map((l) => {
                const on = view.visible[l.id] !== false;
                const solo = view.soloLayerId === l.id;
                return (
                  <li key={l.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleLayer(l.id)}
                      className={`flex-1 text-left text-[11px] px-2 py-1 rounded cursor-pointer ${
                        solo
                          ? "bg-cyan-500/30 text-cyan-100"
                          : on
                            ? "bg-white/5 text-white/80 hover:bg-white/10"
                            : "bg-transparent text-white/30 line-through"
                      }`}
                    >
                      {on ? "●" : "○"} {l.label}
                    </button>
                    <button
                      type="button"
                      title="Solo this layer"
                      onClick={() => soloLayer(l.id)}
                      className={`text-[9px] px-1.5 py-1 rounded cursor-pointer ${
                        solo ? "bg-cyan-500 text-black font-bold" : "text-white/40 hover:text-white"
                      }`}
                    >
                      Solo
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 px-1">
              <label className="text-[9px] text-white/50 uppercase tracking-wider">
                Explode {Math.round(view.explode * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(view.explode * 100)}
                onChange={(e) =>
                  setView((v) => ({ ...v, explode: Number(e.target.value) / 100 }))
                }
                className="w-full mt-1 accent-cyan-400"
              />
            </div>
            <button
              type="button"
              className="mt-2 w-full text-[10px] py-1.5 rounded bg-white/10 text-white/70 hover:bg-white/15 cursor-pointer"
              onClick={() => setView(defaultLayerView(scene.nodes))}
            >
              Reset view
            </button>
            {poseCount > 0 && (
              <button
                type="button"
                className="mt-1 w-full text-[10px] py-1.5 rounded bg-amber-500/20 text-amber-200/90 hover:bg-amber-500/30 cursor-pointer"
                onClick={resetPoses}
              >
                Reset poses ({poseCount})
              </button>
            )}
            {(beautySpec || beautyProviderConfigured || genError) && (
              <p className="mt-2 px-1 text-[9px] leading-snug text-white/35">
                {genError
                  ? genError
                  : beautyOn && !showBeauty
                    ? "Beauty hidden during solo / explode / pose."
                    : beautyResolved.disclaimer}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Derive focus layer from current step for session UI */
export function stepFocusLayer(plan: BuildPlan, stepIndex: number): string | null {
  const step = plan.steps?.[stepIndex];
  if (!step) return null;
  return focusLayerForStep(step.title, step.description, step.mediaKind);
}
