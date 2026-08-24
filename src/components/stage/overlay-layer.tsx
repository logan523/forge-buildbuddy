"use client";

/**
 * Overlay layer — S1 scope: ghost fit-targets + dashed approach axes.
 *
 * For every part arriving in the NEXT phase, render the real part mesh
 * ghosted at its installed pose (the same renderer as the live part — never a
 * divergent silhouette) plus a dashed approach line with an arrowhead showing
 * the insertion direction. Data comes from ghost-target.ts, which reads the
 * same joints the assembly animation flies along.
 */
import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { AssemblyFrame, AssemblyRecipe, ProductScene3D, SceneNode3D } from "@/lib/product-3d";
import { ghostTargetsForFrame } from "@/lib/stage/ghost-target";
import { PartMesh } from "./parts-layer";

const GHOST_OPACITY = 0.16;

function ApproachArrow({
  from,
  to,
  rootScale,
}: {
  from: [number, number, number];
  to: [number, number, number];
  rootScale: number;
}) {
  const s = rootScale;
  const a: [number, number, number] = [from[0] * s, from[1] * s, from[2] * s];
  const b: [number, number, number] = [to[0] * s, to[1] * s, to[2] * s];
  // Cone sits just shy of the seat point, oriented along the approach.
  const dir = useMemo(() => {
    const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d) || 1;
    return { unit: [d[0] / len, d[1] / len, d[2] / len] as [number, number, number], len };
  }, [a, b]);
  const tip: [number, number, number] = [
    b[0] - dir.unit[0] * 0.02,
    b[1] - dir.unit[1] * 0.02,
    b[2] - dir.unit[2] * 0.02,
  ];
  // cylinderEuler convention: cone +Y → align to unit dir
  const yaw = Math.atan2(dir.unit[0], dir.unit[2]);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dir.unit[1])));
  return (
    <group>
      <Line
        points={[a, b]}
        color="#0e7490"
        lineWidth={1.5}
        dashed
        dashSize={0.045}
        gapSize={0.03}
        transparent
        opacity={0.85}
      />
      <mesh position={tip} rotation={[pitch, yaw, 0, "YXZ"]}>
        <coneGeometry args={[0.018, 0.05, 12]} />
        <meshBasicMaterial color="#0e7490" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export function GhostLayer({
  scene,
  recipe,
  frame,
}: {
  scene: ProductScene3D;
  recipe: AssemblyRecipe;
  frame: AssemblyFrame;
}) {
  const ghosts = useMemo(
    () => ghostTargetsForFrame(scene, recipe, frame),
    [scene, recipe, frame]
  );
  if (ghosts.length === 0) return null;
  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));
  return (
    <group>
      {ghosts.map((g) => {
        const node = nodeById.get(g.nodeId) as SceneNode3D | undefined;
        if (!node) return null;
        return (
          <group key={`ghost-${g.nodeId}`}>
            <PartMesh node={node} rootScale={scene.rootScale} opacity={GHOST_OPACITY} />
            <ApproachArrow from={g.approachFrom} to={g.approachTo} rootScale={scene.rootScale} />
          </group>
        );
      })}
    </group>
  );
}
