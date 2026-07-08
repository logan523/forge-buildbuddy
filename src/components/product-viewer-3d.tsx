"use client";

import {
  Suspense,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Lightformer,
  TransformControls,
  useGLTF,
  PerformanceMonitor,
} from "@react-three/drei";
import type { Object3D, Material, Mesh } from "three";
import type { BuildPlan } from "@/lib/types";
import {
  buildProductScene3D,
  uniqueLayers,
  defaultLayerView,
  focusLayerForStep,
  applyPoseLayout,
  resolveBeautyMesh,
  beautyUnderlayAllowed,
  beautyDisplayOpacity,
  type ProductScene3D,
  type LayerViewState,
  type PoseLayout3D,
  type BeautyMeshSpec,
} from "@/lib/product-3d";
import {
  detectQualityTier,
  qualitySettings,
  type QualityTier,
} from "@/lib/product-3d/quality";
import {
  loadPoseLayout,
  savePoseLayout,
  clearPoseLayout,
  upsertNodePose,
} from "@/lib/product-3d/pose-storage";
import { NodeMesh, SelectableNode } from "@/components/product-node-mesh";

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
  quality,
  onQualityDrop,
}: {
  scene: ProductScene3D;
  view: LayerViewState;
  editMode: boolean;
  gizmoMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onPoseCommit: (nodeId: string, position: [number, number, number], rotation: [number, number, number]) => void;
  beautySpec: BeautyMeshSpec | null;
  showBeauty: boolean;
  quality: ReturnType<typeof qualitySettings>;
  onQualityDrop: () => void;
}) {
  const selectedRef = useRef<Object3D | null>(null);
  const [gizmoTarget, setGizmoTarget] = useState<Object3D | null>(null);
  const orbitRef = useRef<{ enabled: boolean } | null>(null);

  useEffect(() => {
    if (!editMode || !view.selectedNodeId) {
      setGizmoTarget(null);
      return;
    }
    const t = requestAnimationFrame(() => {
      setGizmoTarget(selectedRef.current);
    });
    return () => cancelAnimationFrame(t);
  }, [editMode, view.selectedNodeId, scene.nodes]);

  const beautyOpacity = beautySpec ? beautyDisplayOpacity(beautySpec) : 0;
  const segs = quality.segments;

  return (
    <>
      <PerformanceMonitor onDecline={onQualityDrop} />
      {/* Studio lighting — Palantir dark product viz */}
      <ambientLight intensity={0.28} />
      <directionalLight position={[2.5, 4.5, 2]} intensity={1.25} castShadow color="#fff7ed" />
      <directionalLight position={[-2.5, 2.5, -1.5]} intensity={0.45} color="#bfdbfe" />
      <directionalLight position={[0, 1.5, 3]} intensity={0.35} color="#fde68a" />
      <Environment preset="studio" environmentIntensity={quality.envIntensity}>
        <Lightformer intensity={1.2} position={[0, 4, 2]} scale={[8, 1.5, 1]} form="rect" />
        <Lightformer intensity={0.6} position={[-3, 2, -2]} scale={[3, 3, 1]} form="ring" color="#93c5fd" />
      </Environment>

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
                segments={segs}
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
              segments={segs}
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
      {/* Soft ground contact */}
      <ContactShadows
        position={[0, -0.005, 0]}
        opacity={quality.shadowOpacity}
        scale={3.2}
        blur={quality.shadowBlur}
        far={2.5}
        color="#000000"
      />
      {quality.showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, 0]} receiveShadow>
          <circleGeometry args={[1.4, 64]} />
          <meshPhysicalMaterial
            color="#0c1016"
            metalness={0.2}
            roughness={0.85}
            transparent
            opacity={0.55}
          />
        </mesh>
      )}
      <OrbitControls
        ref={orbitRef as never}
        makeDefault
        target={scene.cameraHint.target}
        minDistance={0.35}
        maxDistance={4}
        enablePan
        enableDamping
        dampingFactor={0.06}
        enabled={!editMode || !view.selectedNodeId}
      />
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
  const [qualityTier, setQualityTier] = useState<QualityTier>(() =>
    typeof window !== "undefined" ? detectQualityTier() : "medium"
  );
  const quality = useMemo(() => qualitySettings(qualityTier), [qualityTier]);
  const dropQuality = useCallback(() => {
    setQualityTier((t) => (t === "high" ? "medium" : t === "medium" ? "low" : "low"));
  }, []);

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
            <span className="ml-2 font-mono text-white/30 normal-case tracking-normal">
              {quality.tier}
            </span>
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
              fov: 38,
              near: 0.01,
              far: 50,
            }}
            dpr={quality.dpr}
            shadows
            gl={{ antialias: quality.antialias, alpha: true, powerPreference: "high-performance" }}
            onPointerMissed={() => {
              if (!editMode) setView((v) => ({ ...v, selectedNodeId: null }));
            }}
          >
            <color attach="background" args={["#0a0e14"]} />
            <fog attach="fog" args={["#0a0e14", 3.5, 8]} />
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
                quality={quality}
                onQualityDrop={dropQuality}
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
