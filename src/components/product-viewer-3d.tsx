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
  Line,
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
  computeNodeWorldPosition,
  DEFAULT_SUN,
  sunLightPosition,
  solarRotationTowardSun,
  sunLabel,
  type ProductScene3D,
  type LayerViewState,
  type PoseLayout3D,
  type BeautyMeshSpec,
  type SunState,
  type SceneEdge3D,
  type SceneNode3D,
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

function WireSpars({
  edges,
  nodes,
  view,
  rootScale,
  visible,
}: {
  edges: SceneEdge3D[];
  nodes: SceneNode3D[];
  view: LayerViewState;
  rootScale: number;
  visible: boolean;
}) {
  if (!visible || !edges.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <group>
      {edges.map((e) => {
        const a = byId.get(e.fromNodeId);
        const b = byId.get(e.toNodeId);
        if (!a || !b) return null;
        if (!nodeLayerVisible(a, view) || !nodeLayerVisible(b, view)) return null;
        const pa = computeNodeWorldPosition(a, view);
        const pb = computeNodeWorldPosition(b, view);
        const s = rootScale;
        const points: [number, number, number][] = [
          [pa[0] * s, pa[1] * s, pa[2] * s],
          [pb[0] * s, pb[1] * s, pb[2] * s],
        ];
        return (
          <Line
            key={e.id}
            points={points}
            color={e.color}
            lineWidth={1.6}
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
}

function nodeLayerVisible(node: SceneNode3D, view: LayerViewState): boolean {
  if (view.visible[node.layer] === false) return false;
  if (view.soloLayerId && view.soloLayerId !== node.layer) return false;
  return true;
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
  sun,
  showWires,
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
  sun: SunState;
  showWires: boolean;
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
  const sunPos = sunLightPosition(sun, 5.5);

  return (
    <>
      <PerformanceMonitor onDecline={onQualityDrop} />
      <ambientLight intensity={0.22} />
      {/* Interactive sun key */}
      <directionalLight
        position={sunPos}
        intensity={sun.intensity}
        castShadow
        color="#fff4e0"
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-2.2, 2.2, -1.8]} intensity={0.38} color="#93c5fd" />
      <directionalLight position={[0, 1.2, 2.8]} intensity={0.28} color="#fde68a" />
      {/* Tiny sun disc for orientation */}
      <mesh position={sunPos}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <Environment preset="studio" environmentIntensity={quality.envIntensity * 0.9}>
        <Lightformer intensity={1.1} position={[0, 4, 2]} scale={[8, 1.5, 1]} form="rect" />
        <Lightformer intensity={0.55} position={[-3, 2, -2]} scale={[3, 3, 1]} form="ring" color="#93c5fd" />
      </Environment>

      {showBeauty && beautySpec && (
        <Suspense fallback={null}>
          <BeautyUnderlay spec={beautySpec} opacity={beautyOpacity} />
        </Suspense>
      )}
      <WireSpars
        edges={scene.edges || []}
        nodes={scene.nodes}
        view={view}
        rootScale={scene.rootScale}
        visible={showWires}
      />
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
  const [sun, setSun] = useState<SunState>(DEFAULT_SUN);
  const [aimSolar, setAimSolar] = useState(true);
  const [showWires, setShowWires] = useState(true);

  const planForBeauty = useMemo(
    () => ({ ...plan, beautyMesh: beautyOverride || plan.beautyMesh }),
    [plan, beautyOverride]
  );

  const baseScene = useMemo(() => buildProductScene3D(plan), [plan]);
  const posedScene = useMemo(() => applyPoseLayout(baseScene, poses), [baseScene, poses]);
  /** Re-aim solar panels toward interactive sun */
  const scene = useMemo(() => {
    if (!aimSolar) return posedScene;
    return {
      ...posedScene,
      nodes: posedScene.nodes.map((n) => {
        if (
          n.layer !== "wings" &&
          n.geom.kind !== "solar_module" &&
          n.geom.kind !== "solar_panel" &&
          !n.id.startsWith("solar-")
        ) {
          return n;
        }
        if (n.id.startsWith("spar-")) return n;
        const side: "left" | "right" | "center" =
          n.id.includes("-l") || n.position[0] < -5
            ? "left"
            : n.id.includes("-r") || n.position[0] > 5
              ? "right"
              : "center";
        return {
          ...n,
          rotation: solarRotationTowardSun(sun, side),
        };
      }),
    };
  }, [posedScene, sun, aimSolar]);
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
  const notes = scene.reasoningNotes || [];
  const selectedLabel = view.selectedNodeId
    ? scene.nodes.find((n) => n.id === view.selectedNodeId)?.label
    : null;

  const chipBtn = (active: boolean, accent = "cyan") =>
    active
      ? accent === "amber"
        ? "bg-amber-400 text-black font-semibold shadow-sm"
        : accent === "violet"
          ? "bg-violet-500/50 text-violet-50 font-semibold"
          : "bg-cyan-500/35 text-cyan-50 font-semibold ring-1 ring-cyan-400/40"
      : "bg-white/[0.06] text-white/65 hover:bg-white/10 hover:text-white/90";

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-b from-[#0c1219] to-[#080b10] overflow-hidden shadow-2xl shadow-black/40 ${
        compact ? "" : ""
      }`}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.07] bg-black/20">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            <p className="text-[11px] font-semibold text-white/90 tracking-wide">
              Product assembly
            </p>
            <span className="text-[9px] font-mono text-white/30 px-1.5 py-0.5 rounded bg-white/5">
              {scene.templateId}
            </span>
            <span className="text-[9px] font-mono text-white/25">{quality.tier}</span>
          </div>
          <p className="text-[10px] text-white/45 mt-0.5 truncate pl-3.5">
            {editMode
              ? "Drag gizmo · orbit paused while selected"
              : selectedLabel
                ? `Selected · ${selectedLabel}`
                : "Orbit drag · click part · peel layers"}
            {showBeauty && <span className="text-violet-300/70"> · beauty</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {beautySpec?.status === "ready" && (
            <button
              type="button"
              title={beautyResolved.disclaimer}
              onClick={() => setBeautyOn((b) => !b)}
              className={`text-[10px] px-2 py-1 rounded-lg cursor-pointer transition-colors ${chipBtn(beautyOn && showBeauty, "violet")}`}
            >
              Beauty
            </button>
          )}
          {beautyProviderConfigured && (
            <button
              type="button"
              disabled={genBusy}
              title="AI beauty underlay — layers stay authority"
              onClick={() => void runBeautyGenerate()}
              className={`text-[10px] px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50 transition-colors ${chipBtn(genBusy, "violet")}`}
            >
              {genBusy ? (genProgress != null ? `${genProgress}%` : "…") : "Gen"}
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
                className={`text-[10px] px-2 py-1 rounded-lg cursor-pointer transition-colors ${chipBtn(editMode, "amber")}`}
              >
                {editMode ? "Done" : "Pose"}
              </button>
              {editMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setGizmoMode("translate")}
                    className={`text-[10px] px-1.5 py-1 rounded-md cursor-pointer ${chipBtn(gizmoMode === "translate")}`}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => setGizmoMode("rotate")}
                    className={`text-[10px] px-1.5 py-1 rounded-md cursor-pointer ${chipBtn(gizmoMode === "rotate")}`}
                  >
                    Rot
                  </button>
                </>
              )}
            </>
          )}
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-medium pl-1">
            {scene.grade}
          </span>
        </div>
      </div>

      {/* Design brain chips */}
      {notes.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1.5 border-b border-white/[0.05] bg-cyan-500/[0.03]">
          <span className="text-[9px] font-semibold text-cyan-500/80 uppercase tracking-wider self-center mr-0.5">
            Brain
          </span>
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              title={n.detail}
              onClick={() => {
                const id = n.nodeIds[0];
                if (id) {
                  const node = scene.nodes.find((x) => x.id === id);
                  setView((v) => ({
                    ...v,
                    selectedNodeId: id,
                    soloLayerId: node?.layer || null,
                    explode: Math.max(v.explode, 0.15),
                  }));
                }
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-cyan-500/20 text-cyan-100/80 hover:bg-cyan-500/15 hover:border-cyan-400/40 cursor-pointer transition-colors"
            >
              {n.rule}
            </button>
          ))}
        </div>
      )}

      <div className={`flex ${showLayerPanel ? "flex-col sm:flex-row" : "flex-col"}`}>
        <div className="flex-1 relative min-h-0" style={{ height }}>
          <Canvas
            camera={{
              position: scene.cameraHint.position,
              fov: 36,
              near: 0.01,
              far: 50,
            }}
            dpr={quality.dpr}
            shadows
            gl={{
              antialias: quality.antialias,
              alpha: true,
              powerPreference: "high-performance",
              toneMappingExposure: 1.05,
            }}
            onPointerMissed={() => {
              if (!editMode) setView((v) => ({ ...v, selectedNodeId: null, soloLayerId: null }));
            }}
          >
            <color attach="background" args={["#070a0f"]} />
            <fog attach="fog" args={["#070a0f", 4, 9]} />
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
                sun={sun}
                showWires={showWires}
              />
            </Suspense>
          </Canvas>
          {/* Floating hint */}
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:right-auto flex gap-1.5">
            <span className="text-[9px] px-2 py-1 rounded-md bg-black/50 text-white/40 backdrop-blur-sm border border-white/5">
              Scroll zoom · drag orbit
            </span>
          </div>
        </div>

        {showLayerPanel && (
          <div className="sm:w-[11.5rem] shrink-0 border-t sm:border-t-0 sm:border-l border-white/[0.07] p-2.5 bg-[#0a0e14]/90 backdrop-blur">
            <p className="text-[9px] font-semibold text-white/40 uppercase tracking-[0.14em] mb-2 px-0.5">
              Layers
            </p>
            <ul className="space-y-0.5 max-h-[min(280px,40vh)] overflow-y-auto overscroll-contain pr-0.5">
              {layers.map((l) => {
                const on = view.visible[l.id] !== false;
                const solo = view.soloLayerId === l.id;
                return (
                  <li key={l.id} className="flex items-center gap-0.5 group">
                    <button
                      type="button"
                      onClick={() => toggleLayer(l.id)}
                      className={`flex-1 text-left text-[11px] px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        solo
                          ? "bg-cyan-500/25 text-cyan-50 ring-1 ring-cyan-400/30"
                          : on
                            ? "text-white/80 hover:bg-white/[0.06]"
                            : "text-white/25 line-through"
                      }`}
                    >
                      <span className={`mr-1.5 inline-block w-1.5 h-1.5 rounded-full ${on ? "bg-cyan-400/90" : "bg-white/20"}`} />
                      {l.label}
                    </button>
                    <button
                      type="button"
                      title="Solo"
                      onClick={() => soloLayer(l.id)}
                      className={`text-[9px] px-1.5 py-1 rounded-md cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity ${
                        solo ? "bg-cyan-400 text-black font-bold opacity-100" : "text-white/50 hover:text-white"
                      }`}
                    >
                      Solo
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 px-0.5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] text-white/40 uppercase tracking-wider">Explode</label>
                <span className="text-[10px] font-mono text-cyan-400/80">{Math.round(view.explode * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(view.explode * 100)}
                onChange={(e) =>
                  setView((v) => ({ ...v, explode: Number(e.target.value) / 100 }))
                }
                className="w-full accent-cyan-400 h-1 cursor-pointer"
              />
            </div>

            {/* Sun control */}
            <div className="mt-3 px-0.5 space-y-1.5 border-t border-white/5 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] text-amber-400/70 uppercase tracking-wider">Sun</label>
                <span className="text-[9px] font-mono text-amber-200/60">{sunLabel(sun)}</span>
              </div>
              <label className="text-[8px] text-white/30">Azimuth</label>
              <input
                type="range"
                min={0}
                max={360}
                value={sun.azimuth}
                onChange={(e) => setSun((s) => ({ ...s, azimuth: Number(e.target.value) }))}
                className="w-full accent-amber-400 h-1 cursor-pointer"
              />
              <label className="text-[8px] text-white/30">Elevation</label>
              <input
                type="range"
                min={8}
                max={82}
                value={sun.elevation}
                onChange={(e) => setSun((s) => ({ ...s, elevation: Number(e.target.value) }))}
                className="w-full accent-amber-400 h-1 cursor-pointer"
              />
              <div className="flex gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setAimSolar((v) => !v)}
                  className={`flex-1 text-[9px] py-1 rounded-md cursor-pointer transition-colors ${
                    aimSolar
                      ? "bg-amber-500/25 text-amber-100"
                      : "bg-white/[0.05] text-white/40 hover:bg-white/10"
                  }`}
                  title="Tilt solar panels toward sun"
                >
                  Aim solar
                </button>
                <button
                  type="button"
                  onClick={() => setShowWires((v) => !v)}
                  className={`flex-1 text-[9px] py-1 rounded-md cursor-pointer transition-colors ${
                    showWires
                      ? "bg-blue-500/25 text-blue-100"
                      : "bg-white/[0.05] text-white/40 hover:bg-white/10"
                  }`}
                  title="Show electrical connection spars"
                >
                  Wires {(scene.edges?.length || 0) > 0 ? `(${scene.edges!.length})` : ""}
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-1">
              <button
                type="button"
                className="w-full text-[10px] py-1.5 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white/80 cursor-pointer transition-colors"
                onClick={() => setView(defaultLayerView(scene.nodes))}
              >
                Reset view
              </button>
              {poseCount > 0 && (
                <button
                  type="button"
                  className="w-full text-[10px] py-1.5 rounded-lg bg-amber-500/15 text-amber-200/80 hover:bg-amber-500/25 cursor-pointer transition-colors"
                  onClick={resetPoses}
                >
                  Reset poses ({poseCount})
                </button>
              )}
            </div>

            {notes[0] && (
              <p className="mt-3 px-0.5 text-[9px] leading-relaxed text-white/30 border-t border-white/5 pt-2">
                {notes.find((n) => n.nodeIds.includes(view.selectedNodeId || ""))?.detail ||
                  notes[0].detail}
              </p>
            )}
            {(beautySpec || beautyProviderConfigured || genError) && (
              <p className="mt-1.5 px-0.5 text-[9px] leading-snug text-white/25">
                {genError ||
                  (beautyOn && !showBeauty
                    ? "Beauty hidden while peeling / posing."
                    : beautyResolved.disclaimer)}
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
