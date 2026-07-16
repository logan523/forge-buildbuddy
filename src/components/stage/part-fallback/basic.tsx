"use client";

/**
 * Parametric part fallback — every GeomKind renders recognizably with NO
 * hard-coded node ids. Any project's part that lacks an authored GLB lands
 * here and still reads as the right kind of object at real mm.
 *
 * S0 scope: clean silhouettes + correct materials (the authored GLB library
 * carries the recognizable detail for known parts). The richer sat-era detail
 * (silkscreen text, per-board connectors) returns in later slices strictly
 * derived from catalogId + real-parts data.
 */
import { useEffect, useMemo } from "react";
import type { SceneNode3D } from "@/lib/product-3d";
import {
  resolvePhysicalMaterial,
  wireCubeRods,
  getProceduralMap,
} from "@/lib/product-3d";
import { drawOledScreen, makeOledScreenMap } from "@/lib/product-3d/procedural-maps";
import { invalidateStage } from "../stage-invalidate";

function Mat({
  node,
  opacity,
}: {
  node: SceneNode3D;
  opacity: number;
}) {
  const props = resolvePhysicalMaterial(node.geom.kind, node.material, node.id, opacity);
  return <meshPhysicalMaterial {...props} />;
}

/** Live OLED screen plane — clock for the display module, ticking the demand loop.
 *  Exported: the GLB path overlays the same screen on the authored model. */
export function OledScreen({
  w,
  h,
  z,
  live,
}: {
  w: number;
  h: number;
  z: number;
  live: boolean;
}) {
  const tex = useMemo(
    () => makeOledScreenMap(live ? "clock" : "readout"),
    [live]
  );
  useEffect(() => {
    if (!live) return;
    const redraw = () => {
      drawOledScreen(tex, { mode: "clock" });
      invalidateStage();
    };
    redraw();
    const t = setInterval(redraw, 30_000);
    return () => clearInterval(t);
  }, [tex, live]);
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[w, h]} />
      <meshPhysicalMaterial
        color="#030806"
        roughness={0.05}
        clearcoat={1}
        clearcoatRoughness={0.02}
        emissive="#ffffff"
        emissiveMap={tex}
        emissiveIntensity={2.2}
      />
    </mesh>
  );
}

/**
 * Basic parametric body for a node, in part-local mm (parent applies
 * position/rotation/rootScale). Cases keep real-mm proportions from params.
 */
