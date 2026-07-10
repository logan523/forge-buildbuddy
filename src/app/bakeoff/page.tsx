"use client";

/**
 * Track B bake-off (eng review): Forge's PARAMETRIC ESP32-C3 vs. a REAL
 * manufacturer model, side by side, same lighting. The question this answers
 * for the founder in one look: does a real LCSC/EasyEDA 3D model beat the
 * hand-built parametric part for a COMPLETE BEGINNER (identify the part, trace
 * a wire)?
 *
 * The real model is the ESP32-C3-MINI-1 module (LCSC C2934569) — the closest
 * real ESP32-C3 EasyEDA carries. The hero SKU (SuperMini dev board) has no
 * clean model, which is itself a finding. Sourced via scripts/fetch-part-model.mjs.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Html, Center } from "@react-three/drei";
import satLine from "@/data/sat-line.json";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { buildProductScene3D } from "@/lib/product-3d";
import { NodeMesh } from "@/components/product-node-mesh";
import { meshPinStubsForNode } from "@/lib/product-3d/sat-pins";
import type { LayerViewState } from "@/lib/product-3d/types";

const REAL_URL = "/models/parts/esp32c3_real.glb";
useGLTF.preload(REAL_URL);

const VIEW: LayerViewState = {
  visible: {},
  soloLayerId: null,
  explode: 0,
  selectedNodeId: null,
  present: {},
  isolateNodeId: null,
};

function Parametric() {
  const { node, rootScale, pins } = useMemo(() => {
    const plan = applyTrustPipeline(JSON.parse(JSON.stringify(satLine)) as BuildPlan);
    const scene = buildProductScene3D(plan);
    const esp = scene.nodes.find((n) => n.catalogId === "esp32_c3");
    // Drop it at the origin so the bake-off frames it cleanly.
    const centered = esp ? { ...esp, position: [0, 0, 0] as [number, number, number] } : null;
    return {
      node: centered,
      rootScale: scene.rootScale,
      pins: esp ? meshPinStubsForNode(esp.id) : [],
    };
  }, []);

  if (!node) return null;
  return (
    <group position={[-0.28, 0, 0]}>
      <NodeMesh node={node} view={VIEW} rootScale={rootScale} onSelect={() => {}} segments={48} suppressExplode />
      {/* Net-colored pins — the beginner signal a generic model can't carry */}
      {pins.map((p) => (
        <mesh key={p.name} position={[p.local[0] * rootScale, p.local[1] * rootScale, p.local[2] * rootScale]}>
          <sphereGeometry args={[0.012, 12, 12]} />
          <meshStandardMaterial
            color={p.netColor || "#e5c07b"}
            emissive={p.netColor || "#000000"}
            emissiveIntensity={p.netColor ? 0.5 : 0}
          />
        </mesh>
      ))}
      <Html position={[0, -0.16, 0]} center distanceFactor={1.2}>
        <div style={{ font: "600 12px ui-sans-serif", color: "#111", whiteSpace: "nowrap", opacity: 0.85 }}>
          Forge parametric — silkscreen + net-colored pins
        </div>
      </Html>
    </group>
  );
}

function RealModel() {
  const { scene } = useGLTF(REAL_URL);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return (
    <group position={[0.28, 0, 0]}>
      <Center>
        <primitive object={clone} scale={0.013} rotation={[-Math.PI / 2, 0, 0]} />
      </Center>
      <Html position={[0, -0.16, 0]} center distanceFactor={1.2}>
        <div style={{ font: "600 12px ui-sans-serif", color: "#111", whiteSpace: "nowrap", opacity: 0.85 }}>
          Real LCSC model — bare module, no pins/labels
        </div>
      </Html>
    </group>
  );
}

export default function BakeoffPage() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#e9ecef" }}>
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, maxWidth: 420 }}>
        <h1 style={{ font: "700 18px ui-serif", margin: 0 }}>ESP32-C3 bake-off</h1>
        <p style={{ font: "13px ui-sans-serif", color: "#333", lineHeight: 1.5 }}>
          Left: Forge&apos;s parametric part (silkscreen, and net-colored pins wired to the
          same authority as the harness — blue SDA pin → blue SDA wire). Right: a real
          manufacturer model (ESP32-C3-MINI-1, LCSC C2934569). Drag to orbit. The real one is
          the wrong form factor (module, not the SuperMini board) and carries none of the
          beginner signal. That&apos;s the decision.
        </p>
      </div>
      <Canvas camera={{ position: [0, 0.35, 0.75], fov: 40 }} shadows dpr={[1, 1.75]}>
        <color attach="background" args={["#e9ecef"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 2]} intensity={1.4} castShadow />
        <Suspense fallback={null}>
          <Environment files="/hdri/studio_small_08_1k.hdr" environmentIntensity={0.9} />
          <Parametric />
          <RealModel />
        </Suspense>
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
