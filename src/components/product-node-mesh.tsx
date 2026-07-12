"use client";

/**
 * High-fidelity parametric part meshes — composite geometry + MeshPhysicalMaterial.
 * Cage rods use pure geom-math (quaternion-safe euler) so the cube is a solid 3D frame.
 */
import {
  Component,
  forwardRef,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html, RoundedBox, Outlines, useGLTF } from "@react-three/drei";
import {
  Box3,
  DoubleSide,
  MathUtils,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { partModelFor, unitToMm } from "@/lib/product-3d/part-models";
import {
  computeNodeWorldPosition,
  nodeOpacity,
  nodeVisible,
  type SceneNode3D,
  type LayerViewState,
} from "@/lib/product-3d";
import {
  inferMaterialPreset,
  resolvePhysicalMaterial,
} from "@/lib/product-3d/materials";
import {
  drawOledScreen,
  getProceduralMap,
  makeOledScreenMap,
  makeSilkscreenMap,
} from "@/lib/product-3d/procedural-maps";
import { cubeCorners, wireCubeRods } from "@/lib/product-3d/geom-math";
import { pinStubsForNode, pinLocal } from "@/lib/product-3d/sat-pins";

function PhysMat({
  geomKind,
  material,
  nodeId,
  opacity,
}: {
  geomKind: string;
  material: SceneNode3D["material"];
  nodeId: string;
  opacity: number;
}) {
  const m = resolvePhysicalMaterial(geomKind, material, nodeId, opacity);
  const preset = inferMaterialPreset(geomKind, material, nodeId);
  const maps = useMemo(() => {
    if (preset === "brass" || preset === "copper" || geomKind === "wire_cube_cage") {
      return {
        normalMap: getProceduralMap("brushed_normal"),
        normalScale: new Vector2(0.55, 0.55),
        roughnessMap: null as null,
      };
    }
    if (preset === "pcb_green" || geomKind === "pcb_module" || geomKind === "board") {
      return {
        normalMap: null as null,
        normalScale: new Vector2(1, 1),
        roughnessMap: getProceduralMap("fr4_roughness"),
      };
    }
    return { normalMap: null, normalScale: new Vector2(1, 1), roughnessMap: null };
  }, [preset, geomKind]);

  return (
    <meshPhysicalMaterial
      color={m.color}
      metalness={m.metalness}
      roughness={m.roughness}
      clearcoat={m.clearcoat ?? 0}
      clearcoatRoughness={m.clearcoatRoughness ?? 0.3}
      sheen={m.sheen ?? 0}
      sheenRoughness={m.sheenRoughness ?? 0.5}
      sheenColor={m.sheenColor ?? "#ffffff"}
      emissive={m.emissive || "#000000"}
      emissiveIntensity={m.emissiveIntensity ?? 0}
      envMapIntensity={m.envMapIntensity ?? 0.8}
      anisotropy={m.anisotropy ?? 0}
      anisotropyRotation={m.anisotropyRotation ?? 0}
      transmission={m.transmission ?? 0}
      thickness={m.thickness ?? 0}
      ior={m.ior ?? 1.5}
      normalMap={maps.normalMap || undefined}
      normalScale={maps.normalScale}
      roughnessMap={maps.roughnessMap || undefined}
      transparent={m.transparent}
      opacity={m.opacity}
    />
  );
}

function SelectOutline({ selected }: { selected: boolean }) {
  if (!selected) return null;
  return <Outlines thickness={2.5} color="#22d3ee" screenspace opacity={0.9} />;
}

/** Catch missing FreeCAD/OpenSCAD GLBs without crashing the parametric mesh. */
class GlbErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_e: Error, _i: ErrorInfo) {
    /* parametric fallback */
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Optional catalog GLB underlay — loads a real/authored model in place of the
 * parametric mesh. Pins/wires stay parametric; the GLB is visual only.
 *
 * Normalization (from the open PART_MODELS registry, keyed by catalogId) makes
 * ARBITRARY-source GLBs fit Forge's part-local frame without re-exporting them:
 *   • unit  → scaled to mm (most CAD is mm; some Sketchfab exports are metres)
 *   • rotationDeg → orients Z-up CAD into board-in-XY / +Z-up
 *   • centerToBbox → recenters a model whose origin is a corner to the node origin
 * The model is authored in mm; the inner group is mm, the outer group scales to world.
 */
function CatalogGlbUnderlay({
  url,
  rootScale,
  opacity,
  catalogId,
}: {
  url: string;
  rootScale: number;
  opacity: number;
  catalogId?: string;
}) {
  const { scene } = useGLTF(url);
  const model = partModelFor(catalogId);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        const nm = (m as Material).clone() as Material & {
          opacity?: number;
          transparent?: boolean;
          depthWrite?: boolean;
        };
        nm.transparent = opacity < 0.99;
        nm.opacity = opacity;
        nm.depthWrite = opacity > 0.85;
        return nm;
      });
      mesh.material = cloned.length === 1 ? cloned[0]! : cloned;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    // Orientation first (rotation commutes with the later uniform scale)…
    if (model?.rotationDeg) {
      c.rotation.set(
        MathUtils.degToRad(model.rotationDeg[0]),
        MathUtils.degToRad(model.rotationDeg[1]),
        MathUtils.degToRad(model.rotationDeg[2])
      );
    }
    // …then recenter in the mm frame so datasheet-mm pins overlay correctly.
    if (model?.centerToBbox) {
      c.updateMatrixWorld(true);
      const center = new Box3().setFromObject(c).getCenter(new Vector3());
      c.position.sub(center);
    }
    return c;
  }, [scene, opacity, model]);
  // Inner group is mm (authored/normalized); outer group takes mm → world,
  // folding in the source-unit scale so a metre-authored GLB still lands right.
  return (
    <group scale={rootScale * unitToMm(model?.unit)}>
      <primitive object={clone} />
    </group>
  );
}

