"use client";

/**
 * Studio staging — the default look for every project: a real-world item on a
 * neutral photo sweep. Soft HDRI IBL (local studio HDR), gentle key/fill,
 * ContactShadows grounding the product. No fog, no starfield, no drama —
 * clarity first (wires must read), realism from materials + light.
 */
import { ContactShadows, Environment } from "@react-three/drei";

export function EnvStudio({ groundY = 0 }: { groundY?: number }) {
  return (
    <>
      {/* Neutral photo-sweep backdrop */}
      <color attach="background" args={["#e8ebef"]} />

      {/* Image-based lighting from the local studio HDRI (no CDN) */}
      <Environment files="/hdri/studio_small_08_1k.hdr" environmentIntensity={0.75} />

      {/* Soft key + cool fill so forms model even where IBL is flat.
          No hard shadow casting — ContactShadows carries the grounding; a
          shadow-mapped key just stamps its camera bounds on the sweep. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[3.5, 5.5, 4]} intensity={1.35} />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.5} color="#dbe6f4" />

      {/* Grounding — the single strongest "it's a real object" cue */}
      <ContactShadows
        position={[0, groundY + 0.001, 0]}
        opacity={0.42}
        scale={14}
        blur={2.4}
        far={3.2}
        resolution={512}
        color="#5b6470"
        frames={1}
      />

      {/* Sweep floor: a huge soft-white disk fading into the background */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.002, 0]}>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color="#eef1f4" roughness={0.96} metalness={0} />
      </mesh>
    </>
  );
}
