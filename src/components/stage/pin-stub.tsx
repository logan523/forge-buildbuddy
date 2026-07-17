"use client";

/**
 * PinStub — the focus-gated pin hardware (copper pad + solder meniscus + gold
 * post + optional net-color ring). Shown ONLY on the focused part: scattered
 * across the whole assembly it reads as clutter (the S0-era lesson), but on a
 * selected/isolated part it's the wiring reference a builder needs.
 *
 * Data comes from pinStubsForNode (sat roles → exact table, catalog parts →
 * real-parts pins, unknown boards → derived header) — never hard-coded coords.
 */
import { Vector2 } from "three";
import { getProceduralMap } from "@/lib/product-3d";

export function PinStub({
  position,
  scale,
  opacity,
  netColor,
}: {
  position: [number, number, number];
  scale: number;
  opacity: number;
  netColor?: string;
}) {
  const s = scale;
  return (
    <group position={position}>
      {/* Copper annular pad */}
      <mesh position={[0, 0, -0.05 * s]}>
        <cylinderGeometry args={[1.05 * s, 1.1 * s, 0.18 * s, 12]} />
        <meshPhysicalMaterial
          color="#c47a3a"
          metalness={0.96}
          roughness={0.2}
          normalMap={getProceduralMap("copper_normal")}
          normalScale={new Vector2(0.8, 0.8)}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Solder meniscus */}
      <mesh position={[0, 0, 0.2 * s]}>
        <sphereGeometry args={[0.72 * s, 10, 10]} />
        <meshPhysicalMaterial color="#d4b06a" metalness={0.94} roughness={0.18} transparent opacity={opacity} />
      </mesh>
      {/* Gold pin post */}
      <mesh position={[0, 0, 1.15 * s]}>
        <boxGeometry args={[0.5 * s, 0.5 * s, 2.15 * s]} />
        <meshPhysicalMaterial color="#e2e8f0" metalness={0.96} roughness={0.1} transparent opacity={opacity} />
      </mesh>
      {netColor && (
        <mesh position={[0, 0, 0.75 * s]}>
          <torusGeometry args={[0.65 * s, 0.14 * s, 6, 12]} />
          <meshPhysicalMaterial color={netColor} roughness={0.4} transparent opacity={opacity} />
        </mesh>
      )}
    </group>
  );
}