/** Gold pin + copper pad + solder — lands harness tubes on boards (craft realism). */
function PinStub({
  position,
  scale,
  opacity,
  color = "#e2e8f0",
  netColor,
}: {
  position: [number, number, number];
  scale: number;
  opacity: number;
  color?: string;
  /** Optional insulation color ring under the pin */
  netColor?: string;
}) {
  const s = scale;
  return (
    <group position={position}>
      {/* Copper annular pad on FR4 */}
      <mesh position={[0, 0, -0.05 * s]}>
        <cylinderGeometry args={[1.05 * s, 1.1 * s, 0.18 * s, 12]} />
        <meshPhysicalMaterial
          color="#c47a3a"
          metalness={0.96}
          roughness={0.2}
          envMapIntensity={1.45}
          normalMap={getProceduralMap("copper_normal")}
          normalScale={new Vector2(0.8, 0.8)}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Solder meniscus */}
      <mesh position={[0, 0, 0.2 * s]}>
        <sphereGeometry args={[0.72 * s, 10, 10]} />
        <meshPhysicalMaterial
          color="#d4b06a"
          metalness={0.94}
          roughness={0.18}
          envMapIntensity={1.4}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Gold pin post (Z out of board) */}
      <mesh position={[0, 0, 1.15 * s]}>
        <boxGeometry args={[0.5 * s, 0.5 * s, 2.15 * s]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.96}
          roughness={0.1}
          envMapIntensity={1.55}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Black plastic header shoulder */}
      <mesh position={[0, 0, 0.45 * s]}>
        <boxGeometry args={[0.95 * s, 0.95 * s, 0.55 * s]} />
        <meshPhysicalMaterial
          color="#1a1a1e"
          metalness={0.08}
          roughness={0.62}
          transparent
          opacity={opacity}
        />
      </mesh>
      {netColor && (
        <mesh position={[0, 0, 0.75 * s]}>
          <torusGeometry args={[0.65 * s, 0.14 * s, 6, 12]} />
          <meshPhysicalMaterial
            color={netColor}
            metalness={0.05}
            roughness={0.48}
            transparent
            opacity={opacity}
          />
        </mesh>
      )}
    </group>
  );
}

/** Smooth position for phase/explode so the modeler feels animated, not jumpy. */
function SmoothRoot({
  position,
  rotation,
  children,
  meshRef,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  children: React.ReactNode;
  meshRef?: React.Ref<Object3D>;
}) {
  const g = useRef<Group>(null);
  const target = useRef(new Vector3(...position));
  const rot = useRef(rotation);
  const snapped = useRef(false);
  target.current.set(position[0], position[1], position[2]);
  rot.current = rotation;
  useFrame((_, dt) => {
    if (!g.current) return;
    if (!snapped.current) {
      g.current.position.copy(target.current);
      g.current.rotation.set(rot.current[0], rot.current[1], rot.current[2]);
      snapped.current = true;
      return;
    }
    const k = 1 - Math.exp(-11 * dt);
    g.current.position.lerp(target.current, k);
    g.current.rotation.x += (rot.current[0] - g.current.rotation.x) * k;
    g.current.rotation.y += (rot.current[1] - g.current.rotation.y) * k;
    g.current.rotation.z += (rot.current[2] - g.current.rotation.z) * k;
  });
  return (
    <group
      ref={(obj) => {
        (g as React.MutableRefObject<Group | null>).current = obj;
        if (typeof meshRef === "function") meshRef(obj);
        else if (meshRef && "current" in meshRef)
          (meshRef as React.MutableRefObject<Object3D | null>).current = obj;
      }}
    >
      {children}
    </group>
  );
}

