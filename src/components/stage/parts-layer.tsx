"use client";

/**
 * PartsLayer — renders every scene node: authored GLB when the open registry
 * has one ready, parametric fallback otherwise. No node-id special cases.
 *
 * GLB preloading happens at module load (this module only loads inside the
 * dynamic ssr:false Stage chunk), so by the time the Canvas paints, part models
 * are already in the loader cache — no pop-in.
 */
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import {
  Box3,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Vector3,
  type Group,
  type Material,
  type Mesh,
} from "three";
import type { SceneNode3D } from "@/lib/product-3d";
import { readyCatalogAssetPaths } from "@/lib/product-3d";
import { partModelFor, unitToMm } from "@/lib/product-3d/part-models";
import { pinStubsForNode } from "@/lib/product-3d";
import { partDetailFor } from "@/lib/stage/part-detail";
import { BasicPart, OledScreen } from "./part-fallback/basic";
import { PinStub } from "./pin-stub";
import { useInvalidateOnCommit } from "./stage-invalidate";

// Warm the loader cache as soon as the Stage chunk arrives.
if (typeof window !== "undefined") {
  for (const url of readyCatalogAssetPaths()) useGLTF.preload(url);
}

/** Ink color for feature edges — the --color-text token (DESIGN.md). */
const EDGE_INK = "#1a2744";
/** CAD feature-edge threshold: boxes/caps read as outlines, cylinder/sphere
 *  faceting stays quiet (their face angles sit below this). */
const EDGE_THRESHOLD_DEG = 40;

/**
 * CAD-style line work: attach/update EdgesGeometry LineSegments on every mesh
 * under `root`, ink-colored, matching the part's current opacity. Idempotent —
 * a second call just re-tunes the existing line material (isolation ghosting).
 */
export function syncEdgeLines(root: Group, opacity: number): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let line = mesh.userData.__edgeLine as LineSegments | undefined;
    if (!line) {
      line = new LineSegments(
        new EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEG),
        new LineBasicMaterial({ color: EDGE_INK })
      );
      // Edge lines must never intercept part/wire taps.
      line.raycast = () => {};
      mesh.add(line);
      mesh.userData.__edgeLine = line;
    }
    const mat = line.material as LineBasicMaterial;
    mat.transparent = opacity < 0.99;
    mat.opacity = opacity;
  });
}

/** GLB failure → parametric fallback, never a crash or a hole. */
class GlbBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Authored/sourced model, normalized (unit → mm, rotation, recenter). */
function GlbPart({
  url,
  catalogId,
  opacity,
}: {
  url: string;
  catalogId?: string;
  opacity: number;
}) {
  const { scene } = useGLTF(url);
  const model = partModelFor(catalogId);
  // A GLB that resolves late (own Suspense boundary) must request its frame.
  useInvalidateOnCommit();
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        const nm = (m as Material).clone() as Material & {
          opacity: number;
          transparent: boolean;
          depthWrite: boolean;
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
    if (model?.rotationDeg) {
      c.rotation.set(
        MathUtils.degToRad(model.rotationDeg[0]),
        MathUtils.degToRad(model.rotationDeg[1]),
        MathUtils.degToRad(model.rotationDeg[2])
      );
    }
    if (model?.centerToBbox) {
      c.updateMatrixWorld(true);
      const center = new Box3().setFromObject(c).getCenter(new Vector3());
      c.position.sub(center);
    }
    // CAD line work rides the authored model, inherited per-mesh transforms.
    syncEdgeLines(c as unknown as Group, opacity);
    return c;
  }, [scene, opacity, model]);
  return (
    <group scale={unitToMm(model?.unit)}>
      <primitive object={clone} />
    </group>
  );
}

/** Selection cue that works identically for GLBs and fallbacks: a flat puck
 *  in the accent token — outline emphasis, no glow. */
function SelectionPuck({ radiusMm }: { radiusMm: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radiusMm * 0.02, 0]}>
      <ringGeometry args={[radiusMm * 1.05, radiusMm * 1.22, 40]} />
      <meshBasicMaterial color="#0e7490" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function roughRadiusMm(node: SceneNode3D): number {
  const p = node.geom.params;
  return Math.max(p.radius || 0, (p.width || 0) / 2, (p.height || 0) / 2, (p.size || 0) / 2, 10);
}

export function PartMesh({
  node,
  rootScale,
  opacity = 1,
  selected = false,
  onSelect,
}: {
  node: SceneNode3D;
  rootScale: number;
  opacity?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const fallback = <BasicPart node={node} opacity={opacity} />;
  const detail = partDetailFor(node.catalogId);
  // Parametric fallbacks mount synchronously, so their CAD edge lines can be
  // attached right after commit. The GLB path carries its own (GlbPart clone).
  const groupRef = useRef<Group>(null);
  useEffect(() => {
    if (node.assetUrl) return;
    if (groupRef.current) syncEdgeLines(groupRef.current, opacity);
  }, [node.assetUrl, node.id, opacity]);
  const body = node.assetUrl ? (
    <GlbBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <GlbPart url={node.assetUrl} catalogId={node.catalogId} opacity={opacity} />
        {/* Dynamic detail rides ON TOP of the static authored model: the live
            SSD1306 clock draws at the oled glass front (see author-oled096). */}
        {detail?.liveScreen && (
          <group position={[0, 3, 0]}>
            <OledScreen w={21.7} h={11} z={2.1} live={detail.liveScreen === "clock"} />
          </group>
        )}
      </Suspense>
    </GlbBoundary>
  ) : (
    fallback
  );
  // Pin hardware only on the focused part (assembled overview stays clean).
  const showPins = selected;
  return (
    <group
      ref={groupRef}
      position={[
        node.position[0] * rootScale,
        node.position[1] * rootScale,
        node.position[2] * rootScale,
      ]}
      rotation={node.rotation}
      scale={rootScale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
    >
      {body}
      {showPins &&
        pinStubsForNode(node).map((pin) => (
          <PinStub
            key={pin.name}
            position={pin.local}
            scale={1}
            opacity={opacity}
            netColor={pin.netColor}
          />
        ))}
      {selected && <SelectionPuck radiusMm={roughRadiusMm(node)} />}
    </group>
  );
}

export function PartsLayer({
  nodes,
  rootScale,
  selectedId,
  isolatedId,
  onSelect,
}: {
  nodes: SceneNode3D[];
  rootScale: number;
  selectedId?: string | null;
  /** JARVIS inspect: this part solid, peers ghosted. */
  isolatedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <group>
      {nodes.map((n) => (
        <PartMesh
          key={n.id}
          node={n}
          rootScale={rootScale}
          opacity={isolatedId ? (isolatedId === n.id ? 1 : 0.14) : 1}
          selected={selectedId === n.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
