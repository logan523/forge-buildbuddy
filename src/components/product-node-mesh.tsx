"use client";

/**
 * High-fidelity parametric part meshes — composite geometry + MeshPhysicalMaterial.
 */
import { forwardRef } from "react";
import { Html, RoundedBox, Outlines } from "@react-three/drei";
import { DoubleSide, type Object3D } from "three";
import {
  computeNodeWorldPosition,
  nodeOpacity,
  nodeVisible,
  type SceneNode3D,
  type LayerViewState,
} from "@/lib/product-3d";
import { resolvePhysicalMaterial } from "@/lib/product-3d/materials";

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
      transparent={m.transparent}
      opacity={m.opacity}
    />
  );
}

function SelectOutline({ selected }: { selected: boolean }) {
  if (!selected) return null;
  return <Outlines thickness={2.5} color="#22d3ee" screenspace opacity={0.9} />;
}

export function NodeMesh({
  node,
  view,
  rootScale,
  onSelect,
  meshRef,
  suppressExplode = false,
  segments = 40,
}: {
  node: SceneNode3D;
  view: LayerViewState;
  rootScale: number;
  onSelect: (id: string) => void;
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
  const s = rootScale;
  const p = node.geom.params;
  const kind = node.geom.kind;

  if (!visible) return null;

  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const phys = (k = kind) => (
    <PhysMat geomKind={k} material={node.material} nodeId={node.id} opacity={opacity} />
  );

  let inner: React.ReactNode = null;

  switch (kind) {
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
      const w = (p.width || 52) * s;
      const h = (p.height || 30) * s;
      const d = (p.depth || 4) * s;
      const bezel = (p.bezel || 2.2) * s;
      inner = (
        <group onClick={onClick}>
          {/* Bezel shell */}
          <RoundedBox args={[w, h, d]} radius={d * 0.15} smoothness={4} castShadow>
            <meshPhysicalMaterial color="#141418" metalness={0.4} roughness={0.4} clearcoat={0.15} envMapIntensity={0.7} transparent opacity={opacity} />
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Glass / active area */}
          <mesh position={[0, 0, d * 0.35]}>
            <planeGeometry args={[w - bezel * 2, h - bezel * 2]} />
            <meshPhysicalMaterial
              color="#061018"
              metalness={0.2}
              roughness={0.08}
              clearcoat={1}
              clearcoatRoughness={0.04}
              emissive="#0e7490"
              emissiveIntensity={0.55}
              envMapIntensity={1.5}
              transparent
              opacity={opacity}
            />
          </mesh>
          {/* Fake time digits glow */}
          <mesh position={[0, 0.002 * s, d * 0.36]}>
            <planeGeometry args={[(w - bezel * 2) * 0.55, (h - bezel * 2) * 0.28]} />
            <meshBasicMaterial color="#67e8f9" transparent opacity={0.55 * opacity} />
          </mesh>
        </group>
      );
      break;
    }

    case "solar_module":
    case "solar_panel": {
      const w = (p.width || 42) * s;
      const h = (p.height || 28) * s;
      const d = (p.depth || 2.5) * s;
      const cells = Math.min(6, Math.max(2, Math.round(p.cells || 4)));
      const cellW = (w * 0.88) / cells;
      const cellH = h * 0.78;
      inner = (
        <group onClick={onClick}>
          <RoundedBox args={[w, h, d]} radius={d * 0.2} smoothness={3} castShadow>
            <meshPhysicalMaterial color="#64748b" metalness={0.85} roughness={0.28} envMapIntensity={1} transparent opacity={opacity} />
            <SelectOutline selected={selected} />
          </RoundedBox>
          <mesh position={[0, 0, d * 0.4]}>
            <planeGeometry args={[w * 0.92, h * 0.88]} />
            <meshPhysicalMaterial
              color="#0a1020"
              metalness={0.6}
              roughness={0.28}
              clearcoat={0.5}
              clearcoatRoughness={0.12}
              envMapIntensity={1.1}
              transparent
              opacity={opacity}
            />
          </mesh>
          {Array.from({ length: cells }).map((_, i) => {
            const x = -w * 0.4 + cellW * 0.5 + i * cellW;
            return (
              <mesh key={i} position={[x, 0, d * 0.42]}>
                <planeGeometry args={[cellW * 0.88, cellH]} />
                <meshPhysicalMaterial
                  color="#111827"
                  metalness={0.5}
                  roughness={0.35}
                  transparent
                  opacity={0.95 * opacity}
                />
              </mesh>
            );
          })}
          {/* Bus bars */}
          {Array.from({ length: cells - 1 }).map((_, i) => {
            const x = -w * 0.4 + cellW * (i + 1);
            return (
              <mesh key={`b${i}`} position={[x, 0, d * 0.43]}>
                <boxGeometry args={[0.0004, cellH * 0.95, 0.0003]} />
                <meshPhysicalMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} transparent opacity={opacity} />
              </mesh>
            );
          })}
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
      const w = (p.width || (isEsp ? 32 : 28)) * s;
      const h = (p.height || (isEsp ? 22 : 18)) * s;
      const d = (p.depth || 2.8) * s;
      const chips = Math.min(4, Math.max(1, Math.round(p.chips || (isEsp ? 3 : 1))));
      inner = (
        <group onClick={onClick}>
          <RoundedBox args={[w, h, d]} radius={d * 0.12} smoothness={3} castShadow>
            {phys("pcb_module")}
            <SelectOutline selected={selected} />
          </RoundedBox>
          {/* Silkscreen edge */}
          <mesh position={[0, 0, d * 0.52]}>
            <planeGeometry args={[w * 0.92, h * 0.92]} />
            <meshPhysicalMaterial color="#166534" metalness={0.05} roughness={0.7} transparent opacity={0.35 * opacity} />
          </mesh>
          {/* USB-C */}
          <mesh position={[0, -h / 2 + 0.0015, d * 0.15]}>
            <boxGeometry args={[w * (isEsp ? 0.32 : 0.26), h * 0.1, d * 0.55]} />
            <meshPhysicalMaterial color="#e2e8f0" metalness={0.75} roughness={0.25} transparent opacity={opacity} />
          </mesh>
          {Array.from({ length: chips }).map((_, i) => (
            <mesh key={i} position={[-w * 0.22 + i * w * 0.2, h * 0.08, d * 0.58]}>
              <boxGeometry args={[w * 0.16, h * 0.2, d * 0.4]} />
              <meshPhysicalMaterial color="#0f172a" metalness={0.35} roughness={0.4} transparent opacity={opacity} />
            </mesh>
          ))}
          {/* Antenna meander for ESP */}
          {isEsp && (
            <mesh position={[w * 0.38, h * 0.32, d * 0.55]}>
              <boxGeometry args={[w * 0.12, h * 0.28, d * 0.15]} />
              <meshPhysicalMaterial color="#f8fafc" metalness={0.5} roughness={0.3} transparent opacity={opacity} />
            </mesh>
          )}
          {/* Charge LED pair for TP4056 */}
          {isTp && (
            <>
              <mesh position={[w * 0.28, h * 0.25, d * 0.65]}>
                <sphereGeometry args={[d * 0.28, 10, 10]} />
                <meshPhysicalMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.9} transparent opacity={opacity} />
              </mesh>
              <mesh position={[w * 0.28, -h * 0.1, d * 0.65]}>
                <sphereGeometry args={[d * 0.28, 10, 10]} />
                <meshPhysicalMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.7} transparent opacity={opacity} />
              </mesh>
            </>
          )}
          {!isTp && (
            <mesh position={[w * 0.32, h * 0.28, d * 0.65]}>
              <sphereGeometry args={[d * 0.32, 12, 12]} />
              <meshPhysicalMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.85} transparent opacity={opacity} />
            </mesh>
          )}
          {/* Header pins row */}
          {Array.from({ length: 6 }).map((_, i) => (
            <mesh key={`p${i}`} position={[-w * 0.35 + i * w * 0.12, -h * 0.35, -d * 0.4]}>
              <boxGeometry args={[d * 0.25, d * 0.25, d * 0.9]} />
              <meshPhysicalMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} transparent opacity={opacity} />
            </mesh>
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
      inner = (
        <group onClick={onClick}>
          <mesh castShadow>
            <cylinderGeometry args={[rad, rad, ht * 0.88, segments]} />
            {phys()}
            <SelectOutline selected={selected} />
          </mesh>
          {/* + terminal */}
          <mesh position={[0, ht * 0.48, 0]}>
            <cylinderGeometry args={[rad * 0.55, rad * 0.55, ht * 0.08, 16]} />
            <meshPhysicalMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} transparent opacity={opacity} />
          </mesh>
          {/* − end */}
          <mesh position={[0, -ht * 0.46, 0]}>
            <cylinderGeometry args={[rad * 0.95, rad * 0.95, ht * 0.06, 16]} />
            <meshPhysicalMaterial color="#0f172a" metalness={0.5} roughness={0.4} transparent opacity={opacity} />
          </mesh>
          {/* wrap label band */}
          <mesh>
            <cylinderGeometry args={[rad * 1.01, rad * 1.01, ht * 0.35, segments, 1, true]} />
            <meshPhysicalMaterial color="#334155" metalness={0.2} roughness={0.6} side={DoubleSide} transparent opacity={0.9 * opacity} />
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
        <RoundedBox
          onClick={onClick}
          args={[w, h, d]}
          radius={Math.min(0.004, Math.max(w, 0.01) * 0.08)}
          smoothness={4}
          castShadow
        >
          {phys()}
          <SelectOutline selected={selected} />
        </RoundedBox>
      );
      break;
    }
  }

  return (
    <group
      ref={meshRef}
      position={pos}
      rotation={node.rotation as [number, number, number]}
    >
      {inner}
      {selected && (
        <Html position={[0, 0.14, 0]} center distanceFactor={4}>
          <div className="px-2 py-0.5 rounded-md bg-black/80 text-cyan-100 text-[10px] whitespace-nowrap pointer-events-none border border-cyan-500/30 shadow-lg">
            {node.ref ? `${node.ref} · ${node.label}` : node.label}
          </div>
        </Html>
      )}
    </group>
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
