"use client";

/**
 * Technical-light staging — the Stage reads like a CAD viewport on workshop
 * paper, not a photo studio: paper-neutral background (the page token),
 * hemisphere + one directional key for even, shadow-free form reading, and a
 * soft ContactShadows catcher for grounding. No IBL env map, no reflections,
 * no drama — matte parts + ink edge lines carry the look (parts-layer).
 */
import { ContactShadows } from "@react-three/drei";

/** Page background token (--color-bg) — the canvas must meet the page. */
const PAPER = "#f5f0e8";

export function EnvStudio({ groundY = 0 }: { groundY?: number }) {
  return (
    <>
      {/* Paper backdrop — same token as the page, so the stage sits ON it */}
      <color attach="background" args={[PAPER]} />

      {/* Even technical lighting: sky/ground hemisphere + one key. No shadow
          mapping — ContactShadows carries the grounding cue. */}
      <hemisphereLight args={["#ffffff", "#d9d2c4", 1.15]} />
      <directionalLight position={[3.5, 5.5, 4]} intensity={1.5} />

      {/* Grounding — the single strongest "it's a real object" cue */}
      <ContactShadows
        position={[0, groundY + 0.001, 0]}
        opacity={0.35}
        scale={14}
        blur={2.4}
        far={3.2}
        resolution={512}
        color="#6b675e"
        frames={1}
      />

      {/* Paper floor: fades into the background (same color, no horizon line) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.002, 0]}>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color={PAPER} roughness={1} metalness={0} />
      </mesh>
    </>
  );
}