export function NodeMesh({
  node,
  view,
  rootScale,
  onSelect,
  onIsolate,
  meshRef,
  suppressExplode = false,
  segments = 40,
}: {
  node: SceneNode3D;
  view: LayerViewState;
  rootScale: number;
  onSelect: (id: string) => void;
  onIsolate?: (id: string) => void;
  meshRef?: React.Ref<Object3D>;
  suppressExplode?: boolean;
  segments?: number;
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
  const isolated = view.isolateNodeId === node.id;
  const s = rootScale;
  const p = node.geom.params;
  const kind = node.geom.kind;

  // Live OLED face — hooks stay above the early return / switch (rules of hooks).
  const isOled = kind === "oled_module" || kind === "oled_panel";
  const oledMode = node.id === "face" ? ("clock" as const) : ("readout" as const);
  const oledScreenTex = useMemo(
    () => (isOled ? makeOledScreenMap(oledMode, node.label || node.id) : null),
    [isOled, oledMode, node.label, node.id]
  );
  useEffect(() => {
    if (!oledScreenTex || oledMode !== "clock") return;
    const redraw = () => drawOledScreen(oledScreenTex, { mode: "clock", time: new Date() });
    redraw();
    const timer = setInterval(redraw, 30_000);
    return () => clearInterval(timer);
  }, [oledScreenTex, oledMode]);

  if (!visible) return null;

  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(node.id);
  };
  const onDoubleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onIsolate?.(node.id);
  };

  const phys = (k = kind) => (
    <PhysMat geomKind={k} material={node.material} nodeId={node.id} opacity={opacity} />
  );

  let inner: React.ReactNode = null;

  switch (kind) {
    case "metal_stand": {
      const stemR = (p.stemR || 2.4) * s;
      const ht = (p.height || 88) * s;
      const footR = (p.footR || 14) * s;
      const footH = (p.footH || 3.5) * s;
      const segs = Math.max(24, segments);
      inner = (
        <group onClick={onClick}>
          {/* Weighted disc foot — brushed steel */}
          <mesh position={[0, footH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[footR, footR * 1.08, footH, segs]} />
            <meshPhysicalMaterial
              color="#9aa3ad"
              metalness={0.92}
              roughness={0.22}
              envMapIntensity={1.35}
              transparent
              opacity={opacity}
            />
            <SelectOutline selected={selected} />
          </mesh>
          {/* Beveled foot lip */}
          <mesh position={[0, footH * 0.95, 0]}>
            <cylinderGeometry args={[footR * 0.72, footR * 0.95, footH * 0.35, segs]} />
            <meshPhysicalMaterial color="#b8c0c8" metalness={0.9} roughness={0.2} envMapIntensity={1.3} transparent opacity={opacity} />
          </mesh>
          {/* Tapered stem */}
          <mesh position={[0, footH + ht / 2, 0]} castShadow>
            <cylinderGeometry args={[stemR * 0.88, stemR, ht, segs]} />
            <meshPhysicalMaterial
              color="#d0d6dc"
              metalness={0.94}
              roughness={0.18}
              envMapIntensity={1.4}
              transparent
              opacity={opacity}
            />
          </mesh>
          {/* Brass collar into cage */}
          <mesh position={[0, footH + ht + stemR * 0.2, 0]} castShadow>
            <sphereGeometry args={[stemR * 1.55, 20, 20]} />
            <meshPhysicalMaterial
              color="#d4a84b"
              metalness={0.96}
              roughness={0.18}
              clearcoat={0.4}
              envMapIntensity={1.5}
              transparent
              opacity={opacity}
            />
          </mesh>
        </group>
      );
      break;
    }

    case "wire_cube_cage": {
      // Pure geom-math rods → true 3D cube of solid brass (mm → world via s)
      const sizeMm = p.size || 62;
      const r = (p.rodR || 2.4) * s;
      const size = sizeMm * s;
      const segs = Math.max(20, Math.floor(segments / 2));
      const corners = cubeCorners(size);
      const rods = wireCubeRods(sizeMm).map((rod) => ({
        ...rod,
        mid: [rod.mid[0] * s, rod.mid[1] * s, rod.mid[2] * s] as [number, number, number],
        length: rod.length * s,
      }));
      const brassNormal = getProceduralMap("brushed_normal");
      const brassRough = getProceduralMap("brushed_roughness");
      const brassNScale = new Vector2(0.65, 0.65);
      inner = (
        <group onClick={onClick}>
          {corners.map((c, i) => (
            <mesh key={`c${i}`} position={c} castShadow>
              <sphereGeometry args={[r * 1.65, segs, segs]} />
              <meshPhysicalMaterial
                color="#d4a84b"
                metalness={0.97}
                roughness={0.14}
                clearcoat={0.55}
                clearcoatRoughness={0.1}
                envMapIntensity={1.7}
                normalMap={brassNormal}
                normalScale={brassNScale}
                roughnessMap={brassRough}
                anisotropy={0.5}
                transparent
                opacity={opacity}
              />
            </mesh>
          ))}
          {rods.map((rod, i) => (
            <mesh
              key={`e${i}`}
              position={rod.mid}
              rotation={rod.euler}
              castShadow
            >
              <cylinderGeometry args={[r, r, rod.length, segs]} />
              <meshPhysicalMaterial
                color="#e0b45c"
                metalness={0.98}
                roughness={0.12}
                clearcoat={0.55}
                clearcoatRoughness={0.08}
                envMapIntensity={1.8}
                normalMap={brassNormal}
                normalScale={brassNScale}
                roughnessMap={brassRough}
                anisotropy={0.6}
                anisotropyRotation={Math.PI / 2}
                transparent
                opacity={opacity}
              />
            </mesh>
          ))}
          {/* Soldery mid-edge beads for craft specificity */}
          {rods.map((rod, i) => (
            <mesh key={`j${i}`} position={rod.mid} castShadow>
              <sphereGeometry args={[r * 1.15, 12, 12]} />
              <meshPhysicalMaterial
                color="#c9963a"
                metalness={0.96}
                roughness={0.18}
                envMapIntensity={1.5}
                transparent
                opacity={opacity}
              />
            </mesh>
          ))}
          {selected && (
            <mesh>
              <boxGeometry args={[size * 1.06, size * 1.06, size * 1.06]} />
              <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.2} />
            </mesh>
          )}
        </group>
      );
      break;
    }

    case "battery_straps": {
      const size = (p.size || 50) * s;
      const r = (p.rodR || 0.7) * s;
      const ringR = size * 0.38;
      inner = (
        <group onClick={onClick}>
          {[-1, 1].map((sign) => (
            <mesh key={sign} position={[sign * size * 0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[ringR * 0.55, r, 8, 24]} />
              <meshPhysicalMaterial color="#c9a227" metalness={0.92} roughness={0.28} envMapIntensity={1.1} transparent opacity={opacity} />
              <SelectOutline selected={selected} />
            </mesh>
          ))}
        </group>
      );
      break;
    }

    case "face_panel": {
      // Front body plate with OLED cutout — satellite has a face, not empty brass void
      const w = (p.width || 57) * s;
      const h = (p.height || 57) * s;
      const d = (p.depth || 2.2) * s;
      const cutW = (p.cutoutW || 38) * s;
      const cutH = (p.cutoutH || 28) * s;
      const rim = Math.max(d * 0.9, s * 1.2);
      // Four bars around the window (CSG-free cutout)
      const topH = (h - cutH) / 2;
      const sideW = (w - cutW) / 2;
      const mat = {
        color: node.material.color || "#1e293b",
        metalness: 0.28,
        roughness: 0.42,
        envMapIntensity: 0.95,
      } as const;
      inner = (
        <group onClick={onClick}>
          {/* Outer frame bars */}
          <mesh position={[0, h / 2 - topH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, topH, d]} />
            <meshPhysicalMaterial {...mat} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, -h / 2 + topH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, topH, d]} />
            <meshPhysicalMaterial {...mat} transparent opacity={opacity} />
          </mesh>
          <mesh position={[-w / 2 + sideW / 2, 0, 0]} castShadow>
            <boxGeometry args={[sideW, cutH, d]} />
            <meshPhysicalMaterial {...mat} transparent opacity={opacity} />
          </mesh>
          <mesh position={[w / 2 - sideW / 2, 0, 0]} castShadow>
            <boxGeometry args={[sideW, cutH, d]} />
            <meshPhysicalMaterial {...mat} transparent opacity={opacity} />
          </mesh>
          {/* Bezel lip around OLED window */}
          <mesh position={[0, 0, d * 0.55]}>
            <boxGeometry args={[cutW + rim * 0.6, cutH + rim * 0.6, d * 0.25]} />
            <meshPhysicalMaterial
              color="#0f172a"
              metalness={0.4}
              roughness={0.35}
              transparent
              opacity={0.95 * opacity}
            />
          </mesh>
          {/* Corner rivets */}
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sy], i) => (
            <mesh
              key={i}
              position={[(sx * w) / 2 - sx * d * 2.2, (sy * h) / 2 - sy * d * 2.2, d * 0.65]}
            >
              <cylinderGeometry args={[d * 0.45, d * 0.5, d * 0.35, 10]} />
              <meshPhysicalMaterial
                color="#94a3b8"
                metalness={0.88}
                roughness={0.25}
                transparent
                opacity={opacity}
              />
            </mesh>
          ))}
          {/* Thin edge highlight */}
          <mesh position={[0, 0, d * 0.7]}>
            <boxGeometry args={[w * 0.98, h * 0.98, d * 0.05]} />
            <meshBasicMaterial color="#64748b" transparent opacity={0.15 * opacity} />
          </mesh>
          <SelectOutline selected={selected} />
        </group>
      );
      break;
    }

    case "rear_panel": {
      // Rear service plate — charger mounts here; body presence on the back
      const w = (p.width || 54) * s;
      const h = (p.height || 54) * s;
      const d = (p.depth || 2) * s;
      const mat = {
        color: node.material.color || "#334155",
        metalness: 0.32,
        roughness: 0.48,
        envMapIntensity: 0.9,
      } as const;
      inner = (
        <group onClick={onClick}>
          <RoundedBox args={[w, h, d]} radius={d * 0.15} smoothness={3} castShadow receiveShadow>
            <meshPhysicalMaterial {...mat} transparent opacity={opacity} />
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Vent slots */}
          {Array.from({ length: 5 }).map((_, i) => (
            <mesh
              key={`v${i}`}
              position={[-w * 0.28 + i * w * 0.14, h * 0.28, d * 0.55]}
            >
              <boxGeometry args={[w * 0.06, h * 0.22, d * 0.15]} />
              <meshPhysicalMaterial
                color="#0f172a"
                metalness={0.2}
                roughness={0.6}
                transparent
                opacity={0.9 * opacity}
              />
            </mesh>
          ))}
          {/* Mount boss for charger */}
          <mesh position={[0, -h * 0.12, d * 0.55]}>
            <boxGeometry args={[w * 0.42, h * 0.32, d * 0.2]} />
            <meshPhysicalMaterial
              color="#1e293b"
              metalness={0.25}
              roughness={0.5}
              transparent
              opacity={opacity}
            />
          </mesh>
          {/* Corner fasteners */}
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sy], i) => (
            <mesh
              key={i}
              position={[(sx * w) / 2 - sx * d * 2.5, (sy * h) / 2 - sy * d * 2.5, d * 0.7]}
            >
              <cylinderGeometry args={[d * 0.4, d * 0.45, d * 0.3, 8]} />
              <meshPhysicalMaterial
                color="#94a3b8"
                metalness={0.9}
                roughness={0.2}
                transparent
                opacity={opacity}
              />
            </mesh>
          ))}
        </group>
      );
      break;
    }

    case "shell_panel": {
      // Optional frosted inner shell — peelable body volume
      const w = (p.width || 58) * s;
      const h = (p.height || 58) * s;
      const d = (p.depth || 58) * s;
      const t = Math.max((p.thickness || 1.2) * s, s * 0.8);
      inner = (
        <group onClick={onClick}>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshPhysicalMaterial
              color={node.material.color || "#94a3b8"}
              metalness={0.05}
              roughness={0.35}
              transmission={0.55}
              thickness={t * 8}
              transparent
              opacity={0.22 * opacity}
              side={DoubleSide}
              envMapIntensity={1.1}
            />
          </mesh>
          <SelectOutline selected={selected} />
        </group>
      );
      break;
    }

    case "bamboo_base": {
      const r = (p.radius || 55) * s;
      const h = (p.height || 10) * s;
      const rings = Math.min(6, Math.max(2, Math.round(p.rings || 4)));
      inner = (
        <group onClick={onClick}>
          {/* Main coaster disk (Y-up) */}
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r, r * 1.02, h, segments]} />
            {phys("bamboo_base")}
            <SelectOutline selected={selected} />
          </mesh>
          {/* Concentric grain rings on top */}
          {Array.from({ length: rings }).map((_, i) => {
            const t = (i + 1) / (rings + 1);
            const rr = r * (0.25 + t * 0.7);
            return (
              <mesh key={i} position={[0, h + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[rr * 0.92, rr, segments]} />
                <meshPhysicalMaterial
                  color="#a67c3d"
                  metalness={0.02}
                  roughness={0.85}
                  transparent
                  opacity={0.22 * opacity}
                />
              </mesh>
            );
          })}
          {/* Soft edge lip */}
          <mesh position={[0, h * 0.85, 0]}>
            <torusGeometry args={[r * 0.98, h * 0.12, 8, segments]} />
            <meshPhysicalMaterial color="#b8955a" metalness={0.04} roughness={0.7} transparent opacity={0.85 * opacity} />
          </mesh>
        </group>
      );
      break;
    }

    case "oled_module":
    case "oled_panel": {
      // width/height = full module board (RealPartSpec ~27×27); active area inset
      const w = (p.width || 27) * s;
      const h = (p.height || 27) * s;
      const d = (p.depth || 4) * s;
      const bezel = (p.bezel || 2.5) * s;
      const showPcb = (p.pcb ?? 1) > 0;
      // Outer bound stays at w×h (dimension authority). PCB = module board; glass = active area.
      const screenW = Math.max(w - bezel * 2, w * 0.72);
      const screenH = Math.max(h - bezel * 2.4, h * 0.62);
      inner = (
        <group onClick={onClick}>
          {/* Module PCB flange (blue) — slightly thinner, same outer XY as bbox */}
          {showPcb && (
            <RoundedBox position={[0, -h * 0.02, -d * 0.28]} args={[w, h, d * 0.4]} radius={d * 0.08} smoothness={3} castShadow>
              <meshPhysicalMaterial color="#1e3a5f" metalness={0.15} roughness={0.5} envMapIntensity={0.6} transparent opacity={opacity} />
            </RoundedBox>
          )}
          {/* Black module shell — outer = RealPartSpec bbox */}
          <RoundedBox args={[w * 0.96, h * 0.9, d * 0.75]} radius={d * 0.1} smoothness={4} castShadow>
            <meshPhysicalMaterial color="#0c0c10" metalness={0.35} roughness={0.4} clearcoat={0.12} envMapIntensity={0.75} transparent opacity={opacity} />
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Glass screen — live SSD1306 pixels as emissiveMap (bloom lifts the digits) */}
          <mesh position={[0, h * 0.04, d * 0.38]}>
            <planeGeometry args={[screenW, screenH]} />
            <meshPhysicalMaterial
              color="#030806"
              metalness={0.08}
              roughness={0.04}
              clearcoat={1}
              clearcoatRoughness={0.015}
              emissive={oledScreenTex ? "#ffffff" : "#0a3d28"}
              emissiveMap={oledScreenTex || undefined}
              emissiveIntensity={oledScreenTex ? 2.4 : 0.55}
              envMapIntensity={1.7}
              transparent
              opacity={opacity}
            />
          </mesh>
          {/* Console wakes: the live screen pools cool light onto the brass + board */}
          {oledScreenTex && (
            <pointLight
              position={[0, h * 0.04, d * 1.4]}
              color="#a9e8ff"
              intensity={1.3 * opacity}
              distance={Math.max(w, h) * 3}
              decay={2}
            />
          )}
          {/* 4-pin OLED header — locals from sat-pins (same as harness) */}
          {showPcb &&
            pinStubsForNode(node).map((pin) => (
              <PinStub
                key={pin.name}
                position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
                scale={s}
                opacity={opacity}
                netColor={pin.netColor}
              />
            ))}
        </group>
      );
      break;
    }

    case "solar_module":
    case "solar_panel": {
      const w = (p.width || 48) * s;
      const h = (p.height || 36) * s;
      // Real thin laminate — not a thick white slab
      const d = Math.max((p.depth || 2.4) * s, s * 1.8);
      const frameT = Math.min(d * 0.9, s * 1.2);
      const solarMap = getProceduralMap("solar_cells");
      const solarRough = getProceduralMap("solar_roughness");
      inner = (
        <group onClick={onClick}>
          {/* Dark anodized frame — matte enough that its backside doesn't
              blow out into a chrome mirror of the studio HDRI. */}
          <RoundedBox args={[w, h, d]} radius={d * 0.2} smoothness={3} castShadow>
            <meshPhysicalMaterial
              color="#3d4654"
              metalness={0.55}
              roughness={0.42}
              envMapIntensity={0.5}
              transparent
              opacity={opacity}
            />
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Monocrystalline laminate — one baked plane reads as real cells at
              any distance; moderate roughness + low env keep it deep blue,
              not a chrome mirror of the studio HDRI. */}
          <mesh position={[0, 0, d * 0.42]} castShadow>
            <planeGeometry args={[w - frameT * 2.0, h - frameT * 2.0]} />
            <meshPhysicalMaterial
              map={solarMap}
              roughnessMap={solarRough}
              roughness={0.55}
              metalness={0.3}
              clearcoat={0.45}
              clearcoatRoughness={0.28}
              envMapIntensity={0.35}
              transparent
              opacity={opacity}
            />
          </mesh>
          {/* PV lead pads — same local mm as sat-pins / harness */}
          {pinStubsForNode(node).map((pin) => (
            <PinStub
              key={pin.name}
              position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
              scale={s}
              opacity={opacity}
              netColor={pin.netColor}
            />
          ))}
        </group>
      );
      break;
    }

    case "brass_frame":
    case "wire_frame": {
      const w = (p.width || 70) * s;
      const h = (p.height || 48) * s;
      const d = (p.depth || 5) * s;
      const t = (p.bar || 2.2) * s;
      const r = t * 0.35;
      const bar = (px: number, py: number, sx: number, sy: number) => (
        <RoundedBox position={[px, py, 0]} args={[sx, sy, d]} radius={r} smoothness={3} castShadow>
          {phys("brass_frame")}
        </RoundedBox>
      );
      inner = (
        <group onClick={onClick}>
          {bar(0, h / 2 - t / 2, w, t)}
          {bar(0, -h / 2 + t / 2, w, t)}
          {bar(-w / 2 + t / 2, 0, t, h - t * 1.5)}
          {bar(w / 2 - t / 2, 0, t, h - t * 1.5)}
          <SelectOutline selected={selected} />
        </group>
      );
      break;
    }

    case "pcb_module":
    case "board": {
      const catalog = node.catalogId || "";
      const isEsp = catalog === "esp32_c3" || node.id === "brain";
      const isTp = catalog === "tp4056" || node.id === "charger";
      const isSensor = node.id === "sensor";
      // Defaults match RealPartSpec (SuperMini / TP4056), not illustration 32×22
      const w = (p.width || (isEsp ? 22.5 : isTp ? 25 : 16)) * s;
      const h = (p.height || (isEsp ? 18 : isTp ? 19 : 16)) * s;
      const d = (p.depth || (isEsp ? 3.2 : 3.5)) * s;
      const chips = Math.min(4, Math.max(1, Math.round(p.chips || (isEsp ? 3 : 1))));
      // USB-C on SuperMini short edge (Y-); TP4056 micro-USB on short edge
      const usbOnShortEdge = isEsp || isTp;
      inner = (
        <group onClick={onClick}>
          {/* FR4 substrate — outer bound = geom params = RealPartSpec bbox */}
          <RoundedBox args={[w, h, d]} radius={d * 0.1} smoothness={3} castShadow>
            <meshPhysicalMaterial
              color={isEsp || isTp || isSensor ? "#0f3d24" : "#14532d"}
              metalness={0.08}
              roughness={0.55}
              envMapIntensity={0.7}
              transparent
              opacity={opacity}
            />
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Brown FR4 edge (core) */}
          <mesh>
            <boxGeometry args={[w * 1.01, h * 1.01, d * 0.55]} />
            <meshPhysicalMaterial
              color="#5c4030"
              metalness={0.05}
              roughness={0.75}
              transparent
              opacity={0.9 * opacity}
            />
          </mesh>
          {/* Silkscreen top — printed label, pin-1 dot, pads (canvas albedo) */}
          <mesh position={[0, 0, d * 0.52]}>
            <planeGeometry args={[w * 0.92, h * 0.92]} />
            <meshPhysicalMaterial
              color="#ffffff"
              map={makeSilkscreenMap(
                isEsp ? "ESP32-C3" : isTp ? "TP4056" : node.label || node.ref || "PCB"
              )}
              metalness={0.04}
              roughness={0.68}
              roughnessMap={getProceduralMap("fr4_roughness")}
              transparent
              opacity={0.92 * opacity}
            />
          </mesh>
          {/* Faint copper pour suggestion */}
          <mesh position={[0, 0, d * 0.54]}>
            <planeGeometry args={[w * 0.55, h * 0.35]} />
            <meshPhysicalMaterial
              color="#8b5a2b"
              metalness={0.75}
              roughness={0.35}
              transparent
              opacity={0.22 * opacity}
            />
          </mesh>
          {/* USB-C / micro-USB on short edge (real SuperMini / TP4056) */}
          {usbOnShortEdge && (
            <>
              <mesh position={[0, -h / 2 + s * 0.4, d * 0.15]}>
                <boxGeometry args={[isEsp ? s * 9 : s * 7.5, s * 2.6, d * 0.7]} />
                <meshPhysicalMaterial color="#e2e8f0" metalness={0.85} roughness={0.2} transparent opacity={opacity} />
              </mesh>
              <mesh position={[0, -h / 2 + s * 0.25, d * 0.22]}>
                <boxGeometry args={[isEsp ? s * 7.2 : s * 5.5, s * 1.4, d * 0.35]} />
                <meshPhysicalMaterial color="#0f172a" metalness={0.3} roughness={0.5} transparent opacity={opacity} />
              </mesh>
            </>
          )}
          {Array.from({ length: chips }).map((_, i) => (
            <mesh key={i} position={[-w * 0.18 + i * w * 0.18, h * 0.05, d * 0.58]}>
              <boxGeometry args={[w * 0.14, h * 0.18, d * 0.45]} />
              <meshPhysicalMaterial color="#0f172a" metalness={0.35} roughness={0.4} transparent opacity={opacity} />
            </mesh>
          ))}
          {/* SuperMini antenna meander (mesh only — no DOM Html labels) */}
          {isEsp && (
            <mesh position={[w * 0.32, h * 0.28, d * 0.55]}>
              <boxGeometry args={[w * 0.14, h * 0.22, d * 0.12]} />
              <meshPhysicalMaterial color="#f8fafc" metalness={0.5} roughness={0.3} transparent opacity={opacity} />
            </mesh>
          )}
          {/* Charge LED pair for TP4056 */}
          {isTp && (
            <>
              <mesh position={[w * 0.28, h * 0.22, d * 0.65]}>
                <sphereGeometry args={[d * 0.35, 10, 10]} />
                <meshPhysicalMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1.8} transparent opacity={opacity} />
              </mesh>
              <mesh position={[w * 0.28, -h * 0.08, d * 0.65]}>
                <sphereGeometry args={[d * 0.35, 10, 10]} />
                <meshPhysicalMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={1.6} transparent opacity={opacity} />
              </mesh>
              {/* Console wakes: charge LEDs pool red/green onto the nearby brass */}
              <pointLight position={[w * 0.28, h * 0.22, d * 1.3]} color="#ff5a5a" intensity={0.7 * opacity} distance={w * 2.4} decay={2} />
              <pointLight position={[w * 0.28, -h * 0.08, d * 1.3]} color="#5aff8c" intensity={0.6 * opacity} distance={w * 2.4} decay={2} />
            </>
          )}
          {!isTp && !isEsp && (
            <>
              <mesh position={[w * 0.28, h * 0.22, d * 0.65]}>
                <sphereGeometry args={[d * 0.32, 12, 12]} />
                <meshPhysicalMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.7} transparent opacity={opacity} />
              </mesh>
              <pointLight position={[w * 0.28, h * 0.22, d * 1.3]} color="#ffcc66" intensity={0.6 * opacity} distance={w * 2} decay={2} />
            </>
          )}
          {/* Named pin pads — works for ANY part, not just the sat roles.
              sat ids → exact SAT_PIN_LOCALS; catalog-matched parts → archetype
              pins; unknown board → derived header. (Replaces the old
              isEsp/isTp/isSensor gate + 6 unlabeled dummy pads.) */}
          {pinStubsForNode(node).map((pin) => (
            <PinStub
              key={pin.name}
              position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
              scale={s}
              opacity={opacity}
              netColor={pin.netColor}
            />
          ))}
        </group>
      );
      break;
    }

    case "tube": {
      const rad = (p.radius || 2) * s;
      const ht = (p.height || 40) * s;
      inner = (
        <mesh onClick={onClick} castShadow>
          <cylinderGeometry args={[rad, rad, ht, Math.max(16, Math.floor(segments / 2))]} />
          {phys()}
          <SelectOutline selected={selected} />
        </mesh>
      );
      break;
    }

    case "cell_16340": {
      const rad = (p.radius || 8) * s;
      const ht = (p.height || 34) * s;
      // Terminals at sat-pins battery ±Y so harness tubes hit visible ends
      const plusL = pinLocal(node.id === "battery" ? "battery" : "", "+") || [0, ht * 0.48 / s, 0];
      const minusL = pinLocal(node.id === "battery" ? "battery" : "", "-") || [0, -ht * 0.46 / s, 0];
      const plusY = plusL[1] * s;
      const minusY = minusL[1] * s;
      inner = (
        <group onClick={onClick}>
          <mesh castShadow>
            <cylinderGeometry args={[rad, rad, ht * 0.88, segments]} />
            {phys()}
            <SelectOutline selected={selected} />
          </mesh>
          {/* + terminal cap at shared pin local */}
          <mesh position={[0, plusY * 0.92, 0]}>
            <cylinderGeometry args={[rad * 0.55, rad * 0.55, ht * 0.08, 16]} />
            <meshPhysicalMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} transparent opacity={opacity} />
          </mesh>
          {/* − end cap */}
          <mesh position={[0, minusY * 0.92, 0]}>
            <cylinderGeometry args={[rad * 0.95, rad * 0.95, ht * 0.06, 16]} />
            <meshPhysicalMaterial color="#0f172a" metalness={0.5} roughness={0.4} transparent opacity={opacity} />
          </mesh>
          {/* wrap label band */}
          <mesh>
            <cylinderGeometry args={[rad * 1.01, rad * 1.01, ht * 0.35, segments, 1, true]} />
            <meshPhysicalMaterial color="#1e293b" metalness={0.15} roughness={0.55} side={DoubleSide} transparent opacity={0.95 * opacity} />
          </mesh>
          {/* thin brass ring detail */}
          <mesh position={[0, ht * 0.12, 0]}>
            <torusGeometry args={[rad * 1.02, rad * 0.06, 8, 24]} />
            <meshPhysicalMaterial color="#c9a227" metalness={0.9} roughness={0.25} transparent opacity={opacity} />
          </mesh>
          {/* Lead nubs = harness pin landings (sat-pins locals) */}
          <mesh position={[0, plusY, 0]}>
            <sphereGeometry args={[rad * 0.22, 10, 10]} />
            <meshPhysicalMaterial color="#dc2626" metalness={0.3} roughness={0.4} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, minusY, 0]}>
            <sphereGeometry args={[rad * 0.2, 10, 10]} />
            <meshPhysicalMaterial color="#1e293b" metalness={0.3} roughness={0.4} transparent opacity={opacity} />
          </mesh>
        </group>
      );
      break;
    }

    case "touch_pad": {
      const rad = (p.radius || 7) * s;
      const ht = (p.height || 3) * s;
      inner = (
        <group onClick={onClick}>
          <mesh castShadow>
            <cylinderGeometry args={[rad, rad, ht, segments]} />
            {phys()}
            <SelectOutline selected={selected} />
          </mesh>
          <mesh position={[0, ht * 0.55, 0]}>
            <cylinderGeometry args={[rad * 0.55, rad * 0.55, ht * 0.35, 24]} />
            <meshPhysicalMaterial
              color="#c4b5fd"
              metalness={0.1}
              roughness={0.35}
              clearcoat={0.6}
              emissive="#7c3aed"
              emissiveIntensity={0.25}
              transparent
              opacity={opacity}
            />
          </mesh>
          {pinStubsForNode(node).map((pin) => (
            <PinStub
              key={pin.name}
              position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
              scale={s}
              opacity={opacity}
              netColor={pin.netColor}
            />
          ))}
        </group>
      );
      break;
    }

    case "disk": {
      const rad = (p.radius || 50) * s;
      const ht = (p.height || 8) * s;
      // Legacy disk often had X rotation — if rotation includes -PI/2 on X, parent handles it
      inner = (
        <mesh onClick={onClick} castShadow receiveShadow>
          <cylinderGeometry args={[rad, rad, ht, segments]} />
          {phys()}
          <SelectOutline selected={selected} />
        </mesh>
      );
      break;
    }

    case "box":
    default: {
      const w = (p.width || 20) * s;
      const h = (p.height || 15) * s;
      const d = (p.depth || 3) * s;
      inner = (
        <group onClick={onClick}>
          <RoundedBox
            args={[w, h, d]}
            radius={Math.min(0.004, Math.max(w, 0.01) * 0.08)}
            smoothness={4}
            castShadow
          >
            {phys()}
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Generic parts (e.g. a sensor head) still show where wires land. */}
          {pinStubsForNode(node).map((pin) => (
            <PinStub
              key={pin.name}
              position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
              scale={s}
              opacity={opacity}
              netColor={pin.netColor}
            />
          ))}
        </group>
      );
      break;
    }
  }

  // Inspect LOD silkscreen pin names when JARVIS-isolated
  const inspectLabels =
    isolated &&
    pinStubsForNode(node).map((pin) => (
      <Html
        key={`pin-${pin.name}`}
        position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s + 0.04]}
        center
        distanceFactor={2.4}
        style={{ pointerEvents: "none" }}
      >
        <div className="px-1 py-0.5 rounded bg-black/80 text-[9px] text-cyan-100/95 border border-cyan-400/30 whitespace-nowrap font-mono">
          {pin.name}
        </div>
      </Html>
    ));

  /**
   * Prefer parametric life-mm meshes. GLB only when assetUrl is set (glbReady)
   * and loads cleanly — never Suspense-fallback to full parametric (avoids double draw).
   * Pin stubs: parametric meshes already include them; overlay only for GLB path.
   */
  const body = node.assetUrl ? (
    <GlbErrorBoundary fallback={inner}>
      <Suspense fallback={null}>
        <CatalogGlbUnderlay
          url={node.assetUrl}
          rootScale={rootScale}
          opacity={opacity}
          catalogId={node.catalogId}
        />
      </Suspense>
    </GlbErrorBoundary>
  ) : (
    inner
  );

  return (
    <SmoothRoot
      position={pos}
      rotation={node.rotation as [number, number, number]}
      meshRef={meshRef}
    >
      <group onClick={onClick} onDoubleClick={onDoubleClick}>
        {body}
        {node.assetUrl &&
          pinStubsForNode(node).map((pin) => (
            <PinStub
              key={`overlay-${pin.name}`}
              position={[pin.local[0] * s, pin.local[1] * s, pin.local[2] * s]}
              scale={s}
              opacity={opacity}
              netColor={pin.netColor}
            />
          ))}
        {inspectLabels}
        {/* Label only while isolated/selected — distanceFactor keeps it on-screen, not mesh-sized junk */}
        {(selected || isolated) && (
          <Html position={[0, 0.12, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
            <div className="px-2 py-0.5 rounded-md bg-black/85 text-cyan-50 text-[10px] font-medium whitespace-nowrap border border-cyan-400/40 shadow-lg">
              {node.ref ? `${node.ref} · ${node.label}` : node.label}
              {isolated ? " · inspect" : ""}
            </div>
          </Html>
        )}
      </group>
    </SmoothRoot>
  );
}

export const SelectableNode = forwardRef<
  Object3D,
  {
    node: SceneNode3D;
    view: LayerViewState;
    rootScale: number;
    onSelect: (id: string) => void;
    segments?: number;
  }
>(function SelectableNode({ node, view, rootScale, onSelect, segments }, ref) {
  return (
    <NodeMesh
      node={node}
      view={view}
      rootScale={rootScale}
      onSelect={onSelect}
      meshRef={ref}
      suppressExplode
      segments={segments}
    />
  );
});
