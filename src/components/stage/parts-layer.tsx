"use client";

/**
 * PartsLayer — renders every scene node: authored GLB when the open registry
 * has one ready, parametric fallback otherwise. No node-id special cases.
 *
 * GLB preloading happens at module load (this module only loads inside the
 * dynamic ssr:false Stage chunk), so by the time the Canvas paints, part models
 * are already in the loader cache — no pop-in.
 */
import { Component, Suspense, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, MathUtils, Vector3, type Material, type Mesh } from "three";
import type { SceneNode3D } from "@/lib/product-3d";
import { readyCatalogAssetPaths } from "@/lib/product-3d";
import { partModelFor, unitToMm } from "@/lib/product-3d/part-models";
import { BasicPart } from "./part-fallback/basic";
import { useInvalidateOnCommit } from "./stage-invalidate";

// Warm the loader cache as soon as the Stage chunk arrives.
if (typeof window !== "undefined") {
  for (const url of readyCatalogAssetPaths()) useGLTF.preload(url);
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
    return c;
  }, [scene, opacity, model]);
  return (
    <group scale={unitToMm(model?.unit)}>
      <primitive object={clone} />
    </group>
  );
}

/** Selection cue that works identically for GLBs and fallbacks: a soft puck. */
function SelectionPuck({ radiusMm }: { radiusMm: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radiusMm * 0.02, 0]}>
      <ringGeometry args={[radiusMm * 1.05, radiusMm * 1.22, 40]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} depthWrite={false} />
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
  const body = node.assetUrl ? (
    <GlbBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <GlbPart url={node.assetUrl} catalogId={node.catalogId} opacity={opacity} />
      </Suspense>
    </GlbBoundary>
  ) : (
    fallback
  );
  return (
    <group
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
      {selected && <SelectionPuck radiusMm={roughRadiusMm(node)} />}
    </group>
  );
}

export function PartsLayer({
  nodes,
  rootScale,
  selectedId,
  onSelect,
}: {
  nodes: SceneNode3D[];
  rootScale: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <group>
      {nodes.map((n) => (
        <PartMesh
          key={n.id}
          node={n}
          rootScale={rootScale}
          selected={selectedId === n.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
