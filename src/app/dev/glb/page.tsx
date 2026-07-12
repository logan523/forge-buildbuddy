"use client";

/**
 * Dev-only GLB inspector — renders one authored/sourced part model cleanly,
 * unoccluded and well-lit, so we can eyeball geometry + orientation + scale.
 * Not linked from the app. Usage: /dev/glb?part=esp32_c3  (any id in public/models/parts).
 */
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid, useGLTF } from "@react-three/drei";
import { useSearchParams } from "next/navigation";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Inspector() {
  const params = useSearchParams();
  const part = params.get("part") || "esp32_c3";
  const url = `/models/parts/${part}.glb`;
  return (
    <div style={{ position: "fixed", inset: 0, top: 56, background: "#c4c9d2" }}>
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          top: 12,
          left: 12,
          color: "#e5e9f0",
          font: "13px ui-monospace, monospace",
          background: "rgba(0,0,0,0.55)",
          padding: "8px 10px",
          borderRadius: 8,
        }}
      >
        model: {url} · grid squares = 1&nbsp;mm · drag to orbit
      </div>
      {/* Model authored in mm → render 1 world unit = 1 mm. */}
      <Canvas shadows camera={{ position: [24, 18, 30], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={["#c4c9d2"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 20]} intensity={2.2} castShadow />
        <directionalLight position={[-18, 10, -12]} intensity={1.1} color="#bcd4ff" />
        <Suspense fallback={null}>
          <Environment preset="studio" />
          <Model url={url} />
        </Suspense>
        <Grid
          args={[80, 80]}
          cellSize={1}
          cellThickness={0.5}
          sectionSize={10}
          sectionThickness={1}
          cellColor="#2b3648"
          sectionColor="#3f6d55"
          position={[0, -1, 0]}
          infiniteGrid
          fadeDistance={140}
        />
        <OrbitControls makeDefault target={[0, 0, 1.4]} />
      </Canvas>
    </div>
  );
}

export default function GlbDevPage() {
  return (
    <Suspense fallback={<div style={{ color: "#889", padding: 24 }}>loading…</div>}>
      <Inspector />
    </Suspense>
  );
}
