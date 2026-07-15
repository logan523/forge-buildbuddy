"use client";

import {
  Component,
  Suspense,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Lightformer,
  TransformControls,
  useGLTF,
  PerformanceMonitor,
  Line,
  Grid,
  Html,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  N8AO,
  DepthOfField,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  type Object3D,
  type Material,
  type Mesh,
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
  ACESFilmicToneMapping,
  Vector2,
  BackSide,
} from "three";
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
import { cadCameraForNodes, frameForNodeIds, sceneWorldBounds } from "@/lib/product-3d/cad-frame";
import { getProceduralMap } from "@/lib/product-3d/procedural-maps";
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
import { NodeMesh } from "@/components/product-node-mesh";

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

/**
 * Continuous PVC jumper — CatmullRomCurve3 + TubeGeometry (CAD harness style),
 * not faceted cylinder segments. Solder blobs at pin landings.
 */
function WireTubeRoute({
  path,
  color,
  gaugeMm,
  rootScale,
  highlight,
  dim,
  selectable,
}: {
  path: [number, number, number][];
  color: string;
  gaugeMm: number;
  rootScale: number;
  highlight: boolean;
  dim?: boolean;
  /** Add an invisible fat tube as a comfortable tap/hover target (hero view). */
  selectable?: boolean;
}) {
  const s = rootScale;
  const r = Math.max(0.00045, gaugeMm * s * (highlight ? 1.5 : dim ? 0.7 : 1.08));
  const opacity = highlight ? 1 : dim ? 0.2 : 0.96;
  const pvcNormal = useMemo(() => getProceduralMap("pvc_normal"), []);
  const pvcNScale = useMemo(() => new Vector2(0.45, 0.45), []);

  // Fat invisible tap target — a fingertip on a phone can't hit a 0.8 mm wire,
  // so raycast against a ~5.5× tube (built only when the wire is selectable).
  const hitR = Math.max(gaugeMm * s * 5.5, 0.014);
  const geo = useMemo(() => {
    if (path.length < 2) return null;
    const pts = path.map(([x, y, z]) => new Vector3(x * s, y * s, z * s));
    // Dedupe near-collinear points that can zero-length the curve
    const cleaned: Vector3[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      if (cleaned[cleaned.length - 1]!.distanceTo(pts[i]!) > 1e-6) cleaned.push(pts[i]!);
    }
    if (cleaned.length < 2) return null;
    const curve = new CatmullRomCurve3(cleaned, false, "catmullrom", 0.35);
    const tubular = Math.min(96, Math.max(28, cleaned.length * 10));
    return {
      tube: new TubeGeometry(curve, tubular, r, highlight ? 12 : 10, false),
      hitTube: selectable ? new TubeGeometry(curve, tubular, hitR, 6, false) : null,
      curve,
    };
  }, [path, s, r, hitR, highlight, selectable]);
  const tube = geo?.tube ?? null;
  const hitTube = geo?.hitTube ?? null;
  const curve = geo?.curve ?? null;

  useEffect(() => {
    return () => {
      tube?.dispose();
      hitTube?.dispose();
    };
  }, [tube, hitTube]);

  // Follow-the-Net: a bright bead of light rides the ACTIVE wire from source to
  // destination, so a beginner can see exactly where that one wire goes. Only
  // the highlighted wire animates; the emissive core blooms for free.
  const beadRef = useRef<Mesh>(null);
  const beadT = useRef(0);
  useFrame((_, delta) => {
    if (!highlight || !curve || !beadRef.current) return;
    beadT.current = (beadT.current + delta * 0.33) % 1;
    const p = curve.getPointAt(beadT.current);
    beadRef.current.position.set(p.x, p.y, p.z);
  });

  const ends = useMemo(() => {
    if (path.length < 2) return null;
    const a = path[0]!;
    const b = path[path.length - 1]!;
    return [
      [a[0] * s, a[1] * s, a[2] * s] as [number, number, number],
      [b[0] * s, b[1] * s, b[2] * s] as [number, number, number],
    ];
  }, [path, s]);

  if (!tube || !ends) return null;

  const solderR = r * 2.1;
  return (
    <group>
      {hitTube && (
        // Invisible, non-occluding, draws nothing — purely a raycast target.
        <mesh geometry={hitTube} renderOrder={-1}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
      <mesh geometry={tube} castShadow={!dim} receiveShadow={false}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.02}
          roughness={0.46}
          clearcoat={0.18}
          clearcoatRoughness={0.4}
          sheen={0.35}
          sheenRoughness={0.55}
          sheenColor={color}
          envMapIntensity={0.55}
          normalMap={pvcNormal}
          normalScale={pvcNScale}
          transparent
          opacity={opacity}
          depthWrite={!dim}
        />
      </mesh>
      {ends.map((pt, idx) => (
        <group key={`solder-${idx}`} position={pt}>
          {/* Solder fillet */}
          <mesh>
            <sphereGeometry args={[solderR, 12, 12]} />
            <meshPhysicalMaterial
              color={highlight ? "#e8edf2" : "#c0a060"}
              metalness={0.85}
              roughness={0.32}
              envMapIntensity={1.1}
              emissive={highlight ? color : "#000000"}
              emissiveIntensity={highlight ? 0.25 : 0}
              transparent
              opacity={opacity}
              depthWrite={!dim}
            />
          </mesh>
          {/* Insulation tip */}
          <mesh>
            <sphereGeometry args={[r * 1.25, 8, 8]} />
            <meshPhysicalMaterial
              color={color}
              metalness={0.05}
              roughness={0.5}
              transparent
              opacity={opacity}
              depthWrite={!dim}
            />
          </mesh>
        </group>
      ))}
      {highlight && (
        <mesh ref={beadRef}>
          <sphereGeometry args={[Math.max(r * 2.6, 0.018), 16, 16]} />
          {/* HDR emissive so the composer Bloom flares the travelling bead */}
          <meshStandardMaterial color="#0a1018" emissive={color} emissiveIntensity={3.2} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function WireSpars({
  edges,
  nodes,
  view,
  rootScale,
  visible,
  harnesses,
  highlightNodeId,
  activeWireId,
  onWireTap,
}: {
  edges: SceneEdge3D[];
  nodes: SceneNode3D[];
  view: LayerViewState;
  rootScale: number;
  visible: boolean;
  /** Pin-to-pin routed harnesses (preferred over straight spars) */
  harnesses?: import("@/lib/product-3d").WireRoute3D[];
  highlightNodeId?: string | null;
  /** "Show me" drill-down: light exactly ONE wire (by route id), dim the rest. */
  activeWireId?: string | null;
  /** Hero tap-to-trace: click a wire tube to light it (toggle); null clears. */
  onWireTap?: (id: string | null) => void;
}) {
  if (!visible) return null;

  // Prefer multi-point harness routes as solid tubes (gauge + color readable)
  if (harnesses && harnesses.length > 0) {
    return (
      <group>
        {harnesses.map((w) => {
          const hi = activeWireId
            ? w.id === activeWireId
            : !!(
                highlightNodeId &&
                (w.fromNodeId === highlightNodeId || w.toNodeId === highlightNodeId)
              );
          const dim = activeWireId ? w.id !== activeWireId : !!(highlightNodeId && !hi);
          return (
            <group
              key={w.id}
              onClick={(e) => {
                if (!onWireTap) return;
                e.stopPropagation();
                onWireTap(activeWireId === w.id ? null : w.id);
              }}
              onPointerOver={(e) => {
                if (!onWireTap) return;
                e.stopPropagation();
                if (typeof document !== "undefined") document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                if (onWireTap && typeof document !== "undefined") document.body.style.cursor = "";
              }}
            >
              <WireTubeRoute
                path={w.path}
                color={w.color}
                gaugeMm={w.gauge}
                rootScale={rootScale}
                highlight={hi}
                dim={dim}
                selectable={!!onWireTap}
              />
              {hi && !dim && w.path.length >= 2 && (
                <Html
                  position={[
                    ((w.path[0]![0] + w.path[w.path.length - 1]![0]) / 2) * rootScale,
                    ((w.path[0]![1] + w.path[w.path.length - 1]![1]) / 2) * rootScale + 0.03,
                    ((w.path[0]![2] + w.path[w.path.length - 1]![2]) / 2) * rootScale,
                  ]}
                  center
                  distanceFactor={3.5}
                  style={{ pointerEvents: "none" }}
                >
                  <div className="px-1.5 py-0.5 rounded bg-black/75 text-[9px] text-white/90 border border-white/15 font-mono whitespace-nowrap">
                    {w.label} · AWG{w.awg}
                  </div>
                </Html>
              )}
            </group>
          );
        })}
      </group>
    );
  }

  if (!edges.length) return null;
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
            color={e.color || "#c87941"}
            lineWidth={2.2}
            transparent
            opacity={0.88}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
}

/**
 * Wiring-map connection pads: a net-colored marker + pin label at every wire
 * endpoint. Positions come from the harness paths (see connection-pads.ts), so
 * a pad always sits on its wire even after the parts spread apart.
 */
function ConnectionPads({
  pads,
  rootScale,
}: {
  pads: import("@/lib/product-3d").ConnectionPad[];
  rootScale: number;
}) {
  if (!pads.length) return null;
  const s = rootScale;
  return (
    <group>
      {pads.map((p, i) => {
        const pos: [number, number, number] = [
          p.posMm[0] * s,
          p.posMm[1] * s,
          p.posMm[2] * s,
        ];
        return (
          <group key={`${p.nodeId}:${p.pin}:${i}`} position={pos}>
            <mesh>
              <sphereGeometry args={[0.024, 16, 16]} />
              <meshStandardMaterial
                color={p.color}
                emissive={p.color}
                emissiveIntensity={0.55}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>
            <Html center distanceFactor={4.2} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
              <div
                className="px-1 py-0.5 rounded bg-black/85 text-[9px] text-white font-mono whitespace-nowrap border"
                style={{ borderColor: p.color }}
              >
                {p.pin}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function nodeLayerVisible(node: SceneNode3D, view: LayerViewState): boolean {
  if (view.visible[node.layer] === false) return false;
  if (view.nodeVisible?.[node.id] === false) return false;
  if (view.soloLayerId && view.soloLayerId !== node.layer) return false;
  return true;
}

/** Catch HDRI load failure without killing the canvas — falls back to Lightformer rig. */
class EnvBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/** Code-authored studio env — used when the local HDRI is missing/unloadable. */
function LightformerStudio({ intensity }: { intensity: number }) {
  return (
    <Environment resolution={256} environmentIntensity={intensity}>
      {/* Top softbox */}
      <Lightformer intensity={4} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[9, 9, 1]} form="rect" />
      {/* Cool left strip / warm right strip — matches the key/fill color story */}
      <Lightformer intensity={1.6} color="#dce8f6" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[12, 1.2, 1]} form="rect" />
      <Lightformer intensity={1.3} color="#f6e6d0" position={[6, 1.6, 0]} rotation-y={-Math.PI / 2} scale={[12, 1, 1]} form="rect" />
      {/* Front fill */}
      <Lightformer intensity={2.2} position={[0, 3.5, 7]} scale={[10, 2.5, 1]} form="rect" />
    </Environment>
  );
}

/**
 * HDR post stack — mounts only when quality.effects. Composer buffers are linear HDR;
 * ACES tone mapping runs as the LAST pass (the composer bypasses gl.toneMapping).
 */
function PostFX({
  quality,
  focus,
  clarityMode,
}: {
  quality: ReturnType<typeof qualitySettings>;
  focus: Vector3;
  clarityMode: boolean;
}) {
  // Explicit branches: EffectComposer children must be effect elements (no null
  // / fragments — Children.toArray would hand it a non-effect).
  // Wiring-map clarity pass: gentle AO for shape-readability + ACES only. NO DoF
  // (blurs the wires you're tracing), NO bloom (glow hides detail), NO vignette
  // (edge-darkening hurts legibility).
  if (clarityMode) {
    return (
      <EffectComposer multisampling={quality.multisampling}>
        <N8AO halfRes intensity={quality.aoIntensity * 0.7} aoRadius={quality.aoRadius} distanceFalloff={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  // Optional DepthOfField pass — OFF by default (quality.dof=false on every tier):
  // the bokeh blur read as "grainy" and softened the very parts you're inspecting.
  // Kept as an opt-in cinematic effect; flip quality.dof to re-enable.
  if (quality.dof) {
    return (
      <EffectComposer multisampling={quality.multisampling}>
        <N8AO halfRes intensity={quality.aoIntensity} aoRadius={quality.aoRadius} distanceFalloff={0.5} />
        <DepthOfField target={focus} focalLength={0.03} bokehScale={4} height={480} />
        {/* Threshold 1.3 (not 0.96): only true emissive displays bloom — the OLED
            (emissive 2.4) and the tap-a-wire bead (3.2). Lower let incidental
            specular hotspots on the brass / soft light pools bloom into the stray
            blobs that floated behind the model. */}
        <Bloom
          mipmapBlur
          intensity={quality.bloomIntensity}
          luminanceThreshold={1.3}
          luminanceSmoothing={0.2}
          radius={0.55}
        />
        <Vignette darkness={0.28} offset={0.32} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  if (quality.ao) {
    return (
      <EffectComposer multisampling={quality.multisampling}>
        <N8AO halfRes intensity={quality.aoIntensity} aoRadius={quality.aoRadius} distanceFalloff={0.5} />
        <Bloom
          mipmapBlur
          intensity={quality.bloomIntensity}
          luminanceThreshold={1.3}
          luminanceSmoothing={0.2}
          radius={0.55}
        />
        <Vignette darkness={0.28} offset={0.32} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={quality.multisampling}>
      <Bloom
        mipmapBlur
        intensity={quality.bloomIntensity}
        luminanceThreshold={0.95}
        luminanceSmoothing={0.2}
        radius={0.85}
      />
      <Vignette darkness={0.45} offset={0.32} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/**
 * CAD modeler scene — stable lights, no Bounds.fit (that blacked out on click),
 * pure cad-frame camera, no remount on select.
 */
function SceneContent({
  scene,
  view,
  editMode,
  gizmoMode,
  onSelect,
  onIsolate,
  onPoseCommit,
  beautySpec,
  showBeauty,
  quality,
  onQualityDrop,
  sun,
  showWires,
  harnesses,
  idleSpin = false,
  reducedMotion = false,
  phaseCamera = null,
  activeWireId = null,
  onWireTap,
  connectionPads = null,
  clarityMode = false,
  monitorActive = true,
  onQualityRise,
  onTransient,
}: {
  scene: ProductScene3D;
  view: LayerViewState;
  editMode: boolean;
  gizmoMode: "translate" | "rotate";
  onSelect: (id: string) => void;
  onIsolate?: (id: string) => void;
  onPoseCommit: (nodeId: string, position: [number, number, number], rotation: [number, number, number]) => void;
  beautySpec: BeautyMeshSpec | null;
  showBeauty: boolean;
  quality: ReturnType<typeof qualitySettings>;
  onQualityDrop: () => void;
  sun: SunState;
  showWires: boolean;
  harnesses?: import("@/lib/product-3d").WireRoute3D[];
  /** Slow auto-orbit when the stage is idle (hero/step contexts only) */
  idleSpin?: boolean;
  reducedMotion?: boolean;
  /** Recipe phase camera hint — step framing lerps position AND target (eng V2) */
  phaseCamera?: { position: [number, number, number]; target: [number, number, number] } | null;
  /** "Show me" drill-down: the one wire route to light (others dim). */
  activeWireId?: string | null;
  /** Hero tap-to-trace: click a wire to light it (bubbles from WireSpars). */
  onWireTap?: (id: string | null) => void;
  /** Wiring-map: labeled net-colored pads at each wire endpoint. */
  connectionPads?: import("@/lib/product-3d").ConnectionPad[] | null;
  /** Wiring-map clarity render: bright/flat, no dark void or DoF (legibility). */
  clarityMode?: boolean;
  /** Suspend the PerformanceMonitor during known-transient churn (eng V3) */
  monitorActive?: boolean;
  onQualityRise?: () => void;
  onTransient?: () => void;
}) {
  const selectedRef = useRef<Object3D | null>(null);
  const nodeRefs = useRef<Map<string, Object3D>>(new Map());
  const [gizmoTarget, setGizmoTarget] = useState<Object3D | null>(null);
  const orbitRef = useRef<{ enabled: boolean; target: { set: (x: number, y: number, z: number) => void } } | null>(null);
  const { camera, gl } = useThree();
  const framedKey = useRef("");
  const isolateFrameKey = useRef<string | null>(null);
  // Idle auto-orbit + one-shot intro dolly (both skipped under reduced motion)
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dolly = useRef<{ from: Vector3; to: Vector3; t: number } | null>(null);

  // Mild ACES filmic — the low-tier / composer-off path (PostFX tone-maps otherwise)
  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.35;
  }, [gl]);

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  // A step focus camera OWNS the camera. Stable string key so effects can gate
  // on it (null in playground/prep → CAD framing runs; set in step mode → it
  // stands down and the focus framing below is the only writer).
  const phaseKey = phaseCamera
    ? `${phaseCamera.position.join(",")}|${phaseCamera.target.join(",")}`
    : null;

  // Whole-scene CAD framing — playground/prep only. Gated on phaseKey so a step
  // scene change can never let it re-frame the board over the focus camera.
  useEffect(() => {
    if (phaseKey) return;
    const key = `${scene.templateId}|${scene.nodes.map((n) => n.id).join(",")}|${scene.rootScale}`;
    if (framedKey.current === key) return;
    framedKey.current = key;
    const frame = cadCameraForNodes(scene.nodes, scene.rootScale, 1.2);
    camera.position.set(...frame.position);
    camera.lookAt(...frame.target);
    if ("fov" in camera && typeof (camera as { fov?: number }).fov === "number") {
      (camera as { fov: number }).fov = 34; // hero telephoto — survives inspect round-trips
    }
    camera.updateProjectionMatrix();
    if (!reducedMotion) {
      // Intro dolly: ease in from 12% farther out
      const to = new Vector3(...frame.position);
      const target = new Vector3(...frame.target);
      const from = target.clone().add(to.clone().sub(target).multiplyScalar(1.12));
      camera.position.copy(from);
      dolly.current = { from, to, t: 0 };
    }
    const t = requestAnimationFrame(() => {
      orbitRef.current?.target?.set(...frame.target);
    });
    return () => cancelAnimationFrame(t);
  }, [scene.templateId, scene.nodes, scene.rootScale, camera, reducedMotion, phaseKey]);

  // Drive the intro dolly (cancelled by user interaction or isolate framing)
  useFrame((_, delta) => {
    const d = dolly.current;
    if (!d) return;
    d.t = Math.min(1, d.t + delta / 0.8);
    const k = 1 - Math.pow(1 - d.t, 3); // ease-out cubic
    camera.position.lerpVectors(d.from, d.to, k);
    if (d.t >= 1) dolly.current = null;
  });

  // Camera-intent arbiter, step framing (eng V2). The step focus camera is the
  // SOLE writer in step mode: it SNAPS to the framed parts on every step change
  // AND every scene-identity change (navigation swaps present nodes), so the
  // camera can never be left pointing at empty space or a stale far view. User
  // orbit between changes is preserved (onStart cancels the intro dolly below).
  const stepLerp = useRef<{
    fromP: Vector3;
    toP: Vector3;
    fromT: Vector3;
    toT: Vector3;
    t: number;
  } | null>(null);
  const sceneKey = scene.nodes.map((n) => n.id).join(",");
  useEffect(() => {
    if (view.isolateNodeId || !phaseCamera) return;
    dolly.current = null;
    stepLerp.current = null;
    const toP = new Vector3(...phaseCamera.position);
    const toT = new Vector3(...phaseCamera.target);
    camera.position.copy(toP);
    camera.lookAt(toT);
    camera.updateProjectionMatrix();
    orbitRef.current?.target?.set(toT.x, toT.y, toT.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, sceneKey, view.isolateNodeId]);

  useFrame((_, delta) => {
    const s = stepLerp.current;
    if (!s) return;
    s.t = Math.min(1, s.t + delta / 0.9);
    const k = 1 - Math.pow(1 - s.t, 3);
    camera.position.lerpVectors(s.fromP, s.toP, k);
    const tgt = new Vector3().lerpVectors(s.fromT, s.toT, k);
    orbitRef.current?.target?.set(tgt.x, tgt.y, tgt.z);
    camera.lookAt(tgt);
    if (s.t >= 1) stepLerp.current = null;
  });

  // JARVIS isolate: frame extracted part (no Bounds.fit / remount)
  useEffect(() => {
    const id = view.isolateNodeId || null;
    if (!id) {
      if (isolateFrameKey.current) {
        isolateFrameKey.current = null;
        dolly.current = null;
        const frame = cadCameraForNodes(scene.nodes, scene.rootScale, 1.2);
        camera.position.set(...frame.position);
        camera.lookAt(...frame.target);
        if ("fov" in camera && typeof (camera as { fov?: number }).fov === "number") {
          (camera as { fov: number }).fov = 34;
        }
        camera.updateProjectionMatrix();
        orbitRef.current?.target?.set(...frame.target);
      }
      return;
    }
    if (isolateFrameKey.current === id) return;
    isolateFrameKey.current = id;
    dolly.current = null;
    // Use node with isolate pull applied for framing center
    const pulled = scene.nodes.map((n) => {
      if (n.id !== id) return n;
      const pos = computeNodeWorldPosition(n, view);
      return { ...n, position: pos };
    });
    const frame = frameForNodeIds(pulled, [id], scene.rootScale, 1.12);
    camera.position.set(...frame.position);
    camera.lookAt(...frame.target);
    if ("fov" in camera && typeof (camera as { fov?: number }).fov === "number") {
      (camera as { fov: number; updateProjectionMatrix: () => void }).fov = frame.fov;
    }
    camera.updateProjectionMatrix();
    orbitRef.current?.target?.set(...frame.target);
  }, [view.isolateNodeId, view, scene.nodes, scene.rootScale, camera]);

  useEffect(() => {
    if (!editMode || !view.selectedNodeId) {
      setGizmoTarget(null);
      return;
    }
    const obj = nodeRefs.current.get(view.selectedNodeId) || selectedRef.current;
    setGizmoTarget(obj || null);
  }, [editMode, view.selectedNodeId]);

  const beautyOpacity = beautySpec ? beautyDisplayOpacity(beautySpec) : 0;
  const segs = Math.max(
    32,
    quality.segments + (view.isolateNodeId ? 16 : 0)
  );
  // Stable key light — sun only *biases* direction, never zeros lighting
  const sunPos = sunLightPosition(
    { ...sun, intensity: Math.max(0.85, sun.intensity) },
    6
  );

  return (
    <>
      {/* Suspended during camera lerps / canvas resizes — a transient dip must
          not permanently strip effects (eng V3); sustained headroom promotes. */}
      {monitorActive && (
        <PerformanceMonitor onDecline={onQualityDrop} onIncline={onQualityRise} />
      )}
      {/* Lighting rebalance (eng review): the fills were ~2.3 combined and
          drowned the 1.35 key + washed out the IBL, reading flat. Cut ambient
          + fills so the key gives real directional contrast, and let the HDRI
          do more work (envIntensity multiplier 0.7 → 1.0). A floor of ambient
          keeps the stage off pure black. Shadow map bump is gated to `high`
          so mid/low devices don't pay the memory. */}
      {clarityMode ? (
        // Wiring-map rig: bright, flat, neutral — even light so every part, wire,
        // and pin label reads like a clean diagram. No drama, nothing hidden.
        <>
          <ambientLight intensity={0.5} color="#ffffff" />
          <hemisphereLight args={["#ffffff", "#b8bec8", 0.55]} />
          <directionalLight
            position={sunPos}
            intensity={1.1}
            castShadow
            color="#ffffff"
            shadow-mapSize={quality.tier === "high" ? [2048, 2048] : [1024, 1024]}
            shadow-bias={-0.0002}
          />
          <directionalLight position={[-4, 4, -3]} intensity={0.45} color="#ffffff" />
          <directionalLight position={[3.5, 3, 4]} intensity={0.4} color="#ffffff" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.26} color="#eef2f6" />
          <hemisphereLight args={["#f0f4f8", "#3a4550", 0.4]} />
          <directionalLight
            position={sunPos}
            intensity={1.55}
            castShadow
            color="#fff6ea"
            shadow-mapSize={quality.tier === "high" ? [2048, 2048] : [1024, 1024]}
            shadow-bias={-0.0002}
          />
          <directionalLight position={[-3.2, 2.8, -2.2]} intensity={0.32} color="#b8d0ea" />
          <directionalLight position={[2.4, 1.8, 3.2]} intensity={0.26} color="#ffe4c4" />
          <directionalLight position={[0, 5, 1]} intensity={0.14} color="#ffffff" />
          {/* Cinematic cool RIM behind-above — carves the brass silhouette out of
              the void and throws a free specular glint along the top/back rods. */}
          <directionalLight position={[-2.6, 3.4, -4.2]} intensity={1.35} color="#bcd4ff" />
        </>
      )}
      {/* Local studio HDRI (no CDN); Lightformer rig fallback if it can't load */}
      <EnvBoundary fallback={<LightformerStudio intensity={quality.envIntensity} />}>
        <Suspense fallback={null}>
          <Environment
            files="/hdri/studio_small_08_1k.hdr"
            environmentIntensity={quality.envIntensity}
          />
        </Suspense>
      </EnvBoundary>
      {/* (removed the standalone visible Lightformer rect — it read as a
          bright "block of sun" in-frame; the HDRI IBL now covers reflections) */}
      {!clarityMode && <fog attach="fog" args={["#06080f", 14, 120]} />}
      {/* Orbital-void sky — a large inverted sphere carrying the baked
          navy→black gradient + starfield. renderOrder -1 + depthWrite off keep
          it behind everything; fog off + toneMapped off keep the star cores
          crisp (drei <Stars> washed out to nothing under the ACES composer). */}
      {!clarityMode && (
        <mesh renderOrder={-1} frustumCulled={false}>
          <sphereGeometry args={[60, 40, 24]} />
          <meshBasicMaterial
            map={getProceduralMap("space_backdrop")}
            side={BackSide}
            depthWrite={false}
            fog={false}
            toneMapped={false}
          />
        </mesh>
      )}

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
        harnesses={harnesses}
        highlightNodeId={view.isolateNodeId || view.selectedNodeId}
        activeWireId={activeWireId}
        onWireTap={onWireTap}
      />

      {connectionPads && connectionPads.length > 0 && (
        <ConnectionPads pads={connectionPads} rootScale={scene.rootScale} />
      )}

      {/* Never remount on select — keeps materials/lights stable */}
      <group>
        {scene.nodes.map((n) => (
          <NodeMesh
            key={n.id}
            node={n}
            view={view}
            rootScale={scene.rootScale}
            onSelect={onSelect}
            onIsolate={onIsolate}
            segments={segs}
            meshRef={(obj) => {
              if (obj) nodeRefs.current.set(n.id, obj);
              else nodeRefs.current.delete(n.id);
              if (view.selectedNodeId === n.id) selectedRef.current = obj;
            }}
          />
        ))}
      </group>

      {editMode && view.selectedNodeId && gizmoTarget && (
        <GizmoControls
          object={gizmoTarget}
          mode={gizmoMode}
          enabled={editMode}
          rootScale={scene.rootScale}
          nodeId={view.selectedNodeId}
          onPoseCommit={onPoseCommit}
        />
      )}

      {/* Matte deck + grid — the hero render's floor. Hidden in the clarity
          wiring map so parts float on a clean light background (a diagram, not a
          scene). Reflector/PCSS stay banned (GPU blackout history). */}
      {!clarityMode && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[16, 16]} />
            <meshStandardMaterial color="#0a0e16" metalness={0.15} roughness={0.82} />
          </mesh>
          <Grid
            position={[0, -0.012, 0]}
            args={[12, 12]}
            cellSize={0.25}
            cellThickness={0.4}
            cellColor="#1b2331"
            sectionSize={1}
            sectionThickness={0.8}
            sectionColor="#2b3a4e"
            fadeDistance={7}
            fadeStrength={1.5}
            infiniteGrid
          />
        </>
      )}
      <ContactShadows
        position={[0, 0.004, 0]}
        opacity={clarityMode ? 0.22 : 0.58}
        scale={9}
        blur={2.8}
        far={6}
        color={clarityMode ? "#94a0b2" : "#0a0c10"}
      />

      {/* target intentionally uncontrolled — writers set it explicitly (eng V2) */}
      <OrbitControls
        ref={orbitRef as never}
        makeDefault
        minDistance={0.9}
        maxDistance={16}
        enablePan
        enableDamping
        dampingFactor={0.08}
        autoRotate={
          idleSpin && idle && !reducedMotion && !editMode && !view.isolateNodeId && !view.selectedNodeId
        }
        autoRotateSpeed={0.45}
        onStart={() => {
          dolly.current = null;
          stepLerp.current = null; // user input wins instantly (eng V2)
          setIdle(false);
          if (idleTimer.current) clearTimeout(idleTimer.current);
        }}
        onEnd={() => {
          if (idleTimer.current) clearTimeout(idleTimer.current);
          idleTimer.current = setTimeout(() => setIdle(true), 8000);
        }}
        // Keep orbit alive during select — only pause when actively posing
        enabled={!editMode}
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
  /** Controlled assembly view (CAD shell). When set, layer panel can be external. */
  controlledView,
  onViewChange,
  hideChrome = false,
  harnesses,
  /** Override scene nodes (phase/joint frame applied by parent) */
  sceneNodesOverride,
  /** JARVIS: double-click part to isolate (parent owns state) */
  onIsolatePart,
  phaseCamera = null,
  activeWireId = null,
  onWireTap,
  connectionPads = null,
  clarityMode = false,
  idleSpin: idleSpinProp,
  transientEpoch = 0,
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
  controlledView?: LayerViewState | null;
  onViewChange?: (view: LayerViewState) => void;
  /** Strip header/brain chips — assembly shell owns chrome */
  hideChrome?: boolean;
  harnesses?: import("@/lib/product-3d").WireRoute3D[];
  sceneNodesOverride?: SceneNode3D[] | null;
  onIsolatePart?: (nodeId: string) => void;
  /** Recipe phase camera hint (step context) — lerped by the arbiter */
  phaseCamera?: { position: [number, number, number]; target: [number, number, number] } | null;
  /** "Show me" drill-down: light exactly one wire route. */
  activeWireId?: string | null;
  /** Hero tap-to-trace: click a wire tube in the Full view to light it. */
  onWireTap?: (id: string | null) => void;
  /** Wiring-map: labeled net-colored pads at each wire endpoint. */
  connectionPads?: import("@/lib/product-3d").ConnectionPad[] | null;
  /** Wiring-map clarity render: bright/flat, no cinematic dark/DoF (legibility). */
  clarityMode?: boolean;
  /** Override idle auto-orbit (step variant disables it — eng V2) */
  idleSpin?: boolean;
  /** Bump on canvas-size transitions (expand) to pause the perf monitor */
  transientEpoch?: number;
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
  // Demotion is no longer a one-way ratchet (eng V3): sustained headroom
  // re-promotes one tier (hysteresis: ≥60s between changes, capped at the
  // device's detected tier), and known-transient churn pauses the monitor.
  const initialTierRef = useRef<QualityTier>(qualityTier);
  const lastTierChange = useRef(0);
  const dropQuality = useCallback(() => {
    lastTierChange.current = Date.now();
    setQualityTier((t) => (t === "high" ? "medium" : t === "medium" ? "low" : "low"));
  }, []);
  const riseQuality = useCallback(() => {
    if (Date.now() - lastTierChange.current < 60_000) return;
    const order: QualityTier[] = ["low", "medium", "high"];
    setQualityTier((t) => {
      const idx = order.indexOf(t);
      const cap = order.indexOf(initialTierRef.current);
      if (idx >= cap) return t;
      lastTierChange.current = Date.now();
      return order[idx + 1];
    });
  }, []);
  const [monitorCalm, setMonitorCalm] = useState(true);
  const calmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markTransient = useCallback(() => {
    setMonitorCalm(false);
    if (calmTimer.current) clearTimeout(calmTimer.current);
    calmTimer.current = setTimeout(() => setMonitorCalm(true), 1500);
  }, []);
  useEffect(() => {
    if (transientEpoch > 0) markTransient();
  }, [transientEpoch, markTransient]);
  useEffect(() => () => {
    if (calmTimer.current) clearTimeout(calmTimer.current);
  }, []);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const [sun, setSun] = useState<SunState>(DEFAULT_SUN);
  const [aimSolar, setAimSolar] = useState(true);
  // Wiring is product content — on by default so you can trace pin-to-pin
  const [showWires, setShowWires] = useState(true);

  const planForBeauty = useMemo(
    () => ({ ...plan, beautyMesh: beautyOverride || plan.beautyMesh }),
    [plan, beautyOverride]
  );

  const baseScene = useMemo(() => buildProductScene3D(plan), [plan]);
  const posedScene = useMemo(() => {
    const withNodes = sceneNodesOverride
      ? { ...baseScene, nodes: sceneNodesOverride }
      : baseScene;
    return applyPoseLayout(withNodes, poses);
  }, [baseScene, poses, sceneNodesOverride]);
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
  // DoF focus = scene bbox center = the OrbitControls target, so autoRotate
  // spins the camera around the focus point and the subject stays sharp with
  // zero per-frame tracking.
  const dofFocus = useMemo(
    () => new Vector3(...sceneWorldBounds(scene.nodes, scene.rootScale).center),
    [scene.nodes, scene.rootScale]
  );
  const beautyResolved = useMemo(() => resolveBeautyMesh(planForBeauty), [planForBeauty]);
  const beautySpec = beautyResolved.spec;
  const [internalView, setInternalView] = useState<LayerViewState>(() => defaultLayerView(scene.nodes));
  const isControlled = controlledView != null;
  const view = isControlled ? controlledView! : internalView;
  /** Always read latest controlled snapshot — never close over a stale controlledView. */
  const controlledViewRef = useRef(controlledView);
  controlledViewRef.current = controlledView;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const setView = useCallback(
    (updater: LayerViewState | ((v: LayerViewState) => LayerViewState)) => {
      if (isControlled) {
        const prev = controlledViewRef.current;
        if (!prev) return;
        const next = typeof updater === "function" ? updater(prev) : updater;
        onViewChangeRef.current?.(next);
      } else {
        setInternalView(updater);
      }
    },
    [isControlled]
  );
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
    if (isControlled) return;
    setInternalView(defaultLayerView(scene.nodes));
  }, [baseScene.templateId, isControlled]);

  useEffect(() => {
    // Clear solo when no focus; only solo layers that exist in this scene
    // Skip when parent assembly shell owns focus via controlledView
    if (isControlled) return;
    if (!focusLayer) {
      setInternalView((v) => ({ ...v, soloLayerId: null }));
      return;
    }
    const hasLayer = scene.nodes.some((n) => n.layer === focusLayer);
    if (!hasLayer) {
      setInternalView((v) => ({ ...v, soloLayerId: null }));
      return;
    }
    setInternalView((v) => ({
      ...v,
      soloLayerId: focusLayer,
      selectedNodeId: scene.nodes.find((n) => n.layer === focusLayer)?.id || v.selectedNodeId,
    }));
  }, [focusLayer, scene.nodes, isControlled]);

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

  const onSelect = useCallback(
    (id: string) => {
      // Functional updater + ref-backed setView → preserves explode/hides/section
      setView((v) => ({ ...v, selectedNodeId: id, soloLayerId: null }));
    },
    [setView]
  );

  const onIsolate = useCallback(
    (id: string) => {
      if (onIsolatePart) {
        onIsolatePart(id);
        return;
      }
      setView((v) => ({
        ...v,
        isolateNodeId: v.isolateNodeId === id ? null : id,
        selectedNodeId: id,
        soloLayerId: null,
      }));
    },
    [onIsolatePart, setView]
  );

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
  const notes = compact ? [] : scene.reasoningNotes || [];
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
      className={`relative overflow-hidden ${
        hideChrome
          ? "rounded-none border-0 bg-transparent shadow-none h-full"
          : "rounded-2xl border border-white/10 bg-gradient-to-b from-[#0c1219] to-[#080b10] shadow-2xl shadow-black/40"
      }`}
    >
      {/* Header — slim in compact/session mode; hidden when assembly shell owns chrome */}
      {!hideChrome && (
      <div
        className={`flex items-center justify-between gap-2 border-b border-white/[0.07] bg-black/20 ${
          compact ? "px-2.5 py-1.5" : "px-3.5 py-2.5"
        }`}
      >
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
          {!compact && beautySpec?.status === "ready" && (
            <button
              type="button"
              title={beautyResolved.disclaimer}
              onClick={() => setBeautyOn((b) => !b)}
              className={`text-[10px] px-2 py-1 rounded-lg cursor-pointer transition-colors ${chipBtn(beautyOn && showBeauty, "violet")}`}
            >
              Beauty
            </button>
          )}
          {!compact && beautyProviderConfigured && (
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
          {editable && !compact && (
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
          {!compact && (
            <span className="text-[9px] uppercase tracking-wider text-white/30 font-medium pl-1">
              {scene.grade}
            </span>
          )}
        </div>
      </div>
      )}

      {/* Design brain chips */}
      {!hideChrome && notes.length > 0 && (
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

      {/* Tiny corner tools only — no toolbar strip eating the model */}
      {hideChrome && editable && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button
            type="button"
            title="Show wiring"
            onClick={() => setShowWires((v) => !v)}
            className={`text-[9px] px-2 py-1 rounded-md cursor-pointer border border-white/10 ${
              showWires ? "bg-cyan-500/40 text-white" : "bg-black/50 text-white/60"
            }`}
          >
            Wires
          </button>
          <button
            type="button"
            title="Drag parts"
            onClick={() => {
              setEditMode((e) => {
                if (!e) setView((v) => ({ ...v, explode: 0 }));
                return !e;
              });
            }}
            className={`text-[9px] px-2 py-1 rounded-md cursor-pointer border border-white/10 ${
              editMode ? "bg-amber-400 text-black" : "bg-black/50 text-white/60"
            }`}
          >
            {editMode ? "Done" : "Pose"}
          </button>
        </div>
      )}

      <div className={`flex ${showLayerPanel ? "flex-col sm:flex-row" : "flex-col"} ${hideChrome ? "h-full" : ""}`}>
        <div className="flex-1 relative min-h-0 w-full" style={{ height: hideChrome ? "100%" : height, minHeight: height }}>
          <Canvas
            camera={{
              position: (() => {
                const f = cadCameraForNodes(scene.nodes, scene.rootScale, 1.2);
                return f.position;
              })(),
              fov: 34,
              near: 0.05,
              far: 100,
            }}
            dpr={quality.dpr}
            shadows
            gl={{
              antialias: quality.antialias,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: ACESFilmicToneMapping,
              toneMappingExposure: 1.35,
            }}
            onPointerMissed={() => {
              if (!editMode) {
                setView((v) => ({
                  ...v,
                  selectedNodeId: null,
                  soloLayerId: null,
                }));
                onWireTap?.(null);
              }
            }}
          >
            {/* Orbital void for the hero render; a light neutral for the clarity
                wiring map so parts, wires + pin labels read like a diagram. */}
            <color attach="background" args={[clarityMode ? "#e9edf2" : "#06080f"]} />
            <Suspense fallback={null}>
              <SceneContent
                clarityMode={clarityMode}
                scene={scene}
                view={view}
                editMode={editMode}
                gizmoMode={gizmoMode}
                onSelect={onSelect}
                onIsolate={onIsolate}
                onPoseCommit={onPoseCommit}
                beautySpec={beautySpec}
                showBeauty={showBeauty}
                quality={quality}
                onQualityDrop={dropQuality}
                sun={sun}
                showWires={showWires}
                harnesses={harnesses}
                activeWireId={activeWireId}
                onWireTap={onWireTap}
                connectionPads={connectionPads}
                idleSpin={idleSpinProp ?? !!hideChrome}
                reducedMotion={reducedMotion}
                phaseCamera={phaseCamera}
                monitorActive={monitorCalm}
                onQualityRise={riseQuality}
                onTransient={markTransient}
              />
            </Suspense>
            {quality.effects && <PostFX quality={quality} focus={dofFocus} clarityMode={clarityMode} />}
          </Canvas>
          {/* Floating hint */}
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:right-auto flex gap-1.5">
            <span className="text-[9px] px-2 py-1 rounded-md bg-black/50 text-white/40 backdrop-blur-sm border border-white/5">
              Scroll zoom · drag orbit · double-click inspect
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
/** Prefer the step object you already resolved (avoids Quick-mode index bugs). */
export function stepFocusLayerFromStep(step: {
  title?: string;
  description?: string;
  mediaKind?: string;
} | null | undefined): string | null {
  if (!step) return null;
  return focusLayerForStep(step.title || "", step.description || "", step.mediaKind);
}

/** @deprecated Use stepFocusLayerFromStep(step) — plan.steps[index] breaks under filtered modes */
export function stepFocusLayer(plan: BuildPlan, stepIndex: number): string | null {
  const step = plan.steps?.[stepIndex];
  return stepFocusLayerFromStep(step);
}