export function BasicPart({
  node,
  opacity = 1,
}: {
  node: SceneNode3D;
  opacity?: number;
}) {
  const p = node.geom.params;
  switch (node.geom.kind) {
    case "wire_cube_cage": {
      const rods = wireCubeRods(p.size || 60);
      const rodR = p.rodR || 2;
      return (
        <group>
          {rods.map((rod, i) => (
            <mesh key={i} position={rod.mid} rotation={rod.euler} castShadow>
              <cylinderGeometry args={[rodR, rodR, rod.length, 16]} />
              <Mat node={node} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );
    }
    case "metal_stand": {
      const h = p.height || 90;
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[p.stemR || 2.2, p.stemR || 2.2, h, 20]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <mesh position={[0, (p.footH || 3.5) / 2, 0]} castShadow>
            <cylinderGeometry args={[p.footR || 18, (p.footR || 18) * 1.04, p.footH || 3.5, 32]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
        </group>
      );
    }
    case "face_panel":
    case "rear_panel": {
      // Panel with a visible window: four border slabs around the cutout
      // (a real hole, not a decal — the display shows through it).
      const w = p.width || 40;
      const h = p.height || 40;
      const d = p.depth || 2;
      const cw = Math.min(p.cutoutW || w * 0.55, w - 6);
      const ch = Math.min(p.cutoutH || h * 0.55, h - 6);
      const sideW = (w - cw) / 2;
      const topH = (h - ch) / 2;
      return (
        <group>
          <mesh position={[-(cw + sideW) / 2, 0, 0]} castShadow>
            <boxGeometry args={[sideW, h, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <mesh position={[(cw + sideW) / 2, 0, 0]} castShadow>
            <boxGeometry args={[sideW, h, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <mesh position={[0, (ch + topH) / 2, 0]} castShadow>
            <boxGeometry args={[cw, topH, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <mesh position={[0, -(ch + topH) / 2, 0]} castShadow>
            <boxGeometry args={[cw, topH, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
        </group>
      );
    }
    case "oled_module": {
      const w = p.width || 27;
      const h = p.height || 27;
      const d = p.depth || 4;
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <OledScreen
            w={w * 0.8}
            h={h * 0.42}
            z={d / 2 + 0.05}
            live={node.catalogId === "oled_096"}
          />
        </group>
      );
    }
    case "oled_panel": {
      const w = p.width || 25;
      const h = p.height || 14;
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, p.depth || 2]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <OledScreen w={w * 0.86} h={h * 0.7} z={(p.depth || 2) / 2 + 0.05} live={false} />
        </group>
      );
    }
    case "solar_module":
    case "solar_panel": {
      const w = p.width || 60;
      const h = p.height || 45;
      const d = p.depth || 3;
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          <mesh position={[0, 0, d / 2 + 0.03]}>
            <planeGeometry args={[w * 0.94, h * 0.92]} />
            <meshPhysicalMaterial
              map={getProceduralMap("solar_cells")}
              roughnessMap={getProceduralMap("solar_roughness")}
              roughness={0.35}
              metalness={0.15}
              transparent={opacity < 0.99}
              opacity={opacity}
            />
          </mesh>
        </group>
      );
    }
    case "cell_16340":
    case "cylinder": {
      const r = p.radius || 8;
      const h = p.height || 34;
      return (
        <group>
          <mesh castShadow>
            <cylinderGeometry args={[r, r, h, 28]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          {/* + terminal nub */}
          <mesh position={[0, h / 2 + 0.6, 0]}>
            <cylinderGeometry args={[r * 0.35, r * 0.35, 1.2, 16]} />
            <meshPhysicalMaterial color="#d8dde2" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      );
    }
    case "battery_straps": {
      const size = p.size || 40;
      const rodR = p.rodR || 1;
      return (
        <group>
          {[-size * 0.3, size * 0.3].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[size * 0.28, rodR, 10, 32]} />
              <Mat node={node} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );
    }
    case "touch_pad": {
      return (
        <mesh castShadow>
          <cylinderGeometry args={[p.radius || 8, p.radius || 8, p.height || 3, 28]} />
          <Mat node={node} opacity={opacity} />
        </mesh>
      );
    }
    case "tube": {
      return (
        <mesh castShadow>
          <cylinderGeometry args={[p.radius || 2, p.radius || 2, p.height || 40, 16]} />
          <Mat node={node} opacity={opacity} />
        </mesh>
      );
    }
    case "disk":
    case "bamboo_base": {
      return (
        <mesh castShadow>
          <cylinderGeometry args={[p.radius || 25, p.radius || 25, p.height || 6, 40]} />
          <Mat node={node} opacity={opacity} />
        </mesh>
      );
    }
    case "pcb_module":
    case "board": {
      const w = p.width || 25;
      const h = p.height || 18;
      const d = p.depth || 2.5;
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <Mat node={node} opacity={opacity} />
          </mesh>
          {/* one chip so a bare board still reads as electronics */}
          <mesh position={[0, 0, d / 2 + 0.5]} castShadow>
            <boxGeometry args={[Math.min(6, w * 0.3), Math.min(6, h * 0.3), 1]} />
            <meshPhysicalMaterial color="#0b0c0f" roughness={0.4} transparent={opacity < 0.99} opacity={opacity} />
          </mesh>
        </group>
      );
    }
    case "wire_frame":
    case "brass_frame":
    case "shell_panel":
    case "box":
    default: {
      return (
        <mesh castShadow>
          <boxGeometry args={[p.width || 20, p.height || 20, p.depth || 20]} />
          <Mat node={node} opacity={opacity} />
        </mesh>
      );
    }
  }
}
